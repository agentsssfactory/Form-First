// Loads <project>/.env into process.env. Must be imported before anything reads process.env.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
try {
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1); // strip surrounding quotes
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch { /* no .env — defaults apply */ }
