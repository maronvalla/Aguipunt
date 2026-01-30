export default function Menu() {
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "/login";
  };

  const role = localStorage.getItem("role") || "admin";
  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-blue-500">
      <div className="p-4 flex justify-end items-center gap-3">
        <button
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          onClick={logout}
        >
          Cerrar sesión
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
            Añadir Nuevo Cliente
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
        </div>
      </div>
    </div>
  );
}
