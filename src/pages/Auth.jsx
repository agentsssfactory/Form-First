import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { Flash } from "../components/Common.jsx";

function useSubmit(fn) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await fn(new FormData(e.target)); } catch (ex) { setErr(ex.message); setBusy(false); }
  };
  return { err, busy, run };
}
const home = (u) => (u.role === "admin" ? "/admin" : "/leads");

export function UserLogin() {
  const { user, signIn, demo } = useAuth();
  const nav = useNavigate();
  const { err, busy, run } = useSubmit(async (f) => {
    await signIn("/auth/login", { email: f.get("email"), password: f.get("password") });
    nav("/leads", { replace: true });
  });
  if (user) return <Navigate to={home(user)} replace />;
  return (
    <div className="auth-wrap">
      <section className="card">
        <h1>Sign in</h1>
        <p className="lede" style={{ marginBottom: "1rem" }}>See your leads, with an AI summary of each.</p>
        <form className="stack" onSubmit={run}>
          <Flash>{err}</Flash>
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="swap" style={{ marginTop: "1rem" }}>New here? <Link to="/register">Create an account</Link></p>
        {demo && <p className="demo-box">Demo user: <code>demo@formfirst.com</code> / <code>demo123</code></p>}
      </section>
      <p className="swap">Staff? <Link to="/admin/login">Admin login</Link></p>
    </div>
  );
}

export function Register() {
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const { err, busy, run } = useSubmit(async (f) => {
    await signIn("/auth/register", { name: f.get("name"), business: f.get("business"), email: f.get("email"), password: f.get("password") });
    nav("/forms", { replace: true });
  });
  if (user) return <Navigate to={home(user)} replace />;
  return (
    <div className="auth-wrap">
      <section className="card">
        <h1>Create account</h1>
        <form className="stack" onSubmit={run} style={{ marginTop: "0.8rem" }}>
          <Flash>{err}</Flash>
          <label>Your name<input name="name" required autoComplete="name" /></label>
          <label>Business name<input name="business" autoComplete="organization" /></label>
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Password (min 6 characters)<input name="password" type="password" minLength={6} required autoComplete="new-password" /></label>
          <button className="btn" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        </form>
        <p className="swap" style={{ marginTop: "1rem" }}>Already registered? <Link to="/login">Sign in</Link></p>
      </section>
    </div>
  );
}

export function AdminLogin() {
  const { user, signIn, demo } = useAuth();
  const nav = useNavigate();
  const { err, busy, run } = useSubmit(async (f) => {
    await signIn("/auth/admin/login", { email: f.get("email"), password: f.get("password") });
    nav("/admin", { replace: true });
  });
  if (user) return <Navigate to={home(user)} replace />;
  return (
    <div className="auth-wrap admin">
      <section className="card">
        <p className="hint" style={{ margin: 0 }}><span className="pill pill-admin">admin</span></p>
        <h1 style={{ marginTop: "0.4rem" }}>Admin sign in</h1>
        <p className="lede" style={{ marginBottom: "1rem" }}>Oversee all businesses, forms and leads.</p>
        <form className="stack" onSubmit={run}>
          <Flash>{err}</Flash>
          <label>Admin email<input name="email" type="email" required autoComplete="username" /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="btn btn-danger" disabled={busy}>{busy ? "Signing in…" : "Sign in as admin"}</button>
        </form>
        {demo && <p className="demo-box">Default admin: <code>admin@formfirst.com</code> / <code>admin123</code> unless you set ADMIN_EMAIL / ADMIN_PASSWORD</p>}
      </section>
      <p className="swap">Business user? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
