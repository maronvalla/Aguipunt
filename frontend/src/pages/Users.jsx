import { useEffect, useState } from "react";
import api, { API_BASE } from "../api/axios";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("cashier");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const handleErrorResponse = async (res, setMessage) => {
    let errorMessage = `Error ${res.status}`;
    const contentType = res.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
      const data = await res.json();
      errorMessage = data.message || data.error || errorMessage;
    } else {
      const text = await res.text();
      if (text) errorMessage = text;
    }

    console.error("API error:", res.status, errorMessage);
    setMessage(errorMessage);
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/users");
      setUsers(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Error al cargar usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setSuccess("");

    if (!username.trim() || username.trim().length < 3) {
      setFormError("Usuario invÃ¡lido (3-30 caracteres)." );
      return;
    }
    if (!password || password.length < 4) {
      setFormError("ContraseÃ±a invÃ¡lida (mÃ­nimo 4)." );
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const body = {
        username: username.trim(),
        password,
        role,
      };
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        await handleErrorResponse(res, setFormError);
        return;
      }

      setUsername("");
      setPassword("");
      setRole("cashier");
      setSuccess("Usuario creado correctamente.");
      fetchUsers();
    } catch (err) {
      console.error("Error creando usuario", err);
      setFormError(err?.message || "Error al crear usuario.");
    }
  };

  const handleDelete = async (user) => {
    const ok = window.confirm(`Eliminar usuario ${user.username}?`);
    if (!ok) return;
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/users/${user.id}`, {
        method: "DELETE",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      if (!res.ok) {
        await handleErrorResponse(res, setError);
        return;
      }
      fetchUsers();
    } catch (err) {
      console.error("Error eliminando usuario", err);
      setError(err?.message || "Error al eliminar usuario.");
    }
  };

  const openPasswordModal = (user) => {
    setPasswordUser(user);
    setNewPassword("");
    setPasswordError("");
    setPasswordSuccess("");
  };

  const closePasswordModal = () => {
    setPasswordUser(null);
    setNewPassword("");
    setPasswordError("");
    setPasswordSuccess("");
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!newPassword || newPassword.length < 4) {
      setPasswordError("ContraseÃ±a invÃ¡lida (mÃ­nimo 4).");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE}/users/${passwordUser.id}/password`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({ password: newPassword }),
        }
      );
      if (!res.ok) {
        await handleErrorResponse(res, setPasswordError);
        return;
      }
      setPasswordSuccess("ContraseÃ±a actualizada.");
      setNewPassword("");
      fetchUsers();
    } catch (err) {
      console.error("Error actualizando contraseÃ±a", err);
      setPasswordError(err?.message || "Error al actualizar contraseÃ±a.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-800">Usuarios</h1>
          <p className="text-xs text-slate-500">AdministraciÃ³n de accesos</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Crear usuario</h2>
          <form onSubmit={handleCreate} className="mt-3 space-y-3">
            <input
              className="border border-slate-300 rounded w-full px-3 py-2 text-sm"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="border border-slate-300 rounded w-full px-3 py-2 text-sm"
              type="password"
              placeholder="ContraseÃ±a"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select
              className="border border-slate-300 rounded w-full px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="cashier">Cajero</option>
              <option value="admin">Admin</option>
            </select>

            {formError && (
              <div className="text-sm text-rose-600">{formError}</div>
            )}
            {success && (
              <div className="text-sm text-emerald-600">{success}</div>
            )}

            <button
              type="submit"
              className="bg-slate-700 hover:bg-slate-800 text-white text-sm px-4 py-2 rounded"
            >
              Crear
            </button>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Listado</h2>
            {loading && (
              <span className="text-xs text-slate-500">Cargando...</span>
            )}
          </div>
          {error && <div className="text-sm text-rose-600 mt-2">{error}</div>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Usuario</th>
                  <th className="text-left px-3 py-2">Rol</th>
                  <th className="text-left px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">{u.id}</td>
                    <td className="px-3 py-2">{u.username}</td>
                    <td className="px-3 py-2">
                      {u.role === "admin" ? "Admin" : "Cajero"}
                    </td>
                    <td className="px-3 py-2 space-x-2">
                      <button
                        className="text-sm text-slate-600 hover:text-slate-800"
                        onClick={() => openPasswordModal(u)}
                      >
                        Cambiar contraseÃ±a
                      </button>
                      <button
                        className="text-sm text-rose-600 hover:text-rose-700"
                        onClick={() => handleDelete(u)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {!users.length && !loading && (
                  <tr>
                    <td className="px-3 py-2 text-slate-500" colSpan="4">
                      Sin usuarios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {passwordUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                Cambiar contraseÃ±a
              </h3>
              <button
                className="text-slate-500 hover:text-slate-700"
                onClick={closePasswordModal}
              >
                Cerrar
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Usuario: {passwordUser.username}
            </p>
            <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
              <input
                className="border border-slate-300 rounded w-full px-3 py-2 text-sm"
                type="password"
                placeholder="Nueva contraseÃ±a"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {passwordError && (
                <div className="text-sm text-rose-600">{passwordError}</div>
              )}
              {passwordSuccess && (
                <div className="text-sm text-emerald-600">
                  {passwordSuccess}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:text-slate-800"
                  onClick={closePasswordModal}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-slate-700 hover:bg-slate-800 text-white text-sm px-4 py-2 rounded"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
