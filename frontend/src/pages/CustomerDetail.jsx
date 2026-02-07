import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/axios";
import { formatTucumanDateTime } from "../utils/date";

const PAGE_SIZE = 50;

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState("ALL");
  const [order, setOrder] = useState("desc");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");

  const fetchCustomer = async () => {
    setError("");
    try {
      const res = await api.get(`/api/customers/customers/by-id/${id}`);
      setCustomer(res.data);
    } catch (e) {
      setCustomer(null);
      setError(e?.response?.data?.message || "Error al cargar cliente.");
    }
  };

  const fetchTransactions = async (reset = false) => {
    setLoading(true);
    setError("");
    const nextOffset = reset ? 0 : offset;
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(nextOffset));
      params.set("type", type);
      params.set("order", order);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await api.get(
        `/api/customers/customers/${id}/transactions?${params.toString()}`
      );
      const newItems = res.data.items || [];
      setHasMore(Boolean(res.data.hasMore));
      if (reset) {
        setItems(newItems);
        setOffset(PAGE_SIZE);
      } else {
        setItems((prev) => [...prev, ...newItems]);
        setOffset(nextOffset + PAGE_SIZE);
      }
    } catch (e) {
      if (reset) setItems([]);
      setHasMore(false);
      setError(e?.response?.data?.message || "Error al cargar movimientos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  useEffect(() => {
    fetchTransactions(true);
  }, [id, type, order, from, to]);

  const handleExport = async () => {
    setExportError("");
    try {
      const params = new URLSearchParams();
      params.set("type", type);
      params.set("order", order);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("format", "csv");
      const res = await api.get(
        `/api/customers/customers/${id}/transactions/export?${params.toString()}`,
        { responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cliente-${id}-movimientos.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(
        e?.response?.data?.message || "Error al exportar movimientos."
      );
    }
  };

  const formatType = (t) => (t === "REDEEM" ? "Canje" : "Carga");
  const formatPoints = (points) =>
    points > 0 ? `+${points}` : `${points}`;

  return (
    <div className="min-h-screen bg-slate-200 flex items-center justify-center">
      <div className="bg-slate-50 p-5 rounded-2xl shadow-sm w-full max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-800">
            Detalle de Cliente
          </h1>
          <a
            className="text-slate-600 hover:text-slate-800 text-sm"
            href="/customers"
          >
            Volver
          </a>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}

        {customer && (
          <div className="bg-slate-100 border border-slate-200 rounded px-4 py-3 text-sm">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  {customer.nombre}
                </div>
                <div className="text-xs text-slate-500">
                  DNI: {customer.dni}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Puntos actuales</div>
                <div className="text-lg font-bold text-slate-800">
                  {customer.puntos}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-100 border border-slate-200 rounded-lg p-3">
          <div className="grid grid-cols-4 gap-2 text-sm">
            <select
              className="border border-slate-200 p-1.5 rounded text-sm bg-slate-50"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="ALL">Todos</option>
              <option value="LOAD">Cargas</option>
              <option value="REDEEM">Canjes</option>
            </select>
            <select
              className="border border-slate-200 p-1.5 rounded text-sm bg-slate-50"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="asc">Antiguos ? Nuevos</option>
              <option value="desc">Nuevos ? Antiguos</option>
            </select>
            <input
              className="border border-slate-200 p-1.5 rounded text-sm bg-slate-50"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              className="border border-slate-200 p-1.5 rounded text-sm bg-slate-50"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">
            Movimientos
          </div>
          <button
            className="text-sm bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded"
            onClick={handleExport}
          >
            Exportar CSV
          </button>
        </div>
        {exportError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {exportError}
          </div>
        )}

        <div className="border border-slate-200 rounded overflow-hidden">
          <div className="grid grid-cols-7 gap-2 bg-slate-200 text-xs font-semibold text-slate-700 px-3 py-2">
            <div>Fecha</div>
            <div>Tipo</div>
            <div>Ops</div>
            <div>Puntos</div>
            <div>Nota</div>
            <div>Usuario</div>
            <div>Estado</div>
          </div>
          {items.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-7 gap-2 px-3 py-2 text-sm border-t border-slate-200 hover:bg-slate-100"
            >
              <div>{formatTucumanDateTime(t.createdAt)}</div>
              <div>{formatType(t.type)}</div>
              <div>{t.operations || "-"}</div>
              <div
                className={t.points > 0 ? "text-emerald-600" : "text-rose-600"}
              >
                {formatPoints(t.points)}
              </div>
              <div className="text-slate-600">{t.note || "-"}</div>
              <div className="text-slate-600">
                {t.userName || t.userId || "-"}
              </div>
              <div className="text-slate-600 text-xs">
                {t.voidedAt ? (
                  <span className="text-rose-600">
                    ANULADA
                    {t.voidedByUserId ? ` ? por ${t.voidedByUserId}` : ""}
                    {t.voidReason ? ` ? ${t.voidReason}` : ""}
                  </span>
                ) : (
                  <span className="text-emerald-600">OK</span>
                )}
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">
              Sin movimientos.
            </div>
          )}
          {loading && (
            <div className="px-3 py-2 text-sm text-slate-500">Cargando...</div>
          )}
        </div>

        <div className="flex justify-center">
          <button
            className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
            disabled={!hasMore || loading}
            onClick={() => fetchTransactions(false)}
          >
            Cargar más
          </button>
        </div>
      </div>
    </div>
  );
}
