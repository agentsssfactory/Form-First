import { useEffect, useState } from "react";
import { api } from "../../api.js";
import { Flash, CopyButton } from "../../components/Common.jsx";
import { useAuth } from "../../auth.jsx";

function FormEditor({ initial, onSaved, onCancel }) {
  const { user } = useAuth();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const body = Object.fromEntries(new FormData(e.target));
    try {
      if (initial) await api(`/owner/forms/${initial.id}`, { method: "PUT", body });
      else await api("/owner/forms", { method: "POST", body });
      onSaved();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };
  return (
    <section className="card">
      <h2>{initial ? "Edit form" : "New form"}</h2>
      <form className="stack" onSubmit={save}>
        <Flash>{err}</Flash>
        <div className="row2">
          <label>Form title (visitors see this)<input name="name" required maxLength={100} defaultValue={initial?.name || "Contact us"} /></label>
          <label>Business name<input name="business_name" required maxLength={120} defaultValue={initial?.business_name || user.business || ""} /></label>
        </div>
        <label>About your business (helps the AI)<textarea name="description" rows={2} maxLength={600} defaultValue={initial?.description || ""} placeholder="What you do, where, who your customers are" /></label>
        <label>The 2 questions the AI asks (optional)<input name="goals" maxLength={300} defaultValue={initial?.goals || ""} placeholder="Leave empty for the default: 1) What service do you need? 2) What is your expected budget?" /></label>
        <div className="btn-row"><button className="btn" disabled={busy}>{busy ? "Saving…" : "Save form"}</button>
          <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button></div>
      </form>
    </section>
  );
}

export default function Forms() {
  const [forms, setForms] = useState(null);
  const [edit, setEdit] = useState(null); // null | "new" | form
  const [err, setErr] = useState("");
  const load = () => api("/owner/forms").then((d) => setForms(d.forms)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const toggle = async (f) => {
    try { await api(`/owner/forms/${f.id}`, { method: "PUT", body: { ...f, active: !f.active } }); load(); } catch (e) { setErr(e.message); }
  };
  const link = (f) => `${window.location.origin}/f/${f.slug}`;
  const embed = (f) => `<iframe src="${link(f)}" width="100%" height="640" style="border:0" title="Contact form"></iframe>`;
  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
        <div><h1>Lead forms</h1><p className="lede">Share the link or paste the embed code into your website.</p></div>
        {!edit && <button className="btn" onClick={() => setEdit("new")}>New form</button>}
      </div>
      <Flash>{err}</Flash>
      {edit && <FormEditor initial={edit === "new" ? null : edit} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {forms && !forms.length && !edit && <section className="card"><p className="empty">No forms yet. Create one to start capturing leads.</p></section>}
      {forms?.map((f) => (
        <section className="card" key={f.id}>
          <div className="seq-head"><h2>{f.name} <span className={`badge ${f.active ? "badge-hot" : "badge-cold"}`}>{f.active ? "Live" : "Paused"}</span></h2>
            <span className="hint">{f.leads} lead{f.leads === 1 ? "" : "s"}</span></div>
          <p className="hint" style={{ marginTop: 0 }}>{f.business_name}{f.goals ? ` · AI asks about: ${f.goals}` : ""}</p>
          <div className="linkbox"><code>{link(f)}</code><CopyButton text={link(f)} label="Copy link" /><a className="btn btn-quiet" href={`/f/${f.slug}`} target="_blank" rel="noreferrer">Open</a></div>
          <div className="linkbox"><code>{embed(f)}</code><CopyButton text={embed(f)} label="Copy embed" /></div>
          <div className="btn-row" style={{ marginTop: "0.8rem" }}>
            <button className="btn btn-quiet" onClick={() => setEdit(f)}>Edit</button>
            <button className="btn btn-quiet" onClick={() => toggle(f)}>{f.active ? "Pause form" : "Resume form"}</button>
          </div>
        </section>
      ))}
    </>
  );
}
