import "./env.js";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  q, ready, ConfigError, ON_VERCEL, demoEnabled, OWNER_STATUSES, QUALIFICATIONS, nowIso,
  createForm, createLead, getMessages, addLeadMessage, addAiMessage, saveSummary,
} from "./db.js";
import { aiReply, aiSummary, aiConfigured } from "./ai.js";

const BRAND = process.env.BUSINESS_NAME || "FormFirst";
const SECRET = process.env.JWT_SECRET || (ON_VERCEL ? "" : crypto.randomBytes(32).toString("hex"));
if (!process.env.JWT_SECRET && !ON_VERCEL) console.warn("[warn] JWT_SECRET not set — using a random one; everyone is logged out on restart.");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.use("/api", ah(async (_req, _res, next) => { await ready(); next(); }));

// ---- auth: separate user and admin logins ----------------------------------------
const publicUser = (u) => ({ id: u.id, name: u.name, business: u.business, email: u.email, role: u.role });
const userById = async (id) => (await q("SELECT * FROM users WHERE id = $1", [id]))[0];

function issueCookie(req, res, user) {
  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: "7d" });
  res.cookie("ff_token", token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 7 * 864e5 });
}

const auth = ah(async (req, res, next) => {
  try {
    const { id } = jwt.verify(req.cookies.ff_token, SECRET);
    const user = await userById(id);
    if (!user) throw new Error("gone");
    req.user = user;
  } catch {
    return res.status(401).json({ error: "Please sign in." });
  }
  next();
});
const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: "You don't have access to this." });

// Rate limiting lives in the DB (serverless instances share no memory).
async function countRecent(key, windowMs) {
  const [r] = await q("SELECT COUNT(*)::int AS n FROM login_attempts WHERE key = $1 AND at > $2", [key, Date.now() - windowMs]);
  return r.n;
}
async function note(key) {
  await q("INSERT INTO login_attempts (key, at) VALUES ($1, $2)", [key, Date.now()]);
  if (Math.random() < 0.05) await q("DELETE FROM login_attempts WHERE at < $1", [Date.now() - 24 * 3600e3]);
}
const LOGIN_WINDOW = 15 * 60e3;

const login = (role) =>
  ah(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const key = "login|" + req.ip + "|" + email;
    if ((await countRecent(key, LOGIN_WINDOW)) >= 10) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
    const user = (await q("SELECT * FROM users WHERE email = $1", [email]))[0];
    if (!user || user.role !== role || !bcrypt.compareSync(password, user.password_hash)) {
      await note(key);
      return res.status(401).json({ error: "Invalid email or password." });
    }
    issueCookie(req, res, user);
    res.json({ user: publicUser(user) });
  });

app.post("/api/auth/login", login("user"));
app.post("/api/auth/admin/login", login("admin"));

app.post("/api/auth/register", ah(async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100);
  const business = String(req.body.business || "").trim().slice(0, 120) || name;
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter your name and a valid email." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const rows = await q(
    "INSERT INTO users (name, business, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,'user',$5) ON CONFLICT (email) DO NOTHING RETURNING *",
    [name, business, email, bcrypt.hashSync(password, 10), nowIso()]
  );
  if (!rows.length) return res.status(409).json({ error: "An account with that email already exists." });
  issueCookie(req, res, rows[0]);
  res.status(201).json({ user: publicUser(rows[0]) });
}));

app.post("/api/auth/logout", (_req, res) => { res.clearCookie("ff_token"); res.json({ ok: true }); });

app.get("/api/auth/me", ah(async (req, res) => {
  let user = null;
  try {
    const { id } = jwt.verify(req.cookies.ff_token, SECRET);
    user = (await userById(id)) || null;
  } catch {}
  res.json({ user: user ? publicUser(user) : null, brand: BRAND, demo: demoEnabled(), ai: aiConfigured() ? "claude" : "basic" });
}));

// ---- helpers ------------------------------------------------------------------
const idParam = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : 0; };
const cleanPhone = (v) => {
  const p = String(v || "").trim();
  if (!p) return "";
  return /^[+()\d][\d\s().-]{4,19}$/.test(p) ? p : false;
};

async function sendMail(to, subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    await fetch("https://api.resend.com/emails", {
      method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "FormFirst <onboarding@resend.dev>", to, subject, text }),
    });
    clearTimeout(t);
  } catch (e) { console.warn("[email] not sent:", e.message); }
}

const parseSummary = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const LEAD_SQL = `SELECT l.*, f.name AS form_name, f.slug, f.business_name, f.user_id AS owner_id, u.name AS owner_name, u.email AS owner_email, u.business AS owner_business
                  FROM leads l JOIN forms f ON f.id = l.form_id JOIN users u ON u.id = f.user_id`;
const leadRow = async (where, args) => (await q(`${LEAD_SQL} WHERE ${where} LIMIT 1`, args))[0];
const presentLead = (r, withSummary = true) => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, message: r.message, status: r.status, asked: r.asked,
  urgency: r.urgency, qualification: r.qualification, ai_source: r.ai_source, owner_status: r.owner_status, seen: r.seen,
  created_at: r.created_at, updated_at: r.updated_at, summarized_at: r.summarized_at,
  form_id: r.form_id, form_name: r.form_name, business_name: r.business_name, owner_name: r.owner_name, owner_email: r.owner_email,
  summary: withSummary ? parseSummary(r.summary) : undefined,
});
const presentForm = (f) => ({
  id: f.id, slug: f.slug, name: f.name, business_name: f.business_name, description: f.description, goals: f.goals,
  active: f.active, created_at: f.created_at, leads: f.leads, owner_name: f.owner_name, owner_email: f.owner_email,
});

/** Finish a conversation: closing message is already stored; build and save the summary, email the owner. */
async function finishLead(req, row) {
  const msgs = await getMessages(row.id);
  const s = await aiSummary({ business_name: row.business_name, description: row.description, goals: row.goals }, row, msgs);
  await saveSummary(row.id, s);
  await sendMail(row.owner_email, `New ${s.qualification} lead: ${row.name}`,
    `${s.summary}\n\nUrgency: ${s.urgency}\nNext step: ${s.next_step}\n\nContact: ${[row.phone, row.email].filter(Boolean).join(" · ")}\nOpen: ${req.protocol}://${req.get("host")}/leads/${row.id}`);
}

// ---- public: the form visitors fill in --------------------------------------------
const publicForm = (f) => ({ slug: f.slug, business_name: f.business_name, name: f.name, description: f.description });
const MAX_PER_DAY = Math.max(1, Number(process.env.MAX_LEADS_PER_FORM_PER_DAY) || 200);

app.get("/api/f/:slug", ah(async (req, res) => {
  const [f] = await q("SELECT * FROM forms WHERE slug = $1", [String(req.params.slug)]);
  if (!f) return res.status(404).json({ error: "This form doesn't exist." });
  if (!f.active) return res.status(410).json({ error: "This form is not accepting messages right now." });
  res.json({ form: publicForm(f) });
}));

app.post("/api/f/:slug/submit", ah(async (req, res) => {
  const [f] = await q("SELECT * FROM forms WHERE slug = $1", [String(req.params.slug)]);
  if (!f) return res.status(404).json({ error: "This form doesn't exist." });
  if (!f.active) return res.status(410).json({ error: "This form is not accepting messages right now." });
  const b = req.body || {};
  // honeypot: real people never see or fill this field; pretend success to bots
  if (b.hp) return res.status(201).json({ token: "x", ok: true });
  const name = String(b.name || "").trim().slice(0, 100);
  const email = String(b.email || "").trim().slice(0, 200);
  const phone = cleanPhone(b.phone);
  const message = String(b.message || "").trim().slice(0, 2000);
  if (!name || !message) return res.status(400).json({ error: "Please enter your name and a message." });
  if (phone === false) return res.status(400).json({ error: "That phone number doesn't look right." });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "That email doesn't look right." });
  if (!email && !phone) return res.status(400).json({ error: "Please add an email or phone number so we can reach you." });

  const key = `submit|${req.ip}|${f.id}`;
  if ((await countRecent(key, 3600e3)) >= 5) return res.status(429).json({ error: "You've sent several messages already. Please try again later." });
  const [{ n }] = await q("SELECT COUNT(*)::int AS n FROM leads WHERE form_id = $1 AND created_at > $2", [f.id, new Date(Date.now() - 864e5).toISOString()]);
  if (n >= MAX_PER_DAY) return res.status(429).json({ error: "This form has reached its daily limit. Please try again tomorrow." });
  await note(key);

  const lead = { name, email, phone, message };
  const reply = await aiReply(f, lead, [], 0);
  const { token } = await createLead(f, lead, reply.text, reply.source);
  res.status(201).json({ token });
}));

const leadPublic = async (token) => {
  const r = await leadRow("l.token = $1", [token]);
  if (!r) return null;
  const messages = await getMessages(r.id);
  return {
    row: r,
    body: {
      business: r.business_name, name: r.name, status: r.status, asked: r.asked,
      messages: messages.map((m) => ({ seq: m.seq, role: m.role, content: m.content, at: m.created_at })),
    },
  };
};

app.get("/api/lead/:token", ah(async (req, res) => {
  const out = await leadPublic(String(req.params.token));
  if (!out) return res.status(404).json({ error: "This conversation link isn't valid." });
  res.setHeader("Cache-Control", "no-store");
  res.json(out.body);
}));

app.post("/api/lead/:token/reply", ah(async (req, res) => {
  const out = await leadPublic(String(req.params.token));
  if (!out) return res.status(404).json({ error: "This conversation link isn't valid." });
  const { row, body } = out;
  if (row.status === "done") return res.status(409).json({ error: "This conversation is already complete." });
  const content = String(req.body.content || "").trim().slice(0, 1000);
  if (!content) return res.status(400).json({ error: "Please type your answer." });
  const last = body.messages[body.messages.length - 1];
  if (!last || last.role !== "ai") return res.status(409).json({ error: "Please wait for the reply." });

  const seq = last.seq + 1;
  if (!(await addLeadMessage(row.id, seq, content))) return res.status(409).json({ error: "That answer was already sent." });

  const form = { business_name: row.business_name, description: null, goals: null };
  const [f] = await q("SELECT business_name, description, goals FROM forms WHERE id = $1", [row.form_id]);
  Object.assign(form, f);
  const msgs = await getMessages(row.id);
  const reply = await aiReply(form, row, msgs, row.asked);
  if (row.asked === 1) {
    await addAiMessage(row.id, seq + 1, reply.text, reply.source, 2);
  } else {
    await addAiMessage(row.id, seq + 1, reply.text, reply.source, 2);
    await finishLead(req, { ...row, description: form.description, goals: form.goals });
  }
  res.json((await leadPublic(row.token)).body);
}));

// ---- user (the business) ----------------------------------------------------------
const user = express.Router();
user.use(auth, requireRole("user"));

const validForm = (b) => {
  const name = String(b.name || "").trim().slice(0, 100);
  const business_name = String(b.business_name || "").trim().slice(0, 120);
  const description = String(b.description || "").trim().slice(0, 600);
  const goals = String(b.goals || "").trim().slice(0, 300);
  if (!name || !business_name) return { error: "Form name and business name are required." };
  return { name, business_name, description, goals };
};

user.get("/forms", ah(async (req, res) => {
  const rows = await q(
    `SELECT f.*, (SELECT COUNT(*)::int FROM leads l WHERE l.form_id = f.id) AS leads FROM forms f WHERE f.user_id = $1 ORDER BY f.id DESC`, [req.user.id]);
  res.json({ forms: rows.map(presentForm) });
}));

user.post("/forms", ah(async (req, res) => {
  const d = validForm(req.body || {});
  if (d.error) return res.status(400).json({ error: d.error });
  const [{ n }] = await q("SELECT COUNT(*)::int AS n FROM forms WHERE user_id = $1", [req.user.id]);
  if (n >= 20) return res.status(409).json({ error: "You've reached the limit of 20 forms." });
  const f = await createForm(req.user.id, d);
  res.status(201).json(f);
}));

user.put("/forms/:id", ah(async (req, res) => {
  const d = validForm(req.body || {});
  if (d.error) return res.status(400).json({ error: d.error });
  const active = req.body.active === undefined ? null : !!req.body.active;
  const rows = await q(
    "UPDATE forms SET name=$1, business_name=$2, description=$3, goals=$4, active = COALESCE($5::boolean, active) WHERE id=$6 AND user_id=$7 RETURNING *",
    [d.name, d.business_name, d.description || null, d.goals || null, active, idParam(req), req.user.id]);
  if (!rows.length) return res.status(404).json({ error: "Form not found." });
  res.json({ form: presentForm(rows[0]) });
}));

user.get("/leads", ah(async (req, res) => {
  const rows = await q(`${LEAD_SQL} WHERE f.user_id = $1 ORDER BY l.id DESC LIMIT 500`, [req.user.id]);
  res.json({ leads: rows.map((r) => presentLead(r)) });
}));

user.get("/leads/:id", ah(async (req, res) => {
  const r = await leadRow("l.id = $1 AND f.user_id = $2", [idParam(req), req.user.id]);
  if (!r) return res.status(404).json({ error: "Lead not found." });
  await q("UPDATE leads SET seen = TRUE WHERE id = $1", [r.id]);
  res.json({ lead: presentLead({ ...r, seen: true }), messages: await getMessages(r.id) });
}));

// Summarise a conversation the visitor never finished.
user.post("/leads/:id/summarize", ah(async (req, res) => {
  const r = await leadRow("l.id = $1 AND f.user_id = $2", [idParam(req), req.user.id]);
  if (!r) return res.status(404).json({ error: "Lead not found." });
  const [f] = await q("SELECT business_name, description, goals FROM forms WHERE id = $1", [r.form_id]);
  const s = await aiSummary(f, r, await getMessages(r.id));
  await saveSummary(r.id, s);
  const fresh = await leadRow("l.id = $1", [r.id]);
  res.json({ lead: presentLead(fresh), messages: await getMessages(r.id) });
}));

user.post("/leads/:id/status", ah(async (req, res) => {
  const status = String(req.body.status || "");
  if (!OWNER_STATUSES.includes(status)) return res.status(400).json({ error: "Unknown status." });
  const rows = await q(
    "UPDATE leads SET owner_status = $1 WHERE id = $2 AND form_id IN (SELECT id FROM forms WHERE user_id = $3) RETURNING id",
    [status, idParam(req), req.user.id]);
  if (!rows.length) return res.status(404).json({ error: "Lead not found." });
  res.json({ ok: true });
}));

// bell: leads the owner hasn't opened yet
user.get("/notifications", ah(async (req, res) => {
  const rows = await q(`${LEAD_SQL} WHERE f.user_id = $1 AND l.seen = FALSE ORDER BY l.updated_at DESC LIMIT 20`, [req.user.id]);
  res.json({ unread: rows.length, leads: rows.map((r) => presentLead(r, false)) });
}));

app.use("/api/owner", user);

// ---- admin ------------------------------------------------------------------
const admin = express.Router();
admin.use(auth, requireRole("admin"));

admin.get("/stats", ah(async (_req, res) => {
  const [leads] = await q(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'done')::int AS summarized,
      COUNT(*) FILTER (WHERE qualification = 'hot')::int AS hot,
      COUNT(*) FILTER (WHERE ai_source = 'claude')::int AS claude FROM leads`);
  const [{ n: users }] = await q("SELECT COUNT(*)::int AS n FROM users WHERE role = 'user'");
  const [{ n: forms }] = await q("SELECT COUNT(*)::int AS n FROM forms");
  res.json({ ...leads, users, forms });
}));

admin.get("/leads", ah(async (req, res) => {
  const qual = String(req.query.qualification || "");
  const term = String(req.query.q || "").trim();
  const where = [];
  const args = [];
  if (QUALIFICATIONS.includes(qual)) { args.push(qual); where.push(`l.qualification = $${args.length}`); }
  if (term) {
    args.push(`%${term}%`);
    const p = `$${args.length}`;
    where.push(`(l.name ILIKE ${p} OR l.email ILIKE ${p} OR l.message ILIKE ${p} OR f.business_name ILIKE ${p} OR u.name ILIKE ${p})`);
  }
  const rows = await q(`${LEAD_SQL} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY l.id DESC LIMIT 500`, args);
  res.json({ leads: rows.map((r) => presentLead(r)) });
}));

admin.get("/leads/:id", ah(async (req, res) => {
  const r = await leadRow("l.id = $1", [idParam(req)]);
  if (!r) return res.status(404).json({ error: "Lead not found." });
  res.json({ lead: presentLead(r), messages: await getMessages(r.id) });
}));

admin.get("/users", ah(async (_req, res) => {
  const users = await q(
    `SELECT u.id, u.name, u.business, u.email, u.created_at,
            (SELECT COUNT(*)::int FROM forms f WHERE f.user_id = u.id) AS forms,
            (SELECT COUNT(*)::int FROM leads l JOIN forms f ON f.id = l.form_id WHERE f.user_id = u.id) AS leads
     FROM users u WHERE u.role = 'user' ORDER BY u.id DESC`);
  res.json({ users });
}));

admin.get("/forms", ah(async (_req, res) => {
  const rows = await q(
    `SELECT f.*, u.name AS owner_name, u.email AS owner_email, (SELECT COUNT(*)::int FROM leads l WHERE l.form_id = f.id) AS leads
     FROM forms f JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 500`);
  res.json({ forms: rows.map(presentForm) });
}));

admin.post("/forms/:id/active", ah(async (req, res) => {
  const rows = await q("UPDATE forms SET active = $1::boolean WHERE id = $2 RETURNING id, active", [!!req.body.active, idParam(req)]);
  if (!rows.length) return res.status(404).json({ error: "Form not found." });
  res.json(rows[0]);
}));

app.use("/api/admin", admin);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

// ---- errors: always JSON, config problems spelled out ---------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ConfigError) return res.status(500).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Server error. Check the server logs." });
});

export default app;
