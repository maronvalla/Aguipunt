import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

const PAGE_SIZE = 20;

export default function Customers() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const fetchCustomers = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await api.get(`/api/customers/customers?${params.toString()}`);
      setItems(res.data.items || []);
      if (typeof res.data.total === "number") {
        setTotal(res.data.total);
      } else {
        setTotal(null);
      }
    } catch (e) {
      setItems([]);
      setTotal(null);
      setError(e?.response?.data?.message || "Error al buscar clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchCustomers();
    }, 300);
    return () => clearTimeout(handle);
  }, [search, offset]);

  const hasPrev = offset > 0;
  const hasNext =
    total !== null ? offset + PAGE_SIZE < total : items.length === PAGE_SIZE;

  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow w-full max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Clientes</h1>
          <a className="text-blue-700 hover:underline" href="/menu">
            Volver
          </a>
        </div>

        <input
          className="border w-full p-2 rounded"
          placeholder="Buscar por Nombre o DNI"
          value={search}
          onChange={(e) => {
            setOffset(0);
            setSearch(e.target.value);
          }}
        />

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}

        <div className="border rounded overflow-hidden">
          <div className="grid grid-cols-4 gap-2 bg-gray-50 text-sm font-semibold p-2">
            <div>Nombre</div>
            <div>DNI</div>
            <div>Puntos</div>
            <div className="text-right">Acciones</div>
          </div>
          {loading && (
            <div className="p-3 text-sm text-gray-500">Cargando...</div>
          )}
          {!loading && items.length === 0 && (
            <div className="p-3 text-sm text-gray-500">Sin resultados.</div>
          )}
          {!loading &&
            items.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-4 gap-2 p-2 text-sm border-t"
              >
                <div>{c.nombre}</div>
                <div>{c.dni}</div>
                <div>{c.puntos}</div>
                <div className="text-right">
                  <button
                    className="text-blue-700 hover:underline"
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    Ver
                  </button>
                </div>
              </div>
            ))}
        </div>

        <div className="flex items-center justify-between text-sm">
          <button
            className="px-3 py-1 rounded border disabled:opacity-50"
            disabled={!hasPrev}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Anterior
          </button>
          {total !== null && (
            <div className="text-gray-600">
              {offset + 1} - {Math.min(offset + PAGE_SIZE, total)} de {total}
            </div>
          )}
          <button
            className="px-3 py-1 rounded border disabled:opacity-50"
            disabled={!hasNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
