import { Routes, Route, Link } from "react-router-dom";
import { Layout, RequireRole } from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import LeadForm from "./pages/LeadForm.jsx";
import { UserLogin, Register, AdminLogin } from "./pages/Auth.jsx";
import Leads from "./pages/user/Leads.jsx";
import LeadDetail from "./pages/user/LeadDetail.jsx";
import Forms from "./pages/user/Forms.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import AdminLeads from "./pages/admin/AdminLeads.jsx";
import AdminLead from "./pages/admin/AdminLead.jsx";
import AdminUsers from "./pages/admin/AdminUsers.jsx";
import AdminForms from "./pages/admin/AdminForms.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="f/:slug" element={<LeadForm />} />
        <Route path="login" element={<UserLogin />} />
        <Route path="register" element={<Register />} />
        <Route path="admin/login" element={<AdminLogin />} />

        <Route path="leads" element={<RequireRole role="user"><Leads /></RequireRole>} />
        <Route path="leads/:id" element={<RequireRole role="user"><LeadDetail /></RequireRole>} />
        <Route path="forms" element={<RequireRole role="user"><Forms /></RequireRole>} />

        <Route path="admin" element={<RequireRole role="admin"><Dashboard /></RequireRole>} />
        <Route path="admin/leads" element={<RequireRole role="admin"><AdminLeads /></RequireRole>} />
        <Route path="admin/leads/:id" element={<RequireRole role="admin"><AdminLead /></RequireRole>} />
        <Route path="admin/forms" element={<RequireRole role="admin"><AdminForms /></RequireRole>} />
        <Route path="admin/users" element={<RequireRole role="admin"><AdminUsers /></RequireRole>} />

        <Route path="*" element={<section className="card"><h1>Page not found</h1><p><Link to="/">Back home</Link></p></section>} />
      </Route>
    </Routes>
  );
}
