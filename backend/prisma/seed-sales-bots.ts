import 'dotenv/config';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChatAgentsService } from '../src/modules/chat-agents/chat-agents.service';
import { KnowledgeService } from '../src/modules/chat-agents/knowledge.service';
import { TrainingService } from '../src/modules/chat-agents/training.service';
import type { CreateChatAgentDto } from '../src/modules/chat-agents/dto/create-chat-agent.dto';

/**
 * Seeds the sales-persona chatbots from `prisma/sales-bots/`.
 *
 *   sales-bots/
 *   ├─ knowledge/*.md      shared knowledge base — every bot gets a copy as a text source
 *   └─ bots/*.md           one file per bot: a JSON header between `---` lines (the
 *                          agent settings) followed by the Instructions prompt body
 *
 * Idempotent. A bot is matched by `name`: an existing one has its settings and
 * prompt updated in place (its conversations are kept); knowledge sources are
 * replaced only when their content changed; the bot is retrained when needed
 * and set to `active`.
 *
 *   pnpm db:seed:bots            # everything
 *   pnpm db:seed:bots -- priya   # only files whose name contains "priya"
 */

const ROOT = join(__dirname, 'sales-bots');
const BOTS_DIR = join(ROOT, 'bots');
const KNOWLEDGE_DIR = join(ROOT, 'knowledge');

interface BotFile {
  file: string;
  settings: Partial<CreateChatAgentDto> & {
    name: string;
    status?: 'draft' | 'active' | 'paused';
    /** Optional scripted chip menu (see schemas/guided-flow.schema.ts). null clears it. */
    guidedFlow?: unknown;
    /** Earlier names of this bot, so a rename updates the same row (and keeps its conversations). */
    previousNames?: string[];
  };
  instructions: string;
}

function parseBotFile(file: string): BotFile {
  const raw = readFileSync(join(BOTS_DIR, file), 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: expected a JSON header between --- lines`);
  let settings: BotFile['settings'];
  try {
    settings = JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`${file}: header is not valid JSON — ${(e as Error).message}`);
  }
  if (!settings.name) throw new Error(`${file}: header needs a "name"`);
  return { file, settings, instructions: m[2].trim() };
}

function loadKnowledge(): Array<{ name: string; description: string; content: string }> {
  return readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const content = readFileSync(join(KNOWLEDGE_DIR, f), 'utf8').replace(/\r\n/g, '\n').trim();
      const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f.replace(/\.md$/, '');
      return {
        name: title,
        description:
          'Official information about Acharya Institutes, Bangalore for admissions enquiries: institutions, programmes, eligibility, admission process, fees policy, scholarships, placements, hostel and campus life, contact details.',
        content,
      };
    });
}

async function main() {
  const filter = (process.argv.slice(2).find((a) => a !== '--') ?? '').toLowerCase();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  const agents = app.get(ChatAgentsService);
  const knowledge = app.get(KnowledgeService);
  const training = app.get(TrainingService);

  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('No admin account. Run `pnpm db:seed` first.');

  const knowledgeDocs = loadKnowledge();
  if (knowledgeDocs.length === 0) throw new Error(`No knowledge files in ${KNOWLEDGE_DIR}`);

  const files = readdirSync(BOTS_DIR)
    .filter((f) => f.endsWith('.md') && (!filter || f.toLowerCase().includes(filter)))
    .sort();
  if (files.length === 0) throw new Error(`No bot files in ${BOTS_DIR}${filter ? ` matching "${filter}"` : ''}`);

  for (const file of files) {
    const bot = parseBotFile(file);
    const { name, status: wantedStatus, guidedFlow, previousNames = [], ...rest } = bot.settings;
    const dto = { ...rest, name, instructions: bot.instructions } as CreateChatAgentDto;

    // ── Agent ────────────────────────────────────────────────────────────────
    const existing =
      (await prisma.chatAgent.findFirst({ where: { name }, select: { id: true } })) ??
      (previousNames.length
        ? await prisma.chatAgent.findFirst({ where: { name: { in: previousNames } }, select: { id: true } })
        : null);
    const agent = existing ? await agents.update(existing.id, dto) : await agents.create(dto, admin.id);
    console.log(`${existing ? 'Updated' : 'Created'} "${name}" (${agent.id}) from ${file}`);

    // ── Scripted chip menu ───────────────────────────────────────────────────
    // Always written, so removing it from a file also removes it from the bot.
    await agents.updateGuidedFlow(agent.id, (guidedFlow ?? null) as never);
    if (guidedFlow) console.log('  guided chip menu set');

    // ── Knowledge ────────────────────────────────────────────────────────────
    const sources = await prisma.chatAgentKnowledgeSource.findMany({
      where: { agentId: agent.id, type: 'text' },
      select: { id: true, name: true, location: true },
    });
    for (const doc of knowledgeDocs) {
      const current = sources.find((s) => s.name === doc.name);
      if (current && current.location.trim() === doc.content) {
        console.log(`  knowledge "${doc.name}" unchanged`);
        continue;
      }
      if (current) await knowledge.delete(current.id);
      await knowledge.create({ type: 'text', agentId: agent.id, name: doc.name, content: doc.content, description: doc.description });
      console.log(`  knowledge "${doc.name}" ${current ? 'replaced' : 'added'} (${doc.content.length.toLocaleString()} chars)`);
    }

    // ── Train + activate ─────────────────────────────────────────────────────
    const state = await training.getTrainingState(agent.id);
    if (!state.hasPack || state.needed) {
      const result = await training.train(agent.id, admin.id);
      console.log(`  trained → pack v${result.pack.version}, ${result.pack.tokenCount.toLocaleString()} tokens`);
    } else {
      console.log(`  pack v${state.pack?.version} up to date (${state.pack?.tokenCount.toLocaleString()} tokens)`);
    }

    const status = wantedStatus ?? 'active';
    await agents.update(agent.id, { status } as never);
    const row = await prisma.chatAgent.findUniqueOrThrow({ where: { id: agent.id }, select: { publicKey: true } });
    console.log(`  status=${status} · share: /s/${row.publicKey} · chat: /chat/${row.publicKey}`);
  }

  // ── Retired bots ──────────────────────────────────────────────────────────
  // Names in bots/retired.json are paused (hidden from testers), never deleted:
  // their conversations stay reviewable in Conversations.
  const retiredFile = join(BOTS_DIR, 'retired.json');
  if (!filter && existsSync(retiredFile)) {
    const names = JSON.parse(readFileSync(retiredFile, 'utf8')) as string[];
    const paused = await prisma.chatAgent.updateMany({
      where: { name: { in: names }, status: { not: 'paused' } },
      data: { status: 'paused' },
    });
    console.log(`Paused ${paused.count} retired bot(s).`);
  }

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
