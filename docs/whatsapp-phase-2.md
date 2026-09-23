# Phase 2: the WhatsApp bot

Phase 1 was lead generation on the website (the six web personas). Phase 2 is the bot on Acharya's WhatsApp number (+91 89048 93681, hosted by Mcube). It is the university's front door on WhatsApp, not only an admissions bot:

| Who writes | What the bot does |
|---|---|
| Someone thinking of joining, or their parent | Sells honestly: answers, learns one thing per reply, gives a win built from their answers, moves them to a counsellor call, a campus visit or the application. Fees always go to a counsellor. |
| Current student, parent of a student, alumni | Front desk: answers what the knowledge covers in a line or two, and routes exams, results, certificates, fee payments, hostel, buses and grievances to the right office ("Pass it on"). Never sells. |
| Recruiter, visitor, anyone else | Answers, or routes to the placement cell or student affairs. |

Who is chatting is set by a tap on first contact (*Admissions* / *I'm a student here* / *Something else*), by the template that opened the chat (always admissions), or by the model from what they write. It is stored as the `audience` fact.

What exists today is in `backend/src/modules/whatsapp/` and on the **WhatsApp** page of this app (simulator, analytics, contacts). This document is the plan around it: what is built, what is decided, and what is left.

## 1. How a conversation runs

```
Lead from an ad / website / CRM
        │
        ▼
[1] Approved TEMPLATE  (the only thing WhatsApp allows before they reply)
        │  quick-reply buttons: "Explore courses" · "Talk to a counsellor" · "Not now"
        ▼
[2] Their tap or reply  ──► opens the 24 hour window
        │
        ▼
[3] Router (no AI, instant, free)
        ├─ STOP / START ................... opt out / back in
        ├─ fee or money question .......... counsellor handoff, every time
        ├─ "talk to a person" ............. counsellor handoff
        ├─ menu taps, call-back slots ..... scripted replies
        └─ everything else ................ AI turn (Claude, Acharya knowledge pack)
        │
        ▼
[4] Reply: one or two short lines + up to 3 reply buttons ("More options" for the rest)
        │
        ▼
[5] Follow-up ladder, judged on read receipts
        in window:   +3h nudge, +22h nudge (AI, free-form)
        after 24h:   day 2, 4, 7 (approved templates only)
        quiet hours: nothing between 8:30 pm and 9:30 am IST
        stops on:    any reply, STOP, handoff, application
```

### Rules the bot keeps
- **Never a fee figure.** Fees depend on programme and quota (KCET, COMEDK, management), so the router catches any money question before the AI sees it and offers *Call me back* / *Chat here* / *Keep exploring*. The AI can also hand off (`<handoff reason="…"/>`) for anything the knowledge does not cover, complaints, or a person asking for a human.
- **Their number is the lead.** It never asks for a phone number. It learns name, programme, marks or rank, city, parent or student, one per reply.
- **Sales, not an info desk.** Answer, learn one thing, give a win built from their answers, then an either/or next step (counsellor call, campus visit, application link).
- **House style from phase 1:** one question per reply, no emoji, no dashes as punctuation, no repeated wording, no fake urgency, a "no" is final.

### Office routing (everyone who is not an admissions lead)
Offices and contacts come only from the knowledge base (`whatsapp-departments.ts`): admissions, international office, scholarship committee, hostel office, transport, placement cell, student affairs (exams, results, certificates, fee payments and receipts, grievances), alumni office, Global MBA. The bot names the office with its published contact and offers **Pass it on**; that records the request against the number and calls `CRM_HANDOFF_WEBHOOK_URL` with the office and the question. A current student's fee question goes to student affairs, never to an admissions counsellor.

### Counsellor handoff
| They choose | What happens |
|---|---|
| Call me back | Pick a slot (next hour, today 4 to 7 pm, tomorrow morning). Stage becomes `counsellor`; the slot is saved; `CRM_HANDOFF_WEBHOOK_URL` is called so the CRM can create a task for the lead's counsellor. |
| Chat here | The bot goes quiet on that thread for 12 hours; the counsellor answers in the CRM inbox (Converse). "menu" hands it back to the bot. |
| Keep exploring | Back to the menu. |

## 1a. The core: receive, then one worker answers (rebuilt 2026-09-22)

The first version answered each message as it arrived, with an in-memory queue, a burst wait and a startup recovery on top. They raced each other (and a second server process during every restart), which is where the double messages and lost replies came from. The core is now one rule:

- **Receiving only stores.** The Mcube webhook and the poller save a message (deduped on its wamid) and nothing else.
- **One worker answers.** Every second it finds people with unhandled messages who have been quiet for 3 seconds, takes a **lease on that person in the database** (a conditional update, so no two processes can hold it), and answers everything they sent since the last reply in one turn. A burst gets one answer; a restart just means the next tick picks them up.
- **At most once.** Messages are *claimed* before the turn and *handled* after it. A turn that failed before sending releases its claim and is retried; a turn that sent anything is never repeated. Messages over 30 minutes old are left for a person rather than answered late.
- **Follow-ups run in the same worker, under the same lease,** so a follow-up can never cross a reply.
- Scripts only where exactness matters: STOP/START, fee and payment questions, call-back slots, "start over" (coach numbers). Everything else is the AI turn with full context (Claude Sonnet 5).
- The live backend runs without file-watching (`backend-live` launch config), so an edit no longer restarts the bot mid-conversation.

## 1b. Follow-ups by lead stage (admin page: WhatsApp → Follow-ups)

- A **rule** matches stages (CRM statuses such as Application_Initiated, or the bot's own: bot:engaged, bot:qualified…) and holds a ladder of **steps**: a delay, then an AI message toward a written goal (inside the 24h window only) or an approved template (any time, with {{n}} filled from first name, course, city, counsellor or fixed text), optionally only if the last message was read, or not read.
- The lead's stage is their CRM status (re-read every 30 minutes) or the bot's own. The first active matching rule by priority owns them. Step delays count from Tara's last message; any reply, or a stage change, restarts the ladder. Quiet hours are per rule (IST).
- The page shows each rule's steps with sent / read / replied per step, the stages no rule covers (with lead counts), and who is due next.
- A rule can also be limited to a **conversion-score range** (section 1d), so a hot lead is chased within the hour and a cold one is left alone.
- Starts with six rules: hot lead gone quiet (score 70+); application open but the fee is not paid (score 40+); went quiet while chatting; knows the course but has not applied; application started but not submitted; application submitted.

## 1c. Closing on the application fee

The sale is a submitted application, and an application only reaches the admissions office once its fee is paid.

- Tara pushes toward the application once the person has had a real win (their route in, eligibility, a scholarship band, placements for their branch), and closes on an either/or: apply now at admissions.acharya.global, or a counsellor walks them through it.
- **The application fee is not the course fee.** Course, hostel and transport fees are still never quoted: those hand off to a counsellor. The application fee is stated only when the CRM holds a figure for *that person's* application (`applications.applicationFeeOriginal` less `applicationFeeDiscount`, read read-only through `CrmLeadLookupService.applicationForLead`). With no figure, Tara hands off rather than estimating.
- The KNOWN block carries `applicationStatus`, `applicationProgress`, `applicationProgramme`, `applicationFee` and `applicationFeeStatus` (paid / started but pending / not paid yet), so Tara knows whether to chase the payment, help finish it, or thank them and move on.
- Refunds, instalments, coupons and programme changes after paying: always a counsellor. Tara never generates a payment link; when someone wants to pay now she points them at the portal, and the counsellor sends a link only if the portal will not take it.
- "I have paid": believed, never routed to an office. If the CRM still says unpaid, she says it can take a little time to show and offers the counsellor to confirm.

### The Rs 500 app offer (held back on purpose)

Paying the application fee through the Acharya Admissions app takes Rs 500 off it, applied automatically at checkout. Tara never leads with it: it is spent at the moment someone hesitates over money or commitment ("too expensive", "I'll do it later", "let me ask my parents", a second dodge of the payment, an unanswered follow-up), once per conversation, as one line framed as something she can do for them. Offering it to someone already moving buys nothing. The fact itself lives in the knowledge base, so the web bots hold the same card under the same rule.

## 1d. How likely they are to convert (score 0 to 100)

- `whatsapp-score.ts` turns what actually happened into a score and a band (hot 70+, warm 45+, cool 25+, cold below): how much they have written and how recently, what they told us (course, marks, city, a call slot), what they asked for (applying, fees, documents, a call or visit), their CRM status, how far the application has gone and whether its fee is paid, and the negatives (not interested, joined elsewhere, ignored follow-ups, weeks of silence). Anyone who is not a prospective student, or who opted out, scores 0.
- It is recomputed after every turn, after each follow-up and whenever the CRM status is re-read, and stored on the contact with the reasons behind it. The Contacts tab sorts by it and shows those reasons per contact; follow-up rules can require a band.
- Nothing here is guessed by the model, so every point is explainable to a counsellor.

## 2. Clickable options

- **Inside the 24h window: real reply buttons, verified on a phone 2026-09-22.** Mcube's `sendmessage` with `buttons: [{ id, title }]` (at most 3, 20 characters) arrives as WhatsApp reply buttons. A tap comes back as the button's title, which the bot matches to the option it offered.
- **List messages do not work through Mcube** (a `list` field is dropped; tested). So every message has at most 3 buttons; a longer set shows two plus **More options**, which reveals the rest. Menus are designed for 3: *Explore courses / Check eligibility / Talk to counsellor* for admissions, *Exams and results / Hostel or bus / More options* for students. Anything else they can simply type.
- **Opening a conversation or after 24h:** templates with quick-reply buttons, approved by Meta in advance.
- `WHATSAPP_INTERACTIVE_MODE=text` falls back to numbered options for another provider.

## 2a. Style coaching from WhatsApp

Numbers in `WHATSAPP_COACH_NUMBERS` can coach the bot in the chat itself. "feedback: keep replies under 3 lines" (or any message the model recognises as an instruction about its writing) is saved as a style note, acknowledged in one line, and put in every later prompt, where it overrides the defaults. The WhatsApp page lists the notes and can switch each off. The first round of owner feedback ("too lengthy, looks like a para") is already in the channel rules: 1 or 2 short lines, one question asking one thing, no verdict openers, no buttons that only lead to typing.

## 3. Templates to submit for approval

The account has 11 approved templates, but none is written as a bot opener: `start_chat` ("We have received your enquiry", Noted / Connect Later) works for testing. Submit these:

| Name | Category | Body | Quick replies |
|---|---|---|---|
| `adm_bot_opener` | Marketing | Hi {{1}}, thanks for your enquiry about {{2}} at Acharya. I'm the admissions assistant here on WhatsApp: I can check your eligibility, show you hostels and placements, or get a counsellor to call you. | Explore courses · Talk to a counsellor · Not now |
| `adm_followup_d2` | Marketing | Hi {{1}}, a quick one: most students ask us about eligibility and scholarships first. Want me to check yours? It takes a minute. | Check eligibility · Talk to a counsellor · Not interested |
| `adm_followup_d4` | Marketing | Hi {{1}}, campus visits run Monday to Saturday: hostels, labs and your department with a counsellor. Want to pick a day? | Book a visit · Ask a question · Not interested |
| `adm_followup_d7` | Marketing | Hi {{1}}, applications for the {{2}} intake are open. If you'd like help with the form or documents, a counsellor can walk you through it. | Start my application · Talk to a counsellor · Not interested |

Then set `WHATSAPP_FOLLOWUP_TEMPLATES=adm_followup_d2:en:1,adm_followup_d4:en:1,adm_followup_d7:en:1`. Button labels are the routing contract (`templateButtonId()` maps "counsellor" to a handoff, "not interested" to opt-out, "later" to snooze).

## 4. Read receipts and analytics

Every outbound message stores sent, delivered and read times from Meta's receipts (a late `delivered` never overwrites `read`). Every inbound message stores which option was tapped and what it answered. The Analytics tab shows:

- **Funnel:** sent → delivered → read → replied within 24h, overall and **by source** (bot, follow-up, handoff, system), so follow-ups are judged on reads and replies, not sends.
- **Time to read** (median, p90) and **reads by hour of day (IST)**, which shows when to send follow-ups and campaigns.
- **Tap rate** on menus and **which options get tapped**: how the menu and suggestions get tuned.
- **Handoffs by reason** (fees, out of scope, asked for human, visit, callback) and how many booked a call or chat.
- **Contacts:** total, named, with a programme, handed off, opted out; funnel by stage (new → engaged → qualified → counsellor → applied / lost).

Read receipts also drive behaviour: the follow-up prompt knows whether the last message was read ("read but no reply" gets a different nudge), and a failed message stops the ladder.

## 5. Mcube and the CRM: how it is wired

Mcube hosts the number and talks to Meta. **Mcube sends to one webhook per account, and today that is the CRM** (Converse inbox, `POST /webhooks/mcube-whatsapp/inbound` → `chatbot/webhook`). Sending uses the same bearer token from both apps.

| | Today (testing) | Production (recommended) |
|---|---|---|
| Replies reach the bot | `WHATSAPP_INBOUND_SOURCE=poll`: reads Mcube's `getConversations?phone=` every 5s per allowlisted number (messages plus `delivered_at` / `read_at`; without `?phone` Mcube returns only three chats) | The CRM stays the webhook owner and **forwards each payload** to `POST /api/v1/whatsapp/webhook` (a few lines in `ChatbotInboxService.ingest`), with `x-webhook-secret` |
| Bot messages seen by counsellors | Only in this app | Bot sends appear in Converse (CRM mirrors them, or the CRM does the sending from the bot's reply) |
| Handoff | Stored here | `CRM_HANDOFF_WEBHOOK_URL` → CRM creates a task and notifies the lead's counsellor; "Chat here" pauses the bot while the counsellor replies in Converse |
| Leads | The WhatsApp number is stored on the conversation | Resolved to the CRM lead (the CRM already matches contacts to leads by number) |

Why forward through the CRM instead of moving the webhook: Converse, lead capture, assignment and the timeline all run off that webhook today. Moving it breaks the counsellors' inbox. Forwarding keeps one owner, and the bot becomes a brain the CRM consults.

**Before go-live, also check:** Mcube's own "AI bot" is switched on for some contacts (`enabled_ai_bot`). It must be off or two bots answer. The poller logs a warning when it sees one.

## 6. Safety switches

| Variable | Default | Why |
|---|---|---|
| `WHATSAPP_ALLOWED_NUMBERS` | empty = **nobody** | Only listed numbers receive live messages; `*` opens it. |
| `WHATSAPP_BOT_ENABLED` | on | Off = messages are stored, nothing is answered. |
| `WHATSAPP_FOLLOWUPS_ENABLED` | on (off locally) | The ladder. |
| `MCUBE_WEBHOOK_SECRET` | required in production | The webhook refuses everything without it. |
| `WHATSAPP_BUSINESS_NUMBER` | 918904893681 | A provider echo of our own message is never answered. |

Mcube reports Meta's rejections as HTTP 200 "success". The client only treats a message as sent when a real `wamid` comes back, and records Mcube's own words otherwise (the CRM learned this in August).

## 7. Remaining work, in order

1. **Mcube:** ask whether a second webhook is possible, and turn off Mcube's own AI bot on the number.
2. **Templates:** submit the four in section 3.
3. **CRM:** forward the webhook to the bot, mirror bot messages into Converse, and turn the handoff call into a task and notification for the counsellor.
4. **Pilot:** one campaign's leads (a few hundred) with the allowlist opened to them; watch read rate, reply rate, handoffs, opt-outs daily.
5. **Scale-out:** move follow-ups and per-contact ordering from in-process timers to a queue before running more than one backend instance.
6. **Language:** Kannada and Hindi replies (the model already mirrors Hinglish); templates in those languages.
7. **Application fee over the API:** `applicationForLead` reads the CRM database directly. When the CRM exposes its HTTP lookup, add the application and its fee to that response so production does not need database access.
8. **Score tuning:** the weights in `whatsapp-score.ts` are a first cut. Once a few hundred leads have been through, compare the band at first contact with who actually applied, and move the weights to match.
