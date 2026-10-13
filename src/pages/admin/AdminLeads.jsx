import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtWhen } from "../../api.js";
import { Flash, QualBadge, OwnerBadge } from "../../components/Common.jsx";

export default function AdminLeads() {
  const nav = useNavigate();
  const [leads, setLeads] = useState(null);
  const [term, setTerm] = useState("");
  const [qual, setQual] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q: term, qualification: qual });
      api(`/admin/leads?${p}`).then((d) => setLeads(d.leads)).catch((e) => setErr(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [term, qual]);
  return (
    <>
      <div className="page-head"><h1>All leads</h1></div>
      <Flash>{err}</Flash>
      <div className="filters" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        <input className="search" placeholder="Search name, email, business, message…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <select value={qual} onChange={(e) => setQual(e.target.value)} aria-label="Qualification">
          <option value="">All</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
        </select>
      </div>
      <section className="card table-wrap">
        {leads && !leads.length ? <p className="empty">No leads match.</p> : (
          <table>
            <thead><tr><th>Lead</th><th>Business</th><th>Form</th><th>AI</th><th>Owner status</th><th>Received</th></tr></thead>
            <tbody>
              {leads?.map((l) => (
                <tr key={l.id} className="click" onClick={() => nav(`/admin/leads/${l.id}`)}>
                  <td><Link to={`/admin/leads/${l.id}`}>{l.name}</Link></td><td>{l.business_name}</td><td>{l.form_name}</td>
                  <td><QualBadge lead={l} /></td><td><OwnerBadge status={l.owner_status} /></td><td>{fmtWhen(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
