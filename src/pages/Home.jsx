import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Home() {
  const { user } = useAuth();
  if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/leads"} replace />;
  return (
    <>
      <section className="hero">
        <h1>Reply to every website lead in seconds.</h1>
        <p className="lede">Put a FormFirst form on your site. The moment someone fills it in, an AI replies, asks two quick questions, and hands you a short summary of the lead.</p>
        <ol className="steps4">
          <li><b>Customer fills form</b><span>A simple form, link or embed.</span></li>
          <li><b>AI replies</b><span>Instantly, by name, on the spot.</span></li>
          <li><b>Asks 2 questions</b><span>One at a time, about what you need to know.</span></li>
          <li><b>Summarizes the lead</b><span>Intent, urgency, and a next step.</span></li>
        </ol>
      </section>
      <div className="portals">
        <section className="card">
          <h2>Businesses</h2>
          <p className="hint">Create lead forms and read AI-summarised leads.</p>
          <div className="btn-row"><Link className="btn" to="/login">Sign in</Link><Link className="btn btn-quiet" to="/register">Create account</Link></div>
        </section>
        <section className="card">
          <h2>Admin</h2>
          <p className="hint">Oversee every business, form and lead on the platform.</p>
          <div className="btn-row"><Link className="btn btn-quiet" to="/admin/login">Admin login</Link></div>
        </section>
      </div>
    </>
  );
}
