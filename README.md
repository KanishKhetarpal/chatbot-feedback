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
3. Set the variables from §3 (`ANTHROPIC_API_KEY`, both JWT secrets, `ADMIN_*`, `FRONTEND_URL=https://<your-vercel-domain>`, `NODE_ENV=production`).
4. [`backend/railway.json`](backend/railway.json) already sets the build (`pnpm prisma generate && pnpm build`) and start (`npx prisma migrate deploy && node dist/main`) commands.
5. After the first deploy, run the seed once from the Railway shell: `pnpm db:seed`.

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
