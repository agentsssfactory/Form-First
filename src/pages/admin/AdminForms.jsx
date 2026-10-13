import { useEffect, useState } from "react";
import { api, fmtDate } from "../../api.js";
import { Flash } from "../../components/Common.jsx";

export default function AdminForms() {
  const [forms, setForms] = useState(null);
  const [err, setErr] = useState("");
  const load = () => api("/admin/forms").then((d) => setForms(d.forms)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const toggle = async (f) => { try { await api(`/admin/forms/${f.id}/active`, { method: "POST", body: { active: !f.active } }); load(); } catch (e) { setErr(e.message); } };
  return (
    <>
      <div className="page-head"><h1>All forms</h1><p className="lede">Switch off a form to stop it accepting messages (for abuse or spam).</p></div>
      <Flash>{err}</Flash>
      <section className="card table-wrap">
        {forms && !forms.length ? <p className="empty">No forms yet.</p> : (
          <table>
            <thead><tr><th>Form</th><th>Business</th><th>Owner</th><th>Leads</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>{forms?.map((f) => (
              <tr key={f.id}><td><a href={`/f/${f.slug}`} target="_blank" rel="noreferrer">{f.name}</a></td><td>{f.business_name}</td><td>{f.owner_name}</td><td>{f.leads}</td><td>{fmtDate(f.created_at)}</td>
                <td><button className={`btn btn-quiet ${f.active ? "" : "btn-danger"}`} onClick={() => toggle(f)}>{f.active ? "Live · switch off" : "Off · switch on"}</button></td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
