# Scripted QA for the two bots

Whole conversations, driven through the real endpoints, checked against the
house rules. Neither script mocks the model: they are how a change to a prompt,
a router or the lead rules gets tested before it reaches a phone.

Both need the API running (`pnpm --dir backend start:dev`) and a trained bot.

```bash
# the web bot: five conversations through POST /widget/chat, as the widget does
node backend/scripts/qa/web.mjs pk_60fbbd47839ee2c29d9e16d7          # all
node backend/scripts/qa/web.mjs pk_60fbbd47839ee2c29d9e16d7 quiz     # one

# WhatsApp: seven conversations through the in-app simulator (nothing is sent)
QA_PASS=<admin password> node backend/scripts/qa/whatsapp.mjs
QA_PASS=<admin password> node backend/scripts/qa/whatsapp.mjs hesitating
```

```bash
# the claim scrub, on its own: no server, no model, no database
node backend/scripts/qa/claims.mjs
```

Run the WhatsApp one from the repo root or `backend/`; it talks to the database
through Prisma to write the CRM-derived facts onto simulated contacts (the
simulator never reads the CRM itself) and to read back the conversion score.

## What they check

Every reply is held against the rules the owner set, and a failing run prints
the reason and the turn:

- one question per message, no filler openers, no emoji, no dashes as punctuation
- at most three buttons, each under 20 characters, nothing generic
- no fee figure except the application fee the CRM gave us for that person
- no ranking or urgency claim the knowledge does not make
- nothing repeated word for word, no two messages arriving at once
- the details ask names what a counsellor will do, and is never a bare
  "what's your number?"

## Environment

| Variable | Default | What it is |
|---|---|---|
| `QA_BASE` | `http://localhost:3100/api/v1` | API root |
| `QA_ORIGIN` | `http://localhost:5173` | Origin header the widget routes check |
| `QA_USER` / `QA_PASS` | `admin` / none | Admin sign-in for the WhatsApp simulator routes |

The WhatsApp script resets each scenario's thread before it runs, so a messy
history cannot steer the answers. It uses numbers in the `9100001000xx` range,
which are simulated contacts: nothing reaches a real phone, whatever
`WHATSAPP_ALLOWED_NUMBERS` says.
