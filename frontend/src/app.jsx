import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";

import Login from "./pages/Login";
import Menu from "./pages/Menu";
import AddCustomer from "./pages/AddCustomer";
import LoadPoints from "./pages/LoadPoints";
import RedeemPrize from "./pages/RedeemPrize";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Reports from "./pages/Reports";
import Users from "./pages/Users";

function RootRedirect() {
  const token = localStorage.getItem("token");
  return token ? <Navigate to="/menu" /> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route
          path="/menu"
          element={
            <ProtectedRoute>
              <Menu />
            </ProtectedRoute>
          }
        />

        <Route
          path="/add"
          element={
            <ProtectedRoute>
              <AddCustomer />
            </ProtectedRoute>
          }
        />

        <Route
          path="/load"
          element={
            <ProtectedRoute>
              <LoadPoints />
            </ProtectedRoute>
          }
        />

        <Route
          path="/redeem"
          element={
            <ProtectedRoute>
              <RedeemPrize />
            </ProtectedRoute>
          }
        />

        <Route
          path="/customers"
          element={
            <RoleRoute role="admin">
              <Customers />
            </RoleRoute>
          }
        />

        <Route
          path="/customers/:id"
          element={
            <RoleRoute role="admin">
              <CustomerDetail />
            </RoleRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <RoleRoute role="admin">
              <Reports />
            </RoleRoute>
          }
        />

        <Route
          path="/users"
          element={
            <RoleRoute role="admin">
              <Users />
            </RoleRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
