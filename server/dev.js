// Local / self-hosted entry (not used on Vercel). Serves the API and, if built, the website.
import "./env.js";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import app from "./app.js";

const PORT = Number(process.env.PORT || 4000);
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}
app.listen(PORT, () => console.log(`FormFirst API on http://localhost:${PORT}`));
