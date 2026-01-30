import { useState } from "react";
import api from "../api/axios";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = async () => {
    try {
      console.log(
        "LOGIN REQUEST URL:",
        api.defaults.baseURL + "/api/auth/login"
      );
      const res = await api.post("/api/auth/login", { username, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role || "admin");
      window.location.href = "/menu";
    } catch {
      alert("Credenciales incorrectas");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    login();
  };

  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center">
      <div className="bg-white p-6 rounded w-80 space-y-3">
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="border w-full p-2"
            placeholder="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="border w-full p-2"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            className="bg-blue-500 text-white w-full p-2 rounded"
          >
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}
