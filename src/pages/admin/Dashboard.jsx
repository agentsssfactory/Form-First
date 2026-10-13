import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtWhen } from "../../api.js";
import { Flash, QualBadge } from "../../components/Common.jsx";

export default function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    Promise.all([api("/admin/stats"), api("/admin/leads")]).then(([s, l]) => { setStats(s); setRecent(l.leads.slice(0, 8)); }).catch((e) => setErr(e.message));
  }, []);
  return (
    <>
      <div className="page-head"><h1>Admin dashboard</h1><p className="lede">Everything across all businesses.</p></div>
      <Flash>{err}</Flash>
      {stats && (
        <div className="stats">
          <div className="stat"><b>{stats.total}</b><span>Leads</span></div>
          <div className="stat"><b>{stats.hot}</b><span>Hot leads</span></div>
          <div className="stat"><b>{stats.forms}</b><span>Forms</span></div>
          <div className="stat"><b>{stats.users}</b><span>Business users</span></div>
        </div>
      )}
      <section className="card table-wrap">
        <div className="seq-head" style={{ marginBottom: 0 }}><h2>Latest leads</h2><Link to="/admin/leads">View all →</Link></div>
        {recent.length === 0 ? <p className="empty">No leads yet.</p> : (
          <table>
            <thead><tr><th>Lead</th><th>Business</th><th>Message</th><th>AI</th><th>Received</th></tr></thead>
            <tbody>
              {recent.map((l) => (
                <tr key={l.id} className="click" onClick={() => nav(`/admin/leads/${l.id}`)}>
                  <td><Link to={`/admin/leads/${l.id}`}>{l.name}</Link></td><td>{l.business_name}</td><td className="clip">{l.message}</td>
                  <td><QualBadge lead={l} /></td><td>{fmtWhen(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {stats && <p className="hint">{stats.summarized} summarised · {stats.claude} written by Claude (the rest used basic mode)</p>}
    </>
  );
}
