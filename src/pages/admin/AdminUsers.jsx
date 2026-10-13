import { useEffect, useState } from "react";
import { api, fmtDate } from "../../api.js";
import { Flash } from "../../components/Common.jsx";

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/admin/users").then((d) => setUsers(d.users)).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      <div className="page-head"><h1>Business users</h1></div>
      <Flash>{err}</Flash>
      <section className="card table-wrap">
        {users && !users.length ? <p className="empty">No users yet.</p> : (
          <table>
            <thead><tr><th>Name</th><th>Business</th><th>Email</th><th>Forms</th><th>Leads</th><th>Joined</th></tr></thead>
            <tbody>{users?.map((u) => (
              <tr key={u.id}><td>{u.name}</td><td>{u.business}</td><td>{u.email}</td><td>{u.forms}</td><td>{u.leads}</td><td>{fmtDate(u.created_at)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
