import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import { Flash, Transcript } from "../components/Common.jsx";

/** Public page: the form a visitor fills in, then the chat with the AI. Needs no login. */
export default function LeadForm() {
  const { slug } = useParams();
  const key = `ff_lead_${slug}`;
  const [form, setForm] = useState(null);
  const [chat, setChat] = useState(null);
  const [token, setToken] = useState(() => { try { return localStorage.getItem(key) || ""; } catch { return ""; } });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const end = useRef(null);

  useEffect(() => { api(`/f/${slug}`).then((d) => setForm(d.form)).catch((e) => setErr(e.message)); }, [slug]);
  useEffect(() => {
    if (!token) return;
    api(`/lead/${token}`).then(setChat).catch(() => { setToken(""); try { localStorage.removeItem(key); } catch {} });
  }, [token, key]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [chat?.messages.length]);

  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const f = new FormData(e.target);
    try {
      const d = await api(`/f/${slug}/submit`, { method: "POST", body: Object.fromEntries(f) });
      try { localStorage.setItem(key, d.token); } catch {}
      setToken(d.token);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  const reply = async (e) => {
    e.preventDefault(); if (!text.trim()) return;
    setErr(""); setBusy(true);
    try {
      setChat(await api(`/lead/${token}/reply`, { method: "POST", body: { content: text } }));
      setText("");
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  const again = () => { try { localStorage.removeItem(key); } catch {} setToken(""); setChat(null); setText(""); };

  if (!form) return <section className="card public-card">{err ? <Flash>{err}</Flash> : <p className="hint">Loading…</p>}</section>;

  if (token && chat) {
    const done = chat.status === "done";
    return (
      <section className="card public-card">
        <p className="from">{form.business_name}</p>
        <h1>{done ? "Thanks, we've got it" : "A couple of quick questions"}</h1>
        <Transcript messages={chat.messages} name={chat.name} />
        <div ref={end} />
        <Flash>{err}</Flash>
        {done ? (
          <p className="flash flash-ok">All done. {form.business_name} will contact you soon. <button className="link" onClick={again}>Send another message</button></p>
        ) : (
          <form className="chat-input" onSubmit={reply}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Type your answer…" aria-label="Your answer" autoFocus disabled={busy} />
            <button className="btn" disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send"}</button>
          </form>
        )}
      </section>
    );
  }

  return (
    <section className="card public-card">
      <p className="from">{form.business_name}</p>
      <h1>{form.name}</h1>
      {form.description && <p className="lede">{form.description}</p>}
      <form className="stack" onSubmit={submit} style={{ marginTop: "1rem" }}>
        <Flash>{err}</Flash>
        <input name="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp" />
        <label>Your name<input name="name" required maxLength={100} autoComplete="name" /></label>
        <div className="row2">
          <label>Email<input name="email" type="email" autoComplete="email" /></label>
          <label>Phone<input name="phone" type="tel" maxLength={20} autoComplete="tel" /></label>
        </div>
        <p className="hint" style={{ margin: 0 }}>Add at least one: email or phone.</p>
        <label>How can we help?<textarea name="message" required rows={4} maxLength={2000} /></label>
        <button className="btn" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
      </form>
    </section>
  );
}
