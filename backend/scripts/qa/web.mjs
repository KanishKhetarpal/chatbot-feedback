/**
 * Scripted QA for the combined web bot (Shreya).
 *
 * Runs whole conversations through POST /api/v1/widget/chat exactly as the
 * widget does, then checks the house rules: one question per reply, the plan
 * arriving, the details ask carrying a reason, and the server-side gate.
 *
 *   node qa-web.mjs <publicKey> [scenario]
 */
const BASE = process.env.QA_BASE ?? 'http://localhost:3100/api/v1';
const publicKey = process.argv[2];
if (!publicKey) throw new Error('usage: node qa-web.mjs <publicKey> [scenario]');
const only = process.argv[3];

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: process.env.QA_ORIGIN ?? 'http://localhost:5173' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

const split = (text = '') => ({
  text: text.replace(/<(ui|plan|media|next|then)>[\s\S]*?<\/\1>/g, '').trim(),
  ui: text.match(/<ui>([\s\S]*?)<\/ui>/)?.[1] ?? null,
  plan: text.match(/<plan>([\s\S]*?)<\/plan>/)?.[1] ?? null,
  then: text.match(/<then>([\s\S]*?)<\/then>/)?.[1] ?? null,
  next: text.match(/<next>([\s\S]*?)<\/next>/)?.[1] ?? null,
});

const SCENARIOS = {
  fees: ['How much are the fees for CSE?', 'Around 20000 KCET rank', 'Are there scholarships for that rank?', 'What about the hostel?', 'Ok and placements?', 'Tell me about the labs'],
  quiz: ['Find my best-fit course', 'Science (PCM)', 'Coding and tech', 'A tech company job', 'KCET', 'Placements', 'Why is #1 my best fit?'],
  eligibility: ['Check my eligibility', 'Programme: Engineering (B.E.) · 12th stream: PCM · Marks in the key subjects: 45% to 60% · Entrance exam: KCET', 'What if my rank is bad?', 'Ok what next', 'Can I visit the campus?'],
  parent: ["I'm asking for my daughter, is the campus safe?", 'She wants nursing', 'What are the timings for the hostel?', 'How do we apply?', 'And the fees?', 'Anything else we should know?'],
  browsing: ['just looking around for now', 'what courses do you have', 'mba maybe', 'ok', 'hmm', 'fine'],
};

const run = async (name, messages) => {
  console.log(`\n══════════ ${name} ══════════`);
  let visitorToken = null;
  let replyNo = 0;
  const issues = [];
  const asks = [];
  for (const message of messages) {
    const body = visitorToken ? { visitorToken, message } : { publicKey, message };
    const out = await post('/widget/chat', body);
    visitorToken = out.visitorToken ?? visitorToken;
    replyNo++;
    const parts = split(out.reply ?? '');
    console.log(`\n[${replyNo}] > ${message}`);
    console.log(`    ${parts.text.replace(/\n/g, '\n    ') || '(no text)'}`);
    if (parts.plan) console.log(`    PLAN ${parts.plan.slice(0, 110)}…`);
    if (parts.ui) console.log(`    UI   ${parts.ui.slice(0, 160)}…`);
    if (parts.then) console.log(`    THEN ${parts.then}`);
    if (parts.next) console.log(`    NEXT ${parts.next}`);
    if (out.followup) {
      const f = split(out.followup.content);
      console.log(`    ASK  ${f.text}`);
      console.log(`    FORM ${f.ui}`);
      asks.push(f);
    }

    // ── rules ────────────────────────────────────────────────────────────
    const questions = (parts.text.match(/\?/g) ?? []).length + (parts.then?.includes('?') ? 1 : 0);
    if (questions > 1) issues.push(`reply ${replyNo}: ${questions} questions in one reply`);
    if (/\b(world-class|state-of-the-art|vibrant|holistic|cutting-edge|seamless|rest assured|top-notch)\b/i.test(parts.text)) {
      issues.push(`reply ${replyNo}: banned adjective`);
    }
    if (/^(Great|Sure|Absolutely|Certainly|Of course|Thanks for asking|I'd be happy)/i.test(parts.text)) {
      issues.push(`reply ${replyNo}: filler opener`);
    }
    if (/ — | – /.test(parts.text)) issues.push(`reply ${replyNo}: dash as punctuation`);
    if (parts.text.split(/\s+/).length > 90) issues.push(`reply ${replyNo}: ${parts.text.split(/\s+/).length} words`);
  }

  // ── the details ask must sell, not demand ───────────────────────────────
  for (const ask of asks) {
    const text = ask.text ?? '';
    const bare = /^(what|can i get|may i have|please share)?\s*(your )?(name and )?(number|phone|mobile)/i.test(text);
    if (bare) issues.push(`details ask is bare: "${text}"`);
    if (!/counsell?or|send|check|confirm|work out|walk you|sends?/i.test(text)) {
      issues.push(`details ask names nothing a counsellor does: "${text}"`);
    }
    if (text.split(/\s+/).length < 8) issues.push(`details ask is abrupt: "${text}"`);
  }

  console.log(`\n── ${issues.length ? `${issues.length} issue(s)` : 'clean'} ──`);
  for (const i of issues) console.log(`  ! ${i}`);
  return issues.length;
};

let total = 0;
for (const [name, messages] of Object.entries(SCENARIOS)) {
  if (only && name !== only) continue;
  total += await run(name, messages);
}
console.log(`\n═══ ${total} issue(s) across the run ═══`);
