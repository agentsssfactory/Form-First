import { useEffect, useState } from "react";
import { NavLink, Link, Outlet, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";

function Bell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => api("/owner/notifications").then((d) => live && setUnread(d.unread)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    window.addEventListener("leads-changed", load);
    return () => { live = false; clearInterval(t); window.removeEventListener("leads-changed", load); };
  }, []);
  useEffect(() => { document.title = unread ? `(${unread}) FormFirst` : "FormFirst"; }, [unread]);
  return <NavLink to="/leads" className="bell">New{unread > 0 && <span className="count">{unread}</span>}</NavLink>;
}

export function Layout() {
  const { user, brand, signOut } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const out = async () => { await signOut(); nav("/"); };

  // Visitors filling in a form (or chatting) see a clean page with no app navigation.
  if (pathname.startsWith("/f/")) return <main className="visitor"><Outlet /></main>;

  return (
    <>
      <header className="top">
        <Link className="brand" to="/">{brand}</Link>
        <p className="tagline">AI that answers your website leads instantly</p>
        <nav className="top-nav">
          {!user && (<>
            <NavLink to="/login">Sign in</NavLink>
            <NavLink to="/admin/login">Admin</NavLink>
          </>)}
          {user?.role === "user" && (<>
            <NavLink to="/leads" end>Leads</NavLink>
            <NavLink to="/forms">Forms</NavLink>
            <Bell />
          </>)}
          {user?.role === "admin" && (<>
            <NavLink to="/admin" end>Dashboard</NavLink>
            <NavLink to="/admin/leads">All leads</NavLink>
            <NavLink to="/admin/forms">Forms</NavLink>
            <NavLink to="/admin/users">Users</NavLink>
          </>)}
          {user && (<>
            <span className="who">{user.name}</span>
            <span className={`pill ${user.role === "admin" ? "pill-admin" : ""}`}>{user.role}</span>
            <button className="link" onClick={out}>Sign out</button>
          </>)}
        </nav>
      </header>
      <main><Outlet /></main>
    </>
  );
}

/** Gate a route by role. Wrong role is sent to its own home, never shown the other portal. */
export function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="hint">Loading…</p>;
  if (!user) return <Navigate to={role === "admin" ? "/admin/login" : "/login"} replace />;
  if (user.role !== role) return <Navigate to={user.role === "admin" ? "/admin" : "/leads"} replace />;
  return children;
}
