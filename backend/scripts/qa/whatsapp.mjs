/**
 * The WhatsApp bot, end to end, through the in-app simulator.
 *
 * Seven scenarios covering who actually writes to the number, each checked
 * against the owner's rules: short replies, one question, no filler openers,
 * sane buttons, and no answering of things only a counsellor may answer.
 *
 *   node qa-wa-suite.mjs [scenario]
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.QA_BASE ?? 'http://localhost:3100/api/v1';
const only = process.argv[2];
const prisma = new PrismaClient();

let token = '';
const login = async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: process.env.QA_USER ?? 'admin', password: process.env.QA_PASS ?? '' }),
  });
  ({ accessToken: token } = await res.json());
};
const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

/** Facts the CRM would have supplied, per scenario. */
const CRM = {
  applicant: {
    audience: 'prospective',
    crmChecked: true,
    crmStatus: 'Application_Initiated',
    counsellor: 'Anil',
    applicationStatus: 'Application_Initiated',
    applicationProgress: '100% of the form filled',
    applicationFee: 'Rs 1,000',
    applicationFeeStatus: 'not paid yet',
  },
  paid: {
    audience: 'prospective',
    crmChecked: true,
    crmStatus: 'Application_Submitted',
    counsellor: 'Anil',
    applicationStatus: 'Application_Submitted',
    applicationFee: 'Rs 1,000',
    applicationFeeStatus: 'paid',
  },
  student: { audience: 'student', crmChecked: true },
  none: { crmChecked: true },
};

const SCENARIOS = {
  fresh: { facts: CRM.none, script: ['hi', 'i want to do engineering', 'cse', 'my kcet rank is 22000', 'what about hostel', 'how much is the fee'] },
  applicant: { facts: CRM.applicant, script: ['hi', 'what is left on my application', 'why should i pay now', 'is it refundable', 'ok fine how do i pay'] },
  hesitating: { facts: CRM.applicant, script: ['hey', 'application fee kitna hai', 'too costly for me', 'let me think', 'ok tell me about the app offer'] },
  paid: { facts: CRM.paid, script: ['hi', 'whats the status of my application', 'when will i get the offer', 'can i change my course'] },
  student: { facts: CRM.student, script: ['hi', 'i need a bonafide certificate', 'ok', 'also my hostel room has an issue'] },
  parent: { facts: CRM.none, script: ['hello', 'i am asking for my daughter', 'she wants nursing', 'is the campus safe for girls', 'what are the fees'] },
  noise: { facts: CRM.none, script: ['hi', '??', 'asdf', 'k', 'stop', 'start'] },
};

const clean = (t) => (t ?? '').replace(/\s+/g, ' ').trim();

async function reset(waId) {
  const existing = await prisma.whatsappContact.findUnique({ where: { waId } });
  if (!existing) return;
  await prisma.whatsappMessage.deleteMany({ where: { contactId: existing.id } });
  await prisma.chatWidgetMessage.deleteMany({ where: { visitorId: existing.visitorId } });
  await prisma.whatsappContact.update({
    where: { id: existing.id },
    data: { stage: 'new', handoffAt: null, handoffReason: null, botPausedUntil: null, optedOutAt: null, followupCount: 0, nextFollowupAt: null, pendingOptions: undefined },
  });
  await prisma.chatWidgetVisitor.update({ where: { id: existing.visitorId }, data: { name: null, courseInterest: null, location: null, custom: {} } });
}

async function run(name, waId, facts, script) {
  console.log(`\n══════════ ${name} (${waId}) ══════════`);
  await reset(waId);
  const issues = [];
  let first = true;
  let turn = 0;
  const seen = new Set();

  for (const text of script) {
    const out = await post('/whatsapp/simulate', { waId, text, profileName: 'QA', live: false });
    if (first) {
      const c = await prisma.whatsappContact.findUniqueOrThrow({ where: { waId } });
      const v = await prisma.chatWidgetVisitor.findUniqueOrThrow({ where: { id: c.visitorId } });
      await prisma.chatWidgetVisitor.update({ where: { id: c.visitorId }, data: { custom: { ...(v.custom ?? {}), ...facts } } });
      first = false;
    }
    turn++;
    console.log(`\n> ${text}`);
    const bodies = [];
    for (const m of out.outbound ?? []) {
      const body = clean(m.body ?? m.url ?? '');
      bodies.push(body);
      console.log(`  [${m.kind}] ${(m.body ?? m.url ?? '').replace(/\n/g, '\n      ')}`);
      const opts = (m.options ?? []).map((o) => o.title);
      if (opts.length) console.log(`      buttons: ${opts.join(' | ')}`);

      // ── the owner's rules ────────────────────────────────────────────
      if (opts.length > 3) issues.push(`turn ${turn}: ${opts.length} buttons`);
      for (const o of opts) {
        if (o.length > 20) issues.push(`turn ${turn}: button over 20 chars: "${o}"`);
        if (/^(other|tell me more|more)$/i.test(o)) issues.push(`turn ${turn}: filler button "${o}"`);
      }
      const words = body.split(/\s+/).filter(Boolean).length;
      if (m.kind !== 'template' && words > 70) issues.push(`turn ${turn}: ${words} words`);
      const questions = (body.match(/\?/g) ?? []).length;
      if (questions > 1) issues.push(`turn ${turn}: ${questions} questions in one message`);
      if (/^(good|great|nice|sure|absolutely|fair|no worries|thanks for asking)\b/i.test(body)) {
        issues.push(`turn ${turn}: filler opener "${body.slice(0, 30)}"`);
      }
      if (/ — | – /.test(body)) issues.push(`turn ${turn}: dash as punctuation`);
      if (/\p{Extended_Pictographic}/u.test(body)) issues.push(`turn ${turn}: emoji`);
      if (/most sought[- ]after|most popular|fills? fastest|in high demand|best branch|top branch|limited seats|last date/i.test(body)) {
        issues.push(`turn ${turn}: a ranking or urgency claim the knowledge does not make`);
      }
      if (body && seen.has(body)) issues.push(`turn ${turn}: repeated a message word for word`);
      if (body) seen.add(body);
    }
    if ((out.outbound ?? []).length > 2) issues.push(`turn ${turn}: ${out.outbound.length} messages at once`);
    if (out.handoff) console.log(`  → handoff: ${out.handoff}`);

    // A fee figure may only ever be the application fee we were given.
    const joined = bodies.join(' ');
    const rupees = joined.match(/(?:Rs\.?|₹|INR)\s?[\d,]{3,}/gi) ?? [];
    for (const amount of rupees) {
      const flat = amount.replace(/\s/g, '');
      const allowed = (facts.applicationFee && flat.includes('1,000')) || flat.includes('500');
      if (!allowed) issues.push(`turn ${turn}: quoted a figure it should not: "${amount}"`);
    }
  }

  const c = await prisma.whatsappContact.findUniqueOrThrow({ where: { waId } });
  console.log(`\nstage=${c.stage} score=${c.score} (${c.scoreBand}) optedOut=${c.optedOutAt ? 'yes' : 'no'}`);
  console.log(issues.length ? `── ${issues.length} issue(s)` : '── clean');
  for (const i of issues) console.log(`  ! ${i}`);
  return issues.length;
}

await login();
let total = 0;
let n = 910000100000;
for (const [name, { facts, script }] of Object.entries(SCENARIOS)) {
  n++;
  if (only && name !== only) continue;
  total += await run(name, String(n), facts, script);
}
console.log(`\n═══ ${total} issue(s) across the WhatsApp run ═══`);
await prisma.$disconnect();
