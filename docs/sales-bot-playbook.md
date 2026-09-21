# Sales-bot playbook: what converts, and the ten test personas

Two rounds of research, 19 September 2026. Round one covered vendor playbooks and sales frameworks. Round two went deeper: documented conversion case studies (Drift, Intercom, Landbot, Tidio, Manychat, Qualified, Conversica, Structurely, Ylopo, Roof AI, 11x, Artisan), the evidence base for persuasion techniques, quiz-funnel and lead-magnet benchmarks, public system prompts for sales and appointment-setting agents, objection-handling scripts, and Indian education and WhatsApp case studies (AiSensy, Interakt, Haptik, Gupshup, LeadSquared, Meritto, ExtraaEdge, CollegeDekho, plus live flows on Manipal, Jain, Presidency, LPU, Amity, Byju's, Acharya).

The bots live in `backend/prisma/sales-bots/bots/*.md` and are created, trained and activated with `pnpm db:seed:bots` from the `backend` folder. Shared rules live in the lead-capture block of `backend/src/modules/chat-agents/prompt.util.ts`.

## 1. What the evidence actually supports

Most "chatbot conversion" numbers online are vendor claims without denominators. The findings below are limited to things with a real study, a large dataset, or agreement across independent practitioners.

**Speed and a concrete next step are the two strongest levers.**
- MIT/InsideSales 2007 (15,000 leads): contacting within 5 minutes makes contact about 100 times more likely than at 30 minutes. HBR 2011 audit of 2,241 companies: within an hour is 7 times more likely to qualify.
- Gong call analytics (8,382 deals): 5 percent close rate when no next step is discussed, 20 percent when it is. So the bot should always propose a specific next step with a time choice ("today or tomorrow, morning or afternoon").

**Foot-in-the-door is the only persuasion technique with a direct chatbot randomised trial.** A trivial first ask made users 2.5 times as likely to accept a bigger one (Adam, Wessel and Benlian 2020). Meta-analyses put the average gain at 11 to 12 percentage points. Every persona therefore starts with an easy question, never the number.

**Loss framing and door-in-the-face are close to zero in the data.** Loss versus gain framing shows an effect around r = 0.03. Door-in-the-face has no significant effect on actual behaviour. Scarcity and countdown cues raise intent in lab studies but cut trust, and "false urgency" is a named dark pattern under India's 2023 CCPA guidelines. The scholarship bot was rewritten to drop its loss line.

**Progress markers and finishing what you started are real.** Endowed-progress studies show completion going from 19 to 34 percent when people see they are already part-way. The resumption effect (people return to finish an interrupted task) replicates; the memory version of the Zeigarnik effect does not. The eligibility, scholarship and quiz bots now say "step 2 of 3".

**Reactance is the main risk in text-only channels.** Controlling language ("you must", "don't miss") measurably reduces persuasion, and text-only formats produce more reactance than text with images. "But you are free" wording has a small measured effect but is the cheapest antidote, so every ask carries an explicit out.

**Bot disclosure.** In the one rigorous study (Luo et al. 2019, 6,200 customers), announcing "I am a bot" before the conversation cut purchases by about 80 percent, while disclosing after value was delivered cost almost nothing. Denying it when asked is unethical and, for EU visitors, illegal from August 2026. Rule adopted: never volunteer it in the greeting, never deny it, answer with capability first ("I'm the admissions chat assistant, I can answer eligibility, hostel and placements right here") plus an instant human route.

**Where to ask, and for what.**
- Field-level form data (Zuko, 1,362 forms): phone has the highest median abandonment of the contact fields. Multi-step forms that put contact details last convert best (Venture Harbour, Formstack 13.9 versus 4.5 percent).
- Practitioner consensus: no contact ask in the first two or three messages; ask at an intent signal (fee, timeline, "how to apply") or when offering a concrete deliverable; ask for only the channel you will use.
- Quiz funnels: 40 percent of quiz starters convert to a lead on Interact's 100 million lead dataset, but that is starters, not visitors. The best gate is a teaser result shown free with the full report behind the number ("Where should we send your results?"). Riddle's A/B test: a mandatory gate captured 34 percent versus 24 percent for a skippable one, with identical lead quality.
- Lead-magnet benchmarks (MailerLite, 41,000 forms): interactive or personalised tools 26 percent, generic ebooks 25 percent, so the format matters less than offering it mid-conversation to someone who has stated an interest.

**The Conversica shape is the cleanest published script.** Reference the trigger, ask one low-commitment question, name a specific human and action ("Mike would like to give you a call"), ask for the number as logistics ("Is this the best number for Mike?"), and close with what happens next and when. Vendor benchmarks agree hot leads come from persistence (half of Conversica's hot leads arrive on attempts 3 to 7), which in a website chat means the follow-up promise has to be kept.

**India specifics.** Every university form observed (Manipal, Jain, Presidency) is mobile plus OTP with a consent line naming WhatsApp and voice calls. On WhatsApp the number is already known, so bots there open with the qualifier (UG or PG, course, exam, city). The callback with a time-slot picker is the product ("Schedule a call": LPU, Byju's). Universities are ungating brochures and using "get it on WhatsApp" to open the channel. Under the DPDP Act consent must be specific to the purpose, so every capture says what the number is used for and that they can stop.

## 2. Rules now written into every persona (shared block)

1. One question per message, at the end. Two to four sentences.
2. Name asked in the first one to three replies, casually, with a reason.
3. Phone asked as a delivery address or as logistics for a named person, never as "contact details". Say what they get, who sends it, when, and that the number is used only for that.
4. Say the deliverable already exists before asking where to send it.
5. Give an honest out in the same breath when the visitor hesitates.
6. Never in the first two replies, never in consecutive replies, at most twice per conversation. A no is final unless the visitor later asks for something that needs it.
7. Objection scripts for: "just tell me the fee", "I'll call you myself", "no spam", "just browsing", "comparing colleges", "my parents decide", "too expensive", "are you a bot".
8. Never invent fees, dates, cut-offs, seats or placement numbers. Unknown figures become the reason for a counsellor follow-up, but a fact the bot has is never hidden behind a number.
9. Record what was learned in a hidden facts tag; the backend stores name, phone, course, city and more on the conversation.

## 3. The six bots (round four, 21 September 2026)

Feedback on round three: the bots sounded like information desks ("AI slop"), repeated themselves, pushed for the number again after a no, showed photos on every reply, and left visitors stuck behind forms. Round four is a rewrite around how real chat reps sell.

**What changed for every AI bot, and why**

| Pattern | Source |
|---|---|
| Specific opener, never "How can I help?" | Drift conversational playbooks |
| One question per message, spread across the chat | Gong call data (top reps ask 11 to 14 questions, spread out) |
| Mirror and label ("Sounds like safety is the big one for your parents") | Chris Voss |
| Give a win before any ask; reason + benefit when asking | Langer 1978: 60% to 94% compliance with a reason |
| Small yeses first ("Want me to check your eligibility?") | Freedman and Fraser 1966: 17% to 76% |
| Numbers, not adjectives; a banned-words list | Anti-slop rules |
| Either/or close with real slots | Live-chat sales scripts |
| Open loops in a second bubble ("While you're deciding, want a look at…") | Feedback: this worked best in testing |
| Number asked at most twice; after a no or a skipped form, only if the visitor picks something that needs it | Feedback + DPDP purpose-specific consent |
| Every form has "Not now" and suggestions next to it | Feedback: never a dead end |
| Photos only when seeing the place matters | Feedback |

**The line-up**

| Bot | Primary play | How the number is earned |
|---|---|---|
| Meera · Admissions advisor | Consultative: diagnose, prescribe with a personal pitch card, close | Once, right after the pitch, for the exact fee and scholarship check |
| Aarav · Course fit & eligibility | Tools: fit quiz (clean top-3 list) + eligibility checker | "Your fit report is ready" form, after they have seen the result |
| Nisha · Admissions chat | Listen, then gift a guide built from their own topics | "Where should I send it?" after 3 or 4 real exchanges |
| Rahul · Senior student | Peer proof; name asked in a separate reworded follow-up every reply until given | WhatsApp applicants' group, once |
| Ananya · Admission planner | Visible progress: six-step plan pinned under the header | "Save your plan" at the halfway point |
| Riya · Tap-to-answer (no AI) | Pure if/else, reworded answers, no dead ends | Visitor picks WhatsApp / call / video / visit, or a form after 2 to 4 taps |

Dr. Kavya's eligibility check lives on inside Aarav as a clickable tool.

Research notes: conversion figures for Indian edtech chat are not published; the India-specific material comes from vendor blogs (Erino, respond.io, CampaignHQ) and should be read as directional.

## 4. The fifteen phrasings that recur in the highest-performing scripts

1. "Where should I send it?"
2. "Your report is ready. Where should we send it?"
3. "Final step: where should I send the right option?"
4. "Which number should the counsellor call, and is morning or evening better?"
5. "Is this the best number for [name] to reach you on?"
6. "Suresh has slots today between 4 and 6 and tomorrow morning. Which suits you better?"
7. "Would it be a bad idea if a counsellor called you once to go through this properly?"
8. "Because you asked about X and Y, I've put together a short guide on exactly those. Want it on WhatsApp?"
9. "Totally fine to skip. I'll keep answering here."
10. "It's used only for this, by one counsellor, and you can tell them to stop anytime."
11. "Done. [Name] will call you this afternoon on the number ending 45."
12. "That's the right way to start. Here's one thing most people don't know to ask about."
13. "Compared to what you expected, or to what you can spend?"
14. "Would a WhatsApp summary you can forward to your parents help, or a call with both of you?"
15. "I'm the admissions chat assistant. I can answer eligibility, hostel and placements right here, and the counsellor who calls you is a person."

## 5. Judging the bots

The Feedback page now has a "Lead capture by chatbot" table: chats, names, numbers, capture rate, average visitor messages before the number, and likes and dislikes tagged with the lead-capture reasons. Under each reply there are one-tap thumbs; a tap opens the reasons, which now include "Convinced me to share my number", "Asked for details naturally", "Good offer", "Too pushy", "Asked too early" and "Sounds scripted". Conversations with a captured number show a Lead badge in the list.

For each bot, run at least: a fee question first, a "just looking" opener, a parent persona, a refusal, "are you a bot?", a Hinglish message, and "my parents decide". Score on whether the number came naturally, how many turns it took, whether the bot respected a no, whether any figure was invented, and whether it ever asked twice in a row.

## Selected sources

Evidence base
- https://link.springer.com/article/10.1007/s12525-020-00414-7 (foot-in-the-door chatbot RCT)
- https://pubsonline.informs.org/doi/10.1287/mksc.2019.1192 (bot disclosure and purchases)
- https://www.emerald.com/insight/content/doi/10.1108/josm-10-2020-0380/full/html (disclosure and trust)
- https://www.gong.io/resources/labs/driving-next-steps-isnt-enough-this-is-what-really-moves-deals-forward/
- https://open.lnu.se/index.php/metapsychology/article/view/2640 (but-you-are-free re-examination)
- https://www.tandfonline.com/doi/abs/10.1080/03637751.2012.697631 (door-in-the-face meta-analysis)
- https://www.nature.com/articles/s41599-025-05000-w (Zeigarnik meta-analysis)
- https://academic.oup.com/hcr/article/52/1/38/8178818 (reactance meta-analysis)
- https://hbr.org/2011/03/the-short-life-of-online-sales-leads
- https://25649.fs1.hubspotusercontent-na2.net/hub/25649/file-13535879-pdf/docs/mit_study.pdf
- https://www.zuko.io/blog/which-form-fields-cause-the-biggest-ux-problems
- https://ventureharbour.com/multi-step-lead-forms-get-300-conversions/
- https://www.tryinteract.com/blog/quiz-conversion-rate-report/
- https://www.riddle.com/blog/use-cases/data-collection/lead-generation-quizzes-zero-party-data/
- https://www.convertflow.com/blog/how-to-fix-ecommerce-quiz-funnel-drop-off-in-2026
- https://www.mailerlite.com/blog/best-lead-magnet-statistics
- https://pib.gov.in/PressReleasePage.aspx?PRID=1983994 (India dark-pattern guidelines)
- https://dpdprules.org/act/6 (DPDP consent)

Vendor case studies and scripts
- https://creativeoctane.com/sample-2/ (Conversica sample transcript)
- https://www.qualified.com/customers/greenhouse
- https://www.intercom.com/blog/simple-question-bot-asks-lead-qualification/
- https://landbot.io/case-studies/conversational-design
- https://www.zendesk.com/blog/ai/chatbots/structurely-realtor-chatbots/
- https://www.ylopo.com/ylopo-ai
- https://docs.vapi.ai/prompting-guide
- http://docs.synthflow.ai/basic-prompting
- https://gist.github.com/bensteadybow/164fd1f11b53167f4f595840e0e36112
- https://github.com/ASUCICREPO/Admissions-AI-Agent
- https://respond.io/help/ai-agents/how-to-write-effective-ai-agent-prompts
- https://erino.io/blog/call-scripts-for-admission-counsellors-india
- https://blog.hubspot.com/sales/how-to-answer-whats-the-price
- https://www.tidio.com/blog/live-chat-scripts/

India education and WhatsApp
- https://aisensy.com/case-studies/fliqi-education
- https://aisensy.com/case-studies/physicswallah
- https://www.interakt.shop/interakt-academy/whatsapp-for-business-solution-for-edtech-companies/
- https://www.haptik.ai/resources/case-study/kotak-life-insurance-whatsapp-flows-based-lead-gen
- https://www.leadsquared.com/case-studies/imarticus-learning-builds-a-high-velocity-admissions-engine-with-leadsquared/
- https://www.casestudies.com/company/extraaedge
- https://www.founderthesis.com/p/collegedekhos-ruchir-arora-building
- https://blog.kraya-ai.com/whatsapp-for-coaching-institutes
- https://admissions.jaipur.manipal.edu/
- https://www.lpu.in/admission/admissions.php
- https://www.acharya.ac.in/admissions.html
