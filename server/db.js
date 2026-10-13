import "./env.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";

/**
 * Database layer.
 *  - Production / Vercel: Neon Postgres over HTTP (set DATABASE_URL).
 *  - Local dev without DATABASE_URL: embedded Postgres (PGlite) stored in ./data/pglite.
 * Every query is plain Postgres SQL with $1,$2 placeholders, so both behave the same.
 */
export const ON_VERCEL = !!process.env.VERCEL;

export class ConfigError extends Error {
  constructor(msg) { super(msg); this.name = "ConfigError"; }
}

let driverPromise;
function driver() {
  if (!driverPromise) {
    driverPromise = (async () => {
      if (process.env.DATABASE_URL) {
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(process.env.DATABASE_URL);
        return (text, params = []) => sql.query(text, params);
      }
      if (ON_VERCEL) {
        throw new ConfigError("DATABASE_URL is not set. In Vercel add a Neon Postgres database (Storage tab) and redeploy.");
      }
      const mod = "@electric-sql/pglite"; // variable specifier: never bundled into the Vercel function
      const { PGlite } = await import(mod);
      fs.mkdirSync("./data", { recursive: true }); // PGlite does not create the parent folder
      const pg = new PGlite("./data/pglite");
      await pg.waitReady;
      return async (text, params = []) => (await pg.query(text, params)).rows;
    })();
    driverPromise.catch(() => { driverPromise = null; });
  }
  return driverPromise;
}

export async function q(text, params = []) {
  return (await driver())(text, params);
}

export const nowIso = () => new Date().toISOString();
/** Where the business is with a lead (set by the owner). */
export const OWNER_STATUSES = ["new", "contacted", "closed"];
export const QUALIFICATIONS = ["hot", "warm", "cold"];

/** Demo logins on the sign-in pages are for local use; off on Vercel unless SEED_DEMO=1. */
export const demoEnabled = () => (ON_VERCEL ? process.env.SEED_DEMO === "1" : process.env.SEED_DEMO !== "0");

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    business TEXT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user','admin')),
    created_at TEXT NOT NULL
  )`,
  // A form is one public lead-capture page (/f/<slug>) owned by a business user.
  `CREATE TABLE IF NOT EXISTS forms (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    description TEXT,
    goals TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL
  )`,
  // status: asking = conversation in progress, done = summarised.  asked = AI questions asked so far (0..2).
  `CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    form_id INTEGER NOT NULL REFERENCES forms(id),
    token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'asking',
    asked INTEGER NOT NULL DEFAULT 0,
    summary TEXT,
    urgency TEXT,
    qualification TEXT,
    ai_source TEXT,
    owner_status TEXT NOT NULL DEFAULT 'new',
    seen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    summarized_at TEXT
  )`,
  // seq makes each turn unique per lead, so a double-click can't record the same reply twice.
  `CREATE TABLE IF NOT EXISTS lead_messages (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('lead','ai')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (lead_id, seq)
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT NOT NULL,
    at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_forms_user ON forms(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_form ON leads(form_id)`,
  `CREATE INDEX IF NOT EXISTS idx_msgs_lead ON lead_messages(lead_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_key ON login_attempts(key, at)`,
];

// ---- self-healing migration -----------------------------------------------------
// Problems this fixes (seen on Vercel + Neon):
//  1. Several serverless instances start together and all run CREATE TABLE at once, which
//     crashes with "duplicate key ... pg_class_relname_nsp_index". We now run the whole setup
//     as ONE statement guarded by a transaction-level advisory lock, so only one runs at a time.
//  2. A table left over from an older version (e.g. leads without form_id) is skipped by
//     CREATE TABLE IF NOT EXISTS, and the later CREATE INDEX then fails with
//     'column "form_id" does not exist'. We now add any missing columns first, relax old
//     NOT NULL columns the app no longer writes, and create indexes last.
const EXPECTED = {
  forms: {
    user_id: "INTEGER REFERENCES users(id)", slug: "TEXT", name: "TEXT", business_name: "TEXT",
    description: "TEXT", goals: "TEXT", active: "BOOLEAN NOT NULL DEFAULT TRUE", created_at: "TEXT",
  },
  leads: {
    form_id: "INTEGER REFERENCES forms(id)", token: "TEXT", name: "TEXT", email: "TEXT", phone: "TEXT",
    message: "TEXT", status: "TEXT NOT NULL DEFAULT 'asking'", asked: "INTEGER NOT NULL DEFAULT 0",
    summary: "TEXT", urgency: "TEXT", qualification: "TEXT", ai_source: "TEXT",
    owner_status: "TEXT NOT NULL DEFAULT 'new'", seen: "BOOLEAN NOT NULL DEFAULT FALSE",
    created_at: "TEXT", updated_at: "TEXT", summarized_at: "TEXT",
  },
  lead_messages: {
    lead_id: "INTEGER REFERENCES leads(id) ON DELETE CASCADE", seq: "INTEGER", role: "TEXT",
    content: "TEXT", created_at: "TEXT",
  },
};

function buildMigration() {
  const parts = [];
  parts.push("PERFORM pg_advisory_xact_lock(727274101)");
  for (const stmt of SCHEMA.filter((x) => x.startsWith("CREATE TABLE"))) parts.push(stmt);
  // add any column an older table version is missing
  for (const [table, cols] of Object.entries(EXPECTED))
    for (const [col, def] of Object.entries(cols)) parts.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  // leftover NOT NULL columns from old versions would make new INSERTs fail: relax them
  const known = Object.entries(EXPECTED)
    .flatMap(([t, cols]) => [[t, "id"], ...Object.keys(cols).map((c) => [t, c])])
    .map(([t, c]) => `('${t}','${c}')`).join(",");
  parts.push(`FOR r IN
      SELECT table_name AS t, column_name AS c FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name IN ('forms','leads','lead_messages')
        AND is_nullable = 'NO' AND column_default IS NULL
        AND (table_name, column_name) NOT IN (VALUES ${known})
    LOOP
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.t, r.c);
    END LOOP`);
  // unique rules the code relies on (ON CONFLICT, token/slug lookups), safe on old tables too
  parts.push("CREATE UNIQUE INDEX IF NOT EXISTS uq_forms_slug ON forms(slug)");
  parts.push("CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_token ON leads(token)");
  parts.push("CREATE UNIQUE INDEX IF NOT EXISTS uq_msgs_lead_seq ON lead_messages(lead_id, seq)");
  for (const stmt of SCHEMA.filter((x) => x.startsWith("CREATE INDEX") || x.startsWith("CREATE TABLE IF NOT EXISTS login_attempts"))) {
    if (!parts.includes(stmt)) parts.push(stmt);
  }
  return `DO $migrate$\nDECLARE r record;\nBEGIN\n${parts.join(";\n")};\nEND\n$migrate$`;
}
const MIGRATION_SQL = buildMigration();

export const newToken = () => crypto.randomBytes(18).toString("base64url");
export const newSlug = (name) =>
  (String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "form") + "-" + crypto.randomBytes(3).toString("hex");

export async function createForm(userId, d, now = nowIso()) {
  const slug = newSlug(d.name);
  const [row] = await q(
    "INSERT INTO forms (user_id, slug, name, business_name, description, goals, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, slug",
    [userId, slug, d.name, d.business_name, d.description || null, d.goals || null, now]
  );
  return row;
}

/** Create a lead and its first AI message together (one statement). */
export async function createLead(form, d, aiText, aiSource, now = nowIso()) {
  const token = newToken();
  const [row] = await q(
    `WITH l AS (
       INSERT INTO leads (form_id, token, name, email, phone, message, status, asked, ai_source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'asking', 1, $7, $8::text, $8::text) RETURNING id
     ), m AS (
       INSERT INTO lead_messages (lead_id, seq, role, content, created_at) SELECT id, 1, 'ai', $9::text, $8::text FROM l RETURNING lead_id
     )
     SELECT id FROM l`,
    [form.id, token, d.name, d.email || null, d.phone || null, d.message, aiSource, now, aiText]
  );
  return { id: row.id, token };
}

export const getMessages = (leadId) =>
  q("SELECT seq, role, content, created_at FROM lead_messages WHERE lead_id = $1 ORDER BY seq ASC", [leadId]);

/** Store a lead's answer at a given turn. False if that turn was already recorded (double submit). */
export async function addLeadMessage(leadId, seq, content, now = nowIso()) {
  const rows = await q(
    "INSERT INTO lead_messages (lead_id, seq, role, content, created_at) VALUES ($1,$2,'lead',$3,$4) ON CONFLICT (lead_id, seq) DO NOTHING RETURNING id",
    [leadId, seq, content, now]
  );
  return rows.length > 0;
}

export async function addAiMessage(leadId, seq, content, source, asked, now = nowIso()) {
  await q(
    `WITH m AS (INSERT INTO lead_messages (lead_id, seq, role, content, created_at) VALUES ($1,$2,'ai',$3,$4::text) ON CONFLICT (lead_id, seq) DO NOTHING RETURNING id)
     UPDATE leads SET asked = $5, updated_at = $4::text, ai_source = COALESCE($6, ai_source), seen = FALSE WHERE id = $1`,
    [leadId, seq, content, now, asked, source]
  );
}

export async function saveSummary(leadId, s, now = nowIso()) {
  await q(
    "UPDATE leads SET status = 'done', summary = $2, urgency = $3, qualification = $4, ai_source = $5, summarized_at = $6, updated_at = $6, seen = FALSE WHERE id = $1",
    [leadId, JSON.stringify({ headline: s.headline, summary: s.summary, intent: s.intent, budget: s.budget, timeline: s.timeline, key_points: s.key_points, next_step: s.next_step }), s.urgency, s.qualification, s.source, now]
  );
}

// ---- schema + seeding (once per server instance) ------------------------------
let readyPromise;
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (ON_VERCEL) {
        if (!process.env.JWT_SECRET) throw new ConfigError("JWT_SECRET is not set. Add it in Vercel → Settings → Environment Variables.");
        if (!process.env.ADMIN_PASSWORD) throw new ConfigError("ADMIN_PASSWORD is not set. Add it in Vercel → Settings → Environment Variables.");
      }
      await q(MIGRATION_SQL);
      await seed();
    })();
    readyPromise.catch(() => { readyPromise = null; });
  }
  return readyPromise;
}

const ago = (mins) => new Date(Date.now() - mins * 60e3).toISOString();

async function seed() {
  const clean = (v) => String(v ?? "").trim();
  const adminEmail = clean(process.env.ADMIN_EMAIL || "admin@formfirst.com").toLowerCase();
  const adminPass = clean(process.env.ADMIN_PASSWORD || "admin123");

  const [existing] = await q("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  const [clash] = await q("SELECT 1 FROM users WHERE email = $1 AND role <> 'admin'", [adminEmail]);
  if (clash) {
    console.warn(`[seed] ADMIN_EMAIL ${adminEmail} is already a user account — pick another admin email.`);
  } else if (!existing) {
    await q(
      "INSERT INTO users (name, business, email, password_hash, role, created_at) VALUES ('FormFirst Admin', 'FormFirst', $1, $2, 'admin', $3) ON CONFLICT (email) DO NOTHING",
      [adminEmail, bcrypt.hashSync(adminPass, 10), nowIso()]
    );
    console.log(`[seed] admin created: ${adminEmail}`);
  } else if (existing.email !== adminEmail || !bcrypt.compareSync(adminPass, existing.password_hash)) {
    await q("UPDATE users SET email = $1, password_hash = $2 WHERE id = $3", [adminEmail, bcrypt.hashSync(adminPass, 10), existing.id]);
    console.log(`[seed] admin login updated from env: ${adminEmail}`);
  }

  if (!demoEnabled()) return;
  const [anyUser] = await q("SELECT 1 FROM users WHERE role = 'user' LIMIT 1");
  if (anyUser) return;
  const [u] = await q(
    "INSERT INTO users (name, business, email, password_hash, role, created_at) VALUES ('Asha Rao', 'Rao Air Conditioning', 'demo@formfirst.com', $1, 'user', $2) ON CONFLICT (email) DO NOTHING RETURNING id",
    [bcrypt.hashSync("demo123", 10), ago(60 * 24 * 5)]
  );
  if (!u) return;
  const f = await createForm(u.id, {
    name: "Website enquiry", business_name: "Rao Air Conditioning",
    description: "AC installation, servicing and annual maintenance contracts for homes and offices in Mumbai.",
    goals: "what service they need, their location, and how soon they need it",
  });
  const mk = async (d, msgs, sum, mins) => {
    const [l] = await q(
      "INSERT INTO leads (form_id, token, name, email, phone, message, status, asked, ai_source, created_at, updated_at, seen) VALUES ($1,$2,$3,$4,$5,$6,'asking',1,'basic',$7,$7,$8) RETURNING id",
      [f.id, newToken(), d.name, d.email, d.phone, d.message, ago(mins), !!sum?.seen]
    );
    let seq = 1;
    for (const [role, content] of msgs) await q("INSERT INTO lead_messages (lead_id, seq, role, content, created_at) VALUES ($1,$2,$3,$4,$5)", [l.id, seq++, role, content, ago(mins - seq)]);
    if (sum) {
      await q("UPDATE leads SET status='done', asked=2, summary=$2, urgency=$3, qualification=$4, summarized_at=$5, updated_at=$5 WHERE id=$1",
        [l.id, JSON.stringify(sum.body), sum.urgency, sum.qualification, ago(mins - 6)]);
    }
  };
  await mk(
    { name: "Meera Shah", email: "meera@example.com", phone: "+91 98200 55501", message: "Our office AC stopped cooling today. We have 12 staff and need someone urgently." },
    [["ai", "Hi Meera, thanks for contacting Rao Air Conditioning. Sorry to hear the AC stopped cooling. A real person will follow up with you. First: which area is the office in?"],
     ["lead", "Andheri East, near the metro station."],
     ["ai", "Thanks, that helps. Second: is it a split or a central unit, and how soon do you need someone?"],
     ["lead", "Central unit, ideally someone this afternoon. Budget is not a problem."],
     ["ai", "Thank you, Meera. That's everything I need. The team has your details and will be in touch soon."]],
    { urgency: "high", qualification: "hot", body: { headline: "Meera wants urgent office AC repair, budget not a concern, needs it today.", budget: "no limit", timeline: "today", summary: "Meera Shah's office central AC stopped cooling today. 12 staff affected, located in Andheri East. She wants a technician this afternoon and says budget is not a concern.", intent: "Emergency AC repair for office", key_points: ["Central AC, not cooling since today", "12 staff, Andheri East near the metro", "Wants a visit this afternoon", "Budget not a constraint"], next_step: "Call Meera now and offer the earliest slot today." } },
    190
  );
  await mk(
    { name: "Vikram Nair", email: "vikram@example.com", phone: "", message: "Looking for an annual maintenance contract for 3 split ACs at home." },
    [["ai", "Hi Vikram, thanks for contacting Rao Air Conditioning. A real person will follow up. First: whereabouts are you located?"],
     ["lead", "Powai."]],
    null, 40
  );
}
