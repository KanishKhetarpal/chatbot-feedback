# Chatbot Feedback

A private app for building **multiple AI chatbots**, sharing each one by link, and **recording every conversation** so the team can review the feedback later.

It is a stand-alone port of the Acharya CRM's AI chat widget (`chat-agents`): the same builder — Identity · Appearance · Behaviour · Model · Contact capture, Knowledge (text + CSV/XLSX), guided chip Flow, Deploy — the same Claude-backed answer path with prompt caching, plus what the CRM does not have: **accounts with two roles, per-reply thumbs up/down with notes, a 1–5 rating on each conversation, and an admin review queue with export.**

| | |
|---|---|
| Backend | NestJS 10 · TypeScript · Prisma 5 · PostgreSQL · `@anthropic-ai/sdk` |
| Frontend | React 19 · Vite 7 · TanStack Router + Query · Tailwind 4 · shadcn/radix |
| Deploy | Backend → Railway (Nixpacks + `prisma migrate deploy`) · Frontend → Vercel (static) |

---

## 1. Roles

| | `user` | `admin` |
|---|---|---|
| Sign in with **one click** (no credentials — a guest account is created), see every **active** chatbot, chat with it | ✅ | ✅ |
| Rate replies (👍/👎 + note) and the conversation (1–5 + comment) | ✅ | ✅ |
| Create / configure / train / activate chatbots | | ✅ |
| Read, review, flag, export and delete recorded conversations | | ✅ |
| Manage accounts | | ✅ |

Admins sign in with a **username + password** (default `admin` / `onpar`, from `backend/.env`). Anyone with a **share link** (`/s/<publicKey>`) can chat without signing in at all. Their conversation is recorded exactly the same way, just without a user attached.

---

## 2. Local setup

Prerequisites: Node 20+, pnpm 10+, Docker (for Postgres).

```bash
# 1. Database
docker compose up -d            # Postgres on localhost:5440

# 2. Backend
cd backend
cp .env.example .env            # then edit — see §3
pnpm install
pnpm db:migrate                 # applies prisma/migrations
pnpm db:seed                    # creates the admin from ADMIN_USERNAME / ADMIN_PASSWORD (admin / onpar)
pnpm start:dev                  # http://localhost:3100/api/v1 · Swagger at /api/docs

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env            # VITE_API_URL=http://localhost:3100
pnpm install
pnpm dev                        # http://localhost:5173
```

Open **Admin sign-in** on the login page (`admin` / `onpar`), create a chatbot, paste some knowledge, press **Train**, set the status to **Active** on the Deploy tab, and copy the share link.

---

## 3. Environment

**`backend/.env`** — untracked (`.gitignore`). Template: [`backend/.env.example`](backend/.env.example).

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `ANTHROPIC_API_KEY` | **Your Anthropic API key.** Every train and every chat turn uses it. Never committed. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Change both in production |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_NAME` | The admin, created by `pnpm db:seed`. Password is written on first creation only; `ADMIN_FORCE_PASSWORD=true` resets it |
| `FRONTEND_URL` | The web app's origin(s), comma-separated. CORS allowlist **and** the origin the public chat routes always accept |
| `PORT` | Default `3100` |
| `WIDGET_*` | Optional rate limits (defaults in the example file) |
| `AWS_*` | Optional. Only needed to keep the *original* uploaded spreadsheets downloadable; parsed text is always stored in Postgres |

**`frontend/.env`** — untracked. Template: [`frontend/.env.example`](frontend/.env.example).

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend origin, no trailing slash, no `/api/v1` |
| `VITE_APP_NAME` | Shown in the UI |

---

## 4. What an admin can configure

Everything the CRM's widget offers, per chatbot:

- **Identity** — name, internal description, avatar, greeting lines, greeting message, up to 4 quick-reply chips, input placeholder
- **Appearance** — 7 theme colours (with presets), corner style, launcher side and size, animations, branding line — live preview on the right
- **Behaviour** — the main prompt (*Instructions*), tone, response length, reply language, emoji, knowledge mode (strict / blended), fallback message, **restricted topics**, handoff triggers + message, counsellor-style qualifying questions on/off
- **Model** — Claude Haiku 4.5 / Sonnet 5 / Opus 5, effort, max reply tokens
- **Contact capture** — never / before chat / after first reply, and which fields to ask for
- **Knowledge** — paste text or upload CSV/XLSX, then **Train** to compile the knowledge pack (token-counted, prompt-cached)
- **Flow** — the guided chip decision tree (clickable options with predefined answers, merge tokens, escape to AI / human chips)
- **Deploy** — status, share link, extra allowed origins, and a `<script>` embed tag for other sites

Model IDs live in [`backend/src/common/ai/claude-models.ts`](backend/src/common/ai/claude-models.ts).

---

## 4b. Sales bots

Seven admissions bots live as prompt files in [`backend/prisma/sales-bots/bots/`](backend/prisma/sales-bots/bots/): a JSON header (settings, an optional scripted `guidedFlow`, optional `previousNames` for renames) followed by the Instructions body. They share the knowledge base in [`backend/prisma/sales-bots/knowledge/`](backend/prisma/sales-bots/knowledge/). Research behind them: [`docs/sales-bot-playbook.md`](docs/sales-bot-playbook.md).

| Bot | Play |
|---|---|
| **Shreya · Acharya admissions** | **The combined bot.** Every play below in one counsellor: the fit quiz, the eligibility checker, the scholarship finder, the pinned six-step plan, the personal pitch card and the guide built from their own topics |
| Meera · Admissions advisor | Consultative seller: diagnose, a personal "why Acharya fits you" card, then an either/or close (callback, video, visit, apply) |
| Aarav · Course fit & eligibility | Two clickable tools: a 5-tap fit quiz ending in a clean top-3 list, and an eligibility checker; then a named fit report PDF |
| Nisha · Admissions chat | A normal helpful chat that notes what the visitor cares about, then gifts a guide built from exactly those topics |
| Rahul · Senior student | Peer voice, "campus in numbers" and "first day" cards; asks the name in a separate, reworded follow-up until he has it |
| Ananya · Admission planner | "Build my admission plan": six steps in a bar pinned under the header; details asked at the halfway point |
| Riya · Tap-to-answer (no AI) | Pure if/else tree, never calls the AI; every answer offers related topics; a WhatsApp or call form appears after 2 to 4 taps |

Shared by every AI bot (in `prompt.util.ts`): sounds like a person (one question per reply, no filler, numbers not adjectives, never the same line twice), a sales arc from hook to close, the number asked at most twice and never again after a no or a skipped form, open loops in a separate follow-up bubble, photos only when seeing the place matters, and modules that switch on by topic: scholarship finder, parents mode, video counselling, callback.

Retired bots are listed in `bots/retired.json` (paused, conversations kept); their old files are in `bots/_retired/`.

```bash
cd backend
pnpm db:seed:bots            # create / update, train and activate every bot; pause retired ones
pnpm db:seed:bots -- riya    # only files whose name contains "riya"
```

**Reply attachments.** A bot reply can carry `<media>` (photo keys from [`media-library.ts`](backend/src/modules/chat-agents/media-library.ts)), one `<ui>` element (chips, select, card, fits, guide = PDF, form), `<then>` (a second bubble), `<plan>` (a checklist pinned under the header) and `<next>` suggestions. [`ui-block.util.ts`](backend/src/modules/chat-agents/ui-block.util.ts) validates them, trims harmless overflows, strips emoji and spaced dashes, and stores them in canonical form; the widget renders them ([`widget-ui-blocks.tsx`](frontend/src/components/chat-agents/widget/widget-ui-blocks.tsx)). Forms can carry `skip` (a "not now" button), `gate` or `local` (rule-based bots: saved without the AI). Choice lists always get "Ask my own question"; multi-selects always get "None of these".

**Lead rules (server-enforced, [`lead-flow.util.ts`](backend/src/modules/chat-agents/lead-flow.util.ts)).** After `leadSoftAfter` bot replies (3 by default) a name + number form arrives as its own message, with "Not now" (once). From `leadGateAfter` (6 by default) it is compulsory: the widget hides the input and the server answers nothing else until a number is left. Both numbers are set per bot on the Leads tab, and 0 switches either ask off; they are enforced in the API, so calling the endpoint directly hits the same wall. The ask itself is built from what the visitor was asking about: it names the one thing a counsellor can do that the bot cannot (the fee for their quota, their eligibility in writing, the scholarship band they may match, the placement record for their branch) and only then asks where it should go. **One thing to tap at a time:** when a reply already carries a question the visitor taps (a quiz step, a dropdown), the skippable ask waits for the next reply instead of landing beside it; the compulsory form takes the reply's own question away, since nothing else can be answered until the number is left. Both wait for the first reply that isn't itself a question (quiz step, dropdown). Forms never ask for what the visitor already gave (a name typed as "I'm Sneha" counts), details forms carry no side suggestions, and a closing question after an answer is split into its own bubble. Riya does the same with `capture.gateAfter`.

**Phone verification ([`widget-otp.service.ts`](backend/src/modules/chat-agents/widget-otp.service.ts)).** A number is verified before it is stored. The form carries a country selector and only accepts the number of digits that country actually uses (`lib/phone-countries.ts`); submitting it sends a 6-digit code over WhatsApp and swaps the card for a code screen with a resend timer and "change number". The rules are the CRM's, copied: 10-minute code, 3 wrong guesses, 3 codes per number per hour, delivered on the approved `student_crm_otp` AUTHENTICATION template through the same Mcube account as the bot (its copy-code button takes the code as a second parameter, or Meta refuses the send with #131008). Verified numbers are marked `phoneVerified` / `verifiedVia: whatsapp_otp` on the visitor. When the environment cannot send at all (no Mcube, or the number is outside `WHATSAPP_ALLOWED_NUMBERS`), the form stores the number unverified rather than losing the lead; `WIDGET_OTP_DEV_ECHO=true` returns the code in the response so the flow stays testable locally.

**Testing the bots ([`backend/scripts/qa/`](backend/scripts/qa/README.md)).** Two scripted suites drive whole conversations through the real endpoints and check every reply against the house rules: one question per message, no filler openers, sane buttons, no figure the bot may not quote, no ranking claim the knowledge does not make, nothing repeated word for word, and a details ask that names what a counsellor will do. `web.mjs` posts to `/widget/chat` exactly as the widget does; `whatsapp.mjs` runs the in-app simulator (nothing reaches a phone) with the CRM-derived facts written onto the contact first.

```bash
node backend/scripts/qa/web.mjs <publicKey>
QA_PASS=<admin password> node backend/scripts/qa/whatsapp.mjs
node backend/scripts/qa/claims.mjs      # the claim scrub, no server needed
```

**Rule-based bots.** A guided flow with `"noAi": true` never reaches the model: typed messages and idle follow-ups are refused, and training skips the cache warm-up. Answers may hold several wordings separated by a `~~~` line (one is picked at random); a node with no next chips returns the menu; `capture` appends a lead form after a random number of answers while no number has been left. Depth is the shortest number of taps from the menu (max 8).

**Judging them.** The Feedback page opens with a *Lead capture by chatbot* table. Every reply has one-tap thumbs with sales-specific reasons, and conversations that yielded a number carry a **Lead** badge in Conversations. "New chat" (sidebar or chat header) starts a bot's conversation fresh; the old one stays in Conversations.

---

## 5. Feedback and review

- In the chat, every bot reply gets **👍 / 👎** and an optional **note**; a **Rate this chat** pill opens a 1–5 star card with a comment.
- **Chat** is the tester's workspace: every live chatbot in a sidebar, the selected one's conversation beside it. Each chatbot keeps its own thread.
- **Conversations** (admin) lists every thread with the person (guest or staff account, captured name, or anonymous visitor), the chatbot, thumbs counts, star rating and review status. Filters: chatbot, review status, with-feedback-only, hide-empty.
- The transcript shows each reply's rating/note, token usage and latency. The right pane holds the admin's own **review** (Reviewed / Flagged + note), who was chatting, what the bot learned, session details.
- **Export JSON** downloads every conversation (or one chatbot's) with all messages and feedback.
- Headline numbers: conversations, average rating, thumbs up/down, pending and flagged.

API: `GET /widget-inbox`, `/stats`, `/export`, `/:visitorId`, `PATCH /:visitorId/review`, `DELETE /:visitorId`; public feedback routes `POST /widget/feedback/message` and `/widget/feedback/conversation`.

---

## 6. Deploying

### Backend → Railway

1. New project → **Deploy from GitHub repo**, root directory `backend`.
2. Add a **PostgreSQL** plugin; Railway injects `DATABASE_URL`.
3. Set the variables: paste [`backend/.env.railway.example`](backend/.env.railway.example) into the service's **Variables → Raw Editor**, then fill in `ANTHROPIC_API_KEY` and the two JWT secrets (`openssl rand -hex 32` each).
4. [`backend/railway.json`](backend/railway.json) already sets the build (`pnpm prisma generate && pnpm build`) and start (`npx prisma migrate deploy && node dist/main`) commands.
5. After the first deploy, run the seed once from the Railway shell: `pnpm db:seed`.
6. Load the six sales bots (needs `ANTHROPIC_API_KEY`; safe to re-run after any change to `prisma/sales-bots/`): `pnpm db:seed:bots`. To clear out bots listed in `retired.json` for good: `pnpm db:delete-retired-bots`.

Deploying with the Railway CLI instead of GitHub:

```bash
npm i -g @railway/cli
railway login
cd backend
railway link                  # pick the project and the backend service
railway up                    # uploads this folder; railway.json does the build and start
railway ssh                   # a shell in the running service, then:
pnpm db:seed && pnpm db:seed:bots
```

No new environment variables were added for the sales bots; the list in `.env.railway.example` is complete.

### Frontend → Vercel

1. Import the repo, root directory `frontend`, framework **Vite**.
2. Set `VITE_API_URL=https://<your-railway-domain>` and `VITE_APP_NAME`.
3. [`frontend/vercel.json`](frontend/vercel.json) rewrites every path except `/widget.js` to `index.html`.

Then add the Vercel domain to the backend's `FRONTEND_URL` and redeploy the backend.

### Keeping it private

```bash
cd chatbot-feedback
git init
git add .
git commit -m "Chatbot Feedback — initial build"
gh repo create <org>/chatbot-feedback --private --source=. --push
```

`.env` files, `node_modules`, `dist` and the generated route tree are ignored by [`.gitignore`](.gitignore).

---

## 7. Layout

```
chatbot-feedback/
├─ docker-compose.yml          local Postgres (:5440)
├─ backend/
│  ├─ prisma/schema.prisma     users · chat_agents · knowledge · visitors · messages · rate limits
│  ├─ prisma/migrations/       applied with `prisma migrate deploy` on every deploy
│  ├─ prisma/seed.ts           first admin
│  └─ src/
│     ├─ modules/auth          login · refresh · me · change password (JWT + Passport)
│     ├─ modules/users         admin account management
│     ├─ modules/ai            AnthropicService — chat · countTokens · warmCache
│     └─ modules/chat-agents   the ported widget: agents · knowledge · training · widget · inbox
└─ frontend/
   └─ src/
      ├─ routes/               / (admin gallery) · /agents/$id (builder) · /chat (bot sidebar) · /chat/$key
      │                        /s/$key (share) · /widget/$key (embed) · /conversations · /users · /login
      ├─ components/chat-agents  builder panels, guided-flow editor, chat widget, inbox
      └─ widget-loader.js      the `<script>` embed, served as /widget.js
```

Typecheck both halves with `pnpm typecheck` in each folder.
