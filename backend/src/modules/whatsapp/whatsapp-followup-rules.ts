import { z } from 'zod/v4';

/**
 * Follow-up rules: what to send a quiet lead, by the stage they are in.
 *
 * A rule matches stages, which are either CRM statuses exactly as the CRM
 * writes them ("Application_Initiated") or the bot's own stages prefixed
 * "bot:" ("bot:engaged"). A lead is on at most one rule at a time: the first
 * active matching rule by priority. When their stage changes, or they reply,
 * the ladder starts again from step 1.
 *
 * Each step waits `delayHours` from the ladder's anchor (their last message, or
 * the moment the rule took over), then sends either:
 *   - `ai`: a free-form message written by Tara toward `goal`. Only possible
 *     inside WhatsApp's 24h window; outside it the step is skipped.
 *   - `template`: an approved template, any time. `params` fill {{1}}, {{2}}…
 *     from tokens: first_name, course, city, counsellor, or literal text.
 * `when` gates on the read receipt of our last message.
 *
 * A rule may also be limited to a conversion-score range (`minScore` /
 * `maxScore`, see whatsapp-score.ts), so a hot lead can be chased within hours
 * while a cold one is left alone.
 */

export const STEP_WHEN = ['always', 'read_no_reply', 'not_read'] as const;
export type StepWhen = (typeof STEP_WHEN)[number];

export const PARAM_TOKENS = ['first_name', 'course', 'city', 'counsellor'] as const;

export const FollowupStepSchema = z.object({
  delayHours: z.number().min(0.25).max(24 * 60),
  action: z.enum(['ai', 'template']),
  goal: z.string().trim().max(600).optional(),
  template: z
    .object({
      name: z.string().trim().min(1).max(120),
      language: z.string().trim().min(2).max(20),
      params: z.array(z.string().trim().max(200)).max(10).default([]),
    })
    .optional(),
  when: z.enum(STEP_WHEN).default('always'),
});
export type FollowupStep = z.infer<typeof FollowupStepSchema>;

export const FollowupRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional().nullable(),
    active: z.boolean().default(true),
    priority: z.number().int().min(0).max(10_000).default(100),
    stages: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
    /** Conversion score range this ladder is for. Null = any score. */
    minScore: z.number().int().min(0).max(100).nullable().default(null),
    maxScore: z.number().int().min(0).max(100).nullable().default(null),
    steps: z.array(FollowupStepSchema).min(1).max(10),
    quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('20:30'),
    quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:30'),
  })
  .superRefine((rule, ctx) => {
    if (rule.minScore !== null && rule.maxScore !== null && rule.minScore > rule.maxScore) {
      ctx.addIssue({ code: 'custom', path: ['maxScore'], message: 'The top of the score range must be above the bottom.' });
    }
    rule.steps.forEach((step, i) => {
      if (step.action === 'ai' && !step.goal) ctx.addIssue({ code: 'custom', path: ['steps', i, 'goal'], message: 'An AI step needs a goal.' });
      if (step.action === 'template' && !step.template) ctx.addIssue({ code: 'custom', path: ['steps', i, 'template'], message: 'A template step needs a template.' });
      if (i > 0 && step.delayHours <= rule.steps[i - 1].delayHours) {
        ctx.addIssue({ code: 'custom', path: ['steps', i, 'delayHours'], message: 'Each step must come later than the one before.' });
      }
    });
  });
export type FollowupRuleInput = z.infer<typeof FollowupRuleSchema>;

/** The bot's own stages, for leads the CRM does not know (or before it is read). */
export const BOT_STAGES = ['bot:new', 'bot:engaged', 'bot:qualified', 'bot:counsellor', 'bot:lost'] as const;

/** The sales playbook the page starts with. Every one can be edited or switched off. */
export const DEFAULT_RULES: FollowupRuleInput[] = [
  {
    name: 'Chatting, then went quiet',
    description: 'They talked to Tara but stopped replying before we know what they want to study.',
    active: true,
    priority: 10,
    stages: ['bot:engaged', 'Warm', 'Prospect'],
    minScore: null,
    maxScore: null,
    steps: [
      { delayHours: 3, action: 'ai', when: 'always', goal: 'Re-engage with one concrete, useful thing about what they asked last, then one easy question.' },
      { delayHours: 21, action: 'ai', when: 'read_no_reply', goal: 'They read but did not reply. Offer a different angle: a counsellor call or a campus visit, as an easy either/or.' },
    ],
    quietStart: '20:30',
    quietEnd: '09:30',
  },
  {
    name: 'Knows the course, has not applied',
    description: 'We know what they want to study; the job is to move them to the application or a counsellor call.',
    active: true,
    priority: 20,
    stages: ['bot:qualified', 'Course_Details_Filled'],
    minScore: null,
    maxScore: null,
    steps: [
      { delayHours: 4, action: 'ai', when: 'always', goal: 'Move them one step toward applying: offer to check eligibility for their course or a counsellor call. Use something they told you.' },
      { delayHours: 22, action: 'ai', when: 'always', goal: 'Last message before the chat window closes: the scholarship they may match, or a campus visit, as the hook.' },
    ],
    quietStart: '20:30',
    quietEnd: '09:30',
  },
  {
    name: 'Hot lead, gone quiet',
    description: 'They asked for a call, a visit or the application, and then stopped. Chase this one fast.',
    active: true,
    priority: 1,
    stages: ['bot:engaged', 'bot:qualified', 'bot:counsellor', 'Warm', 'Prospect', 'Course_Details_Filled'],
    minScore: 70,
    maxScore: null,
    steps: [
      { delayHours: 1, action: 'ai', when: 'always', goal: 'Pick up exactly where they stopped, with the one thing they asked for, and make the next step a single tap.' },
      { delayHours: 5, action: 'ai', when: 'always', goal: 'Offer the counsellor by name if we know it, as an either/or: a call this evening, or the application walked through with them.' },
      { delayHours: 20, action: 'ai', when: 'read_no_reply', goal: 'They are reading and not answering. Ask the one question that unblocks them: what is holding the decision up.' },
    ],
    quietStart: '20:30',
    quietEnd: '09:30',
  },
  {
    name: 'Application open, fee not paid',
    description: 'The form is started but the application fee has not been paid, so the office has not seen it. This is the money step.',
    active: true,
    priority: 2,
    stages: ['Application_Initiated', 'Course_Details_Filled', 'bot:qualified'],
    minScore: 40,
    maxScore: null,
    steps: [
      {
        delayHours: 3,
        action: 'ai',
        when: 'always',
        goal:
          'Their application is open but the fee is not paid, so admissions has not seen it. Say what paying does (the application reaches the office, a counsellor checks eligibility and documents), name the figure ONLY if the KNOWN block has applicationFee, and ask what is left to sort out. No deadline, no scarcity.',
      },
      {
        delayHours: 20,
        action: 'ai',
        when: 'always',
        goal:
          'Offer to have the counsellor finish the application and the payment with them on a short call, or answer the one thing that is holding it up. Never repeat yesterday\'s wording.',
      },
      {
        delayHours: 48,
        action: 'ai',
        when: 'read_no_reply',
        goal:
          'Last try on the application: give one genuinely new, useful fact for their course (placements, scholarship route, hostel) and leave the door open with an easy question. Do not mention the payment twice in this message.',
      },
    ],
    quietStart: '20:30',
    quietEnd: '09:30',
  },
  {
    name: 'Application started, not submitted',
    description: 'Their application is open in the CRM. Help them finish it.',
    active: true,
    priority: 5,
    stages: ['Application_Initiated'],
    minScore: null,
    maxScore: null,
    steps: [
      { delayHours: 6, action: 'ai', when: 'always', goal: 'Help them finish the application: ask what is pending (documents, marks, payment step) and offer to walk them through it.' },
      { delayHours: 22, action: 'ai', when: 'always', goal: 'Offer their counsellor to finish the application with them on a short call; name the counsellor if known.' },
    ],
    quietStart: '20:30',
    quietEnd: '09:30',
  },
  {
    name: 'Application submitted',
    description: 'Submitted: tell them what happens next and keep them warm.',
    active: true,
    priority: 30,
    stages: ['Application_Submitted'],
    minScore: null,
    maxScore: null,
    steps: [{ delayHours: 20, action: 'ai', when: 'always', goal: 'Tell them what happens next (eligibility check, offer) and offer a campus visit or hostel details while they wait.' }],
    quietStart: '20:30',
    quietEnd: '09:30',
  },
];

/** Minutes since midnight IST for a date. */
function istMinutes(at: Date): number {
  const ist = new Date(at.getTime() + 5.5 * 3600_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Push a time out of the rule's quiet hours (IST) to the moment they end. */
export function outOfQuietHours(at: Date, quietStart: string, quietEnd: string): Date {
  const start = toMinutes(quietStart);
  const end = toMinutes(quietEnd);
  const now = istMinutes(at);
  const quiet = start > end ? now >= start || now < end : now >= start && now < end;
  if (!quiet) return at;
  let wait = end - now;
  if (wait <= 0) wait += 24 * 60;
  return new Date(at.getTime() + wait * 60_000);
}
