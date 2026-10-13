import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fmtWhen } from "../../api.js";
import { Flash, Transcript, SummaryCard, ContactRows, QualBadge } from "../../components/Common.jsx";

export default function LeadDetail({ admin = false }) {
  const { id } = useParams();
  const base = admin ? "/admin" : "/owner";
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`${base}/leads/${id}`).then((x) => { setD(x); window.dispatchEvent(new Event("leads-changed")); }).catch((e) => setErr(e.message));
  }, [id, base]);
  const setStatus = async (status) => {
    setErr("");
    try { await api(`/owner/leads/${id}/status`, { method: "POST", body: { status } }); setD((x) => ({ ...x, lead: { ...x.lead, owner_status: status } })); }
    catch (e) { setErr(e.message); }
  };
  const summarize = async () => {
    setErr(""); setBusy(true);
    try { setD(await api(`/owner/leads/${id}/summarize`, { method: "POST" })); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  if (!d) return <><Flash>{err}</Flash>{!err && <p className="hint">Loading…</p>}</>;
  const { lead, messages } = d;
  return (
    <>
      <p className="crumb"><Link to={admin ? "/admin/leads" : "/leads"}>← Leads</Link></p>
      <div className="page-head"><h1>{lead.name}</h1>
        <p className="lede">{lead.form_name} · {admin && <>{lead.business_name} · </>}received {fmtWhen(lead.created_at)} · <QualBadge lead={lead} /></p></div>
      <Flash>{err}</Flash>
      <div className="two-col">
        <div>
          <SummaryCard lead={lead} />
          {lead.status !== "done" && !admin && (
            <section className="card">
              <h2>Summary not ready</h2>
              <p className="hint">This visitor hasn't finished answering the AI's questions. You can summarise what you have so far.</p>
              <button className="btn" onClick={summarize} disabled={busy}>{busy ? "Summarising…" : "Summarise now"}</button>
            </section>
          )}
          <section className="card">
            <h2>Conversation</h2>
            <Transcript messages={messages} name={lead.name} />
          </section>
        </div>
        <div>
          <section className="card">
            <h2>Contact</h2>
            <ContactRows lead={lead} />
            <h3 style={{ marginTop: "1rem" }}>Original message</h3>
            <p className="body" style={{ marginTop: 0 }}>{lead.message}</p>
          </section>
          {!admin && (
            <section className="card">
              <h2>Your follow-up</h2>
              <label>Status
                <select value={lead.owner_status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option>
                </select>
              </label>
            </section>
          )}
          {admin && <p className="hint">Admin view is read-only. Owner: {lead.owner_name} ({lead.owner_email}).</p>}
        </div>
      </div>
    </>
  );
}
