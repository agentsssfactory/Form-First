import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtWhen } from "../../api.js";
import { QualBadge, OwnerBadge, Flash } from "../../components/Common.jsx";

const FILTERS = [["", "All"], ["new", "New"], ["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"], ["asking", "In conversation"], ["closed", "Closed"]];
const match = (l, f) => !f || (f === "asking" ? l.status === "asking" : ["new", "contacted", "closed"].includes(f) ? l.owner_status === f : l.qualification === f);

export default function Leads() {
  const nav = useNavigate();
  const [leads, setLeads] = useState(null);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    const load = () => api("/owner/leads").then((d) => setLeads(d.leads)).catch((e) => setErr(e.message));
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  const all = leads || [];
  const shown = all.filter((l) => match(l, filter));
  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
        <div><h1>Leads</h1><p className="lede">Each lead was answered instantly and summarised for you.</p></div>
        <Link className="btn" to="/forms">Manage forms</Link>
      </div>
      <Flash>{err}</Flash>
      {leads && (
        <div className="stats">
          <div className={`stat ${all.filter((l) => !l.seen).length ? "hot" : ""}`}><b>{all.filter((l) => !l.seen).length}</b><span>Unread</span></div>
          <div className="stat"><b>{all.filter((l) => l.qualification === "hot").length}</b><span>Hot leads</span></div>
          <div className="stat"><b>{all.filter((l) => l.status === "asking").length}</b><span>In conversation</span></div>
          <div className="stat"><b>{all.length}</b><span>Total leads</span></div>
        </div>
      )}
      <div className="filters" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
        {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {leads && !shown.length ? (
        <section className="card"><p className="empty">{all.length ? "No leads in this view." : <>No leads yet. <Link to="/forms">Create a form</Link> and share its link.</>}</p></section>
      ) : (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>Lead</th><th>Message</th><th>Form</th><th>AI</th><th>You</th><th>Received</th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className="click" onClick={() => nav(`/leads/${l.id}`)}>
                  <td><Link to={`/leads/${l.id}`}>{l.name}</Link>{!l.seen && <span className="tag-fu">new</span>}</td>
                  <td className="clip">{l.message}</td>
                  <td>{l.form_name}</td>
                  <td><QualBadge lead={l} /></td>
                  <td><OwnerBadge status={l.owner_status} /></td>
                  <td>{fmtWhen(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
