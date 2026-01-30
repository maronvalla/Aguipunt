import { useState } from "react";
import api from "../api/axios";

export default function Menu() {
  const [testResult, setTestResult] = useState("");
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "/login";
  };

  const role = localStorage.getItem("role") || "admin";
  const isAdmin = role === "admin";

  const testPrizes = async () => {
    setTestResult("");
    try {
      const res = await api.get("/api/prizes");
      const count = Array.isArray(res.data) ? res.data.length : 0;
      setTestResult(`Premios OK (${count})`);
    } catch (e) {
      setTestResult(
        e?.response?.data?.message || "Error al probar premios."
      );
    }
  };

  const testCustomers = async () => {
    setTestResult("");
    try {
      const res = await api.get("/api/customers/customers?limit=1&offset=0");
      const count = Array.isArray(res.data?.items) ? res.data.items.length : 0;
      setTestResult(`Clientes OK (${count})`);
    } catch (e) {
      setTestResult(
        e?.response?.data?.message || "Error al probar clientes."
      );
    }
  };

  return (
    <div className="min-h-screen bg-blue-500">
      <div className="p-4 flex justify-end items-center gap-3">
        <button
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          onClick={logout}
        >
          Cerrar sesiÃ³n
        </button>
      </div>

      <div
        className="flex items-center justify-center"
        style={{ minHeight: "calc(100vh - 72px)" }}
      >
        <div className="bg-white p-6 rounded-lg shadow w-80 space-y-3">
          <a
            className="block bg-blue-500 hover:bg-blue-600 text-white p-2 rounded text-center"
            href="/add"
          >
            AÃ±adir Nuevo Cliente
          </a>

          <a
            className="block bg-blue-500 hover:bg-blue-600 text-white p-2 rounded text-center"
            href="/load"
          >
            Cargar Puntos
          </a>

          <a
            className="block bg-blue-500 hover:bg-blue-600 text-white p-2 rounded text-center"
            href="/redeem"
          >
            Canjear Puntos
          </a>

          {isAdmin && (
            <a
              className="block bg-blue-500 hover:bg-blue-600 text-white p-2 rounded text-center"
              href="/customers"
            >
              Clientes
            </a>
          )}
          {isAdmin && (
            <a
              className="block bg-blue-500 hover:bg-blue-600 text-white p-2 rounded text-center"
              href="/reports"
            >
              Reportes
            </a>
          )}
          {isAdmin && (
            <a
              className="block bg-blue-500 hover:bg-blue-600 text-white p-2 rounded text-center"
              href="/users"
            >
              Usuarios
            </a>
          )}

          <button
            className="block bg-blue-500 hover:bg-blue-600 text-white p-2 rounded text-center w-full"
            onClick={testPrizes}
          >
            Probar premios (GET /api/prizes)
          </button>

          {isAdmin && (
            <button
              className="block bg-blue-500 hover:bg-blue-600 text-white p-2 rounded text-center w-full"
              onClick={testCustomers}
            >
              Probar clientes (GET /api/customers/customers)
            </button>
          )}

          {testResult && (
            <div className="text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded p-2">
              {testResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
