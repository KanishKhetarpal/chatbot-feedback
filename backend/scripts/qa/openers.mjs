/**
 * Unit check for the filler-opener scrub (no server, no model, no database).
 *
 *   node backend/scripts/qa/openers.mjs
 *
 * The function is read out of the source and evaluated, so the test cannot
 * drift from what ships.
 */
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const src = readFileSync(`${here}../../src/modules/chat-agents/ui-block.util.ts`, 'utf8');
const section = src
  .slice(src.indexOf('const FILLER_OPENER ='), src.indexOf('/**', src.indexOf('export function stripFillerOpener')))
  .replace('export function', 'function')
  .replace('(text: string): string', '(text)');
const strip = new Function(`${section}\nreturn stripFillerOpener;`)();

const cases = [
  // what the two models actually wrote
  ['Good move, AIT offers CSE, AI & ML, ECE and more.', 'AIT offers CSE, AI & ML, ECE and more.'],
  ['Great field to pick, Acharya runs it under VTU.', 'Acharya runs it under VTU.'],
  ['Good choice - B.Sc Nursing is under RGUHS.', 'B.Sc Nursing is under RGUHS.'],
  ['No worries, take your time. Quick one so I can point you the right way.', 'Take your time. Quick one so I can point you the right way.'],
  ['Great question! Fees depend on the quota you get in on.', 'Fees depend on the quota you get in on.'],
  ['Sure, I can check that for you.', 'I can check that for you.'],
  ['Good to know. Which city are you writing from?', 'Which city are you writing from?'],
  // sentences that only look like one, and must survive untouched
  ['Goodbye for now, I will be here.', 'Goodbye for now, I will be here.'],
  ['Right of admission is decided by KEA.', 'Right of admission is decided by KEA.'],
  ['Fine arts is under AIGS.', 'Fine arts is under AIGS.'],
  ['Perfect attendance is 85% for the scholarship.', 'Perfect attendance is 85% for the scholarship.'],
  ['Okay.', 'Okay.'],
];

let wrong = 0;
for (const [input, want] of cases) {
  const got = strip(input);
  const ok = got === want;
  if (!ok) {
    wrong++;
    console.log(`BAD  in:   ${input}\n     out:  ${got}\n     want: ${want}`);
  } else {
    console.log(`ok   ${got}`);
  }
}
console.log(wrong ? `\n${wrong} wrong` : '\nall correct');
process.exit(wrong ? 1 : 0);
