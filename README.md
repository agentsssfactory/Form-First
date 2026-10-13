# FormFirst (React): AI that responds to website leads instantly

**Customer fills form → AI replies → Asks 2 questions → Summarizes the lead.**

1. A business creates a lead form and gets a public link (`/f/<slug>`) and an embed snippet.
2. A visitor fills in name, email/phone and a message. No login needed.
3. The AI replies **immediately** ("Thanks for contacting us!") and asks **question 1: What service do you need?**
4. The visitor answers; the AI thanks them and asks **question 2: What is your expected budget?** (You can change both questions per form.) After the second answer the AI closes the conversation.
5. The AI writes a one-line **summary** such as *"John wants a website, budget ₹1 lakh, needs it this month."* plus what they want, budget, timeline, urgency, hot/warm/cold, key points and a suggested next step. The owner is emailed if email is set up.

**Stack:** React 18 + React Router (Vite) · Vercel serverless API (Express) · Postgres (Neon) · cookie JWT auth (bcrypt) · Claude API

## Logins (separate pages per role)
| Role | URL | Local demo login |
|---|---|---|
| Business user | `/login` (register at `/register`) | demo@formfirst.com / demo123 |
| Admin | `/admin/login` | admin@formfirst.com / admin123 (from `.env`) |

Each login page rejects the other role's credentials, and the API enforces roles server-side.

## Pages
**Business user:** Leads (stats, filters, unread bell) · Lead detail (AI summary, transcript, contact, status New/Contacted/Closed, "Summarise now" for unfinished chats) · Forms (create/edit/pause, copy link, copy embed code)
**Admin:** Dashboard · All leads (search/filter, read-only detail) · All forms (switch a form off) · Users
**Visitor:** `/f/<slug>`: the form, then the chat. Reloading keeps the conversation.

## The AI
- Set `ANTHROPIC_API_KEY` and Claude writes the replies and the summary (`ANTHROPIC_MODEL`, default `claude-haiku-5-5`).
- With no key (or if the API fails) the app falls back to **basic mode**: templated replies built from your "what should the AI find out" field, and a rule-based summary. Each summary says which one wrote it.
- Visitor text is treated as untrusted: it's passed to the model as data, the model has no tools, replies never promise prices or availability, and output is shown as plain text.

## Spam and cost guards
Hidden honeypot field · 5 submissions per hour per visitor per form · `MAX_LEADS_PER_FORM_PER_DAY` per form · answers capped at 1,000 characters · the admin can switch any form off.

## Run locally (VS Code)
```bash
npm install
cp .env.example .env     # Windows: copy .env.example .env
npm run dev              # web http://localhost:5173, API :4000
```
No database install needed: without `DATABASE_URL` it uses an embedded Postgres in `./data/pglite`.

## Deploy to Vercel
1. Push to GitHub: `git init && git add . && git commit -m "FormFirst" && git branch -M main`, create a repo, `git remote add origin <url> && git push -u origin main`.
2. Vercel → Add New → Project → import the repo. Don't deploy yet.
3. Storage tab → Create Database → **Neon (Postgres)** → connect it (adds `DATABASE_URL`).
4. Settings → Environment Variables: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY` (optional: `RESEND_API_KEY`, `RESEND_FROM`, `SEED_DEMO=1`).
5. Deploy. Tables and the admin account are created on the first request. Sign in at `/admin/login`.

The setup runs as one locked statement, so parallel serverless instances can't collide, and it repairs tables left by older versions (adds missing columns such as `leads.form_id`). Old rows without a form are kept but won't show in the app; for a completely clean start, run `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` in the Neon SQL Editor once.

If a setting is missing, the API answers with a plain message naming it.

## Embedding on your website
Forms page → **Copy embed** → paste the `<iframe>` into your site.

## Honest notes
The full flow, role separation, rate limits and the browser journey were tested locally against embedded Postgres in basic mode. The live Claude call, the Resend email and a real Vercel/Neon deploy were not exercised in the build environment (no key or network), so check those first with your own keys.
