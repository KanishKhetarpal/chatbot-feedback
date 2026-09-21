import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChatAgentsService } from '../src/modules/chat-agents/chat-agents.service';

/**
 * Permanently deletes the retired sales bots listed in
 * `sales-bots/bots/retired.json`, with their knowledge and conversations
 * (the same delete as the Chatbots page). Live ones are paused first.
 *
 *   pnpm db:delete-retired-bots
 */
async function main() {
  const names: string[] = JSON.parse(readFileSync(join(__dirname, 'sales-bots', 'bots', 'retired.json'), 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const agents = app.get(ChatAgentsService);

  const rows = await prisma.chatAgent.findMany({ where: { name: { in: names } }, select: { id: true, name: true, status: true } });
  for (const row of rows) {
    if (row.status === 'active') await prisma.chatAgent.update({ where: { id: row.id }, data: { status: 'paused' } });
    const result = await agents.remove(row.id);
    console.log(`Deleted "${row.name}"`, JSON.stringify((result as { deleted?: unknown }).deleted ?? {}));
  }
  console.log(`${rows.length} retired bot(s) deleted.`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
