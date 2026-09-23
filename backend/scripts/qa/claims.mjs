/**
 * Unit check for the claim scrub (no server, no model, no database).
 *
 *   node backend/scripts/qa/claims.mjs
 *
 * The function is read out of the source and evaluated, so the test cannot drift
 * from the code: the whole function is read out of the source and
 * evaluated, so the test cannot drift from the code (or lose a backslash on the
 * way in, which an earlier copy of this test did).
 */
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const src = readFileSync(`${here}../../src/modules/chat-agents/ui-block.util.ts`, 'utf8');
const from = src.indexOf('const UNSUPPORTED_CLAIM = new RegExp(');
const to = src.indexOf('export function extractReplyParts(');
const section = src
  .slice(from, to)
  .replace(/export function/g, 'function')
  .replace(/: \{ text: string; removed: string\[\] \}/g, '')
  .replace(/: string(?=\))/g, '')
  .replace(/const removed: string\[\] = \[\]/g, 'const removed = []');

const scrub = new Function(`${section}\nreturn scrubUnsupportedClaims;`)();

const cases = [
  // the sentences the two models actually wrote
  ['CSE is a strong pick, high demand and solid placement record at AIT.', 'CSE is a strong pick.'],
  // in a real reply a question follows, so the claim sentence can go entirely
  ['CSE is one of the most sought-after branches at AIT, under VTU. What are you leaning towards?', 'What are you leaning towards?'],
  ['CSE is one of the most in-demand branches at Acharya, especially for placements. Which specialisation interests you?', 'Which specialisation interests you?'],
  ['CSE typically sees the highest demand of all the branches, so seats fill at sharper ranks. What is your KCET rank?', 'What is your KCET rank?'],
  ['Exact seat-fill data is not published, but CSE has the highest demand.', 'Exact seat-fill data is not published.'],
  // facts standing beside a claim
  ['Acharya has 12 hostels on campus, and CSE is in high demand.', 'Acharya has 12 hostels on campus.'],
  ['AI & ML is very popular. Placements are about 90% with 550+ recruiters.', 'Placements are about 90% with 550+ recruiters.'],
  // left alone
  ['Want me to find the best branch for you?', 'Want me to find the best branch for you?'],
  ['Placements are about 90%, with 550+ recruiters on campus.', 'Placements are about 90%, with 550+ recruiters on campus.'],
  ['The counsellor confirms seat availability for your quota.', 'The counsellor confirms seat availability for your quota.'],
  // a denial of the claim is the behaviour we want: left alone
  ["I don't have official numbers to say which branch fills up fastest.", "I don't have official numbers to say which branch fills up fastest."],
  ['Acharya does not publish which branch is in high demand.', 'Acharya does not publish which branch is in high demand.'],
  ['CSE is in high demand, though I have no figures. What is your rank?', 'What is your rank?'],
  // a message that is only a claim keeps its words rather than going blank
  ['It fills up fast.', 'It fills up fast.'],
];

let wrong = 0;
for (const [input, want] of cases) {
  const got = scrub(input).text.trim();
  const expected = want.trim();
  const ok = got === expected;
  if (!ok) wrong++;
  console.log(`${ok ? 'ok  ' : 'BAD '} in:  ${input}`);
  console.log(`     out: ${got || '(sentence dropped)'}`);
  if (!ok) console.log(`     want: ${expected || '(sentence dropped)'}`);
}
console.log(wrong ? `\n${wrong} wrong` : '\nall correct');
