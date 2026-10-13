import { useState } from "react";
import { fmtWhen } from "../api.js";

export function Flash({ kind = "error", children }) {
  if (!children) return null;
  return <div className={`flash flash-${kind === "ok" ? "ok" : "error"}`} role={kind === "ok" ? "status" : "alert"}>{children}</div>;
}

export function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }
    catch { window.prompt("Copy this:", text); }
  };
  return <button type="button" className="btn btn-quiet" onClick={copy}>{done ? "Copied ✓" : label}</button>;
}

export const QUAL_LABEL = { hot: "Hot", warm: "Warm", cold: "Cold" };
export const OWNER_LABEL = { new: "New", contacted: "Contacted", closed: "Closed" };

export function QualBadge({ lead }) {
  if (lead.status !== "done" || !lead.qualification) return <span className="badge badge-asking">In conversation</span>;
  return <span className={`badge badge-${lead.qualification}`}>{QUAL_LABEL[lead.qualification]}</span>;
}
export const OwnerBadge = ({ status }) => <span className={`badge badge-os-${status}`}>{OWNER_LABEL[status] || status}</span>;

/** The chat between the AI and the lead. */
export function Transcript({ messages, name }) {
  return (
    <ul className="chat">
      {messages.map((m) => (
        <li key={m.seq} className={m.role === "ai" ? "ai" : "lead"}>
          <span className="who-tag">{m.role === "ai" ? "AI assistant" : name}</span>
          <div className="bubble">{m.content}</div>
          <span className="when">{fmtWhen(m.at || m.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

/** AI summary of the lead. */
export function SummaryCard({ lead }) {
  const s = lead.summary;
  if (!s) return null;
  return (
    <section className="card summary">
      <div className="seq-head"><h2>Lead summary</h2>
        <span className="hint">{lead.ai_source === "claude" ? "Written by Claude" : "Basic mode (no AI key set)"}</span></div>
      {s.headline && <p className="headline">{s.headline}</p>}
      <dl className="facts" style={{ gridTemplateColumns: "1fr 1fr 1fr", margin: "0.6rem 0" }}>
        <div><dt>Wants</dt><dd>{s.intent || "—"}</dd></div>
        <div><dt>Budget</dt><dd>{s.budget || "not given"}</dd></div>
        <div><dt>Timeline</dt><dd>{s.timeline || "not given"}</dd></div>
      </dl>
      {s.summary && s.summary !== s.headline && <p className="body" style={{ marginTop: 0 }}>{s.summary}</p>}
      <div className="chips">
        <span className={`badge badge-${lead.qualification}`}>{QUAL_LABEL[lead.qualification]} lead</span>
        <span className={`badge badge-urg-${lead.urgency}`}>{lead.urgency} urgency</span>
        {s.intent && <span className="badge badge-plain">{s.intent}</span>}
      </div>
      {!!s.key_points?.length && <ul className="points">{s.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      {s.next_step && <p className="next"><b>Suggested next step:</b> {s.next_step}</p>}
    </section>
  );
}

export function ContactRows({ lead }) {
  return (
    <dl className="facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div><dt>Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <span className="hint">Not provided</span>}</dd></div>
      <div><dt>Phone</dt><dd>{lead.phone ? <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>{lead.phone}</a> : <span className="hint">Not provided</span>}</dd></div>
    </dl>
  );
}
