import { Navigate } from "react-router-dom";
import AccessDenied from "./AccessDenied";

export default function RoleRoute({ children, role }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" />;

  const currentRole = localStorage.getItem("role") || "admin";
  if (role && currentRole !== role) return <AccessDenied />;

  return children;
}
