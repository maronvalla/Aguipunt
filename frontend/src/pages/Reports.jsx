import { useEffect, useState } from "react";
import api from "../api/axios";

const rangeFromPreset = (preset) => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "day") {
    return {
      from: end.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }
  if (preset === "week") {
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }
  if (preset === "month") {
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }
  return { from: "", to: "" };
};

export default function Reports() {
  const [preset, setPreset] = useState("day");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [totals, setTotals] = useState({ totalPointsLoaded: 0 });
  const [items, setItems] = useState([]);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidTargetId, setVoidTargetId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const range = rangeFromPreset(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  const fetchReport = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (userId.trim()) params.set("userId", userId.trim());
      const res = await api.get(
        `/reports/points-loaded?${params.toString()}`
      );
      setTotals(
        res.data.totals || {
          totalPointsLoaded: 0,
          totalVoided: 0,
          totalNet: 0,
        }
      );
      setItems(res.data.items || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Error al cargar reportes.");
      setTotals({ totalPointsLoaded: 0 });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [from, to, userId]);

  const openVoidModal = (txId) => {
    setVoidTargetId(txId);
    setVoidReason("");
    setShowVoidModal(true);
  };

  const confirmVoid = async () => {
    try {
      await api.post(`/transactions/${voidTargetId}/void`, {
        reason: voidReason,
      });
      setShowVoidModal(false);
      setVoidTargetId(null);
      setVoidReason("");
      fetchReport();
    } catch (e) {
      setError(e?.response?.data?.message || "Error al anular la carga.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-200 flex items-center justify-center">
      <div className="bg-slate-50 p-5 rounded-2xl shadow-sm w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-800">Reportes</h1>
          <a className="text-slate-600 hover:text-slate-800 text-sm" href="/menu">
            Volver
          </a>
        </div>

        <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 grid grid-cols-4 gap-2 text-sm">
          <select
            className="border border-slate-200 p-1.5 rounded text-sm bg-slate-50"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            <option value="day">DÃ­a</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
            <option value="custom">Personalizado</option>
          </select>
          <input
            className="border border-slate-200 p-1.5 rounded text-sm bg-slate-50"
            type="date"
            value={from}
            onChange={(e) => {
              setPreset("custom");
              setFrom(e.target.value);
            }}
          />
          <input
            className="border border-slate-200 p-1.5 rounded text-sm bg-slate-50"
            type="date"
            value={to}
            onChange={(e) => {
              setPreset("custom");
              setTo(e.target.value);
            }}
          />
          <input
            className="border border-slate-200 p-1.5 rounded text-sm bg-slate-50"
            placeholder="Usuario (ID)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}

        <div className="bg-slate-100 border border-slate-200 rounded px-4 py-3 text-sm grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-slate-500">Total cargado</div>
            <div className="text-lg font-bold text-slate-800">
              {totals.totalPointsLoaded}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total anulaciones</div>
            <div className="text-lg font-bold text-slate-800">
              {totals.totalVoided}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total neto</div>
            <div className="text-lg font-bold text-slate-800">
              {totals.totalNet}
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded overflow-hidden">
          <div className="grid grid-cols-7 gap-2 bg-slate-200 text-xs font-semibold text-slate-700 px-3 py-2">
            <div>Fecha</div>
            <div>Usuario</div>
            <div>Cliente</div>
            <div>Ops</div>
            <div>Puntos</div>
            <div>Estado</div>
            <div></div>
          </div>
          {items.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-7 gap-2 px-3 py-2 text-sm border-t border-slate-200 hover:bg-slate-100"
            >
              <div>{new Date(t.createdAt).toLocaleString()}</div>
              <div className="text-slate-600">{t.userName || t.userId}</div>
              <div className="text-slate-600">
                {t.customerNombre} ({t.customerDni})
              </div>
              <div>{t.operations || "-"}</div>
              <div className="text-emerald-600">+{t.points}</div>
              <div className="text-right">
                {t.voidedAt ? (
                  <div className="text-xs text-rose-600">
                    ANULADA
                    {t.voidedByUserId ? ` ? por ${t.voidedByUserId}` : ""}
                    {t.voidReason ? ` ? ${t.voidReason}` : ""}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-600">OK</div>
                )}
              </div>
              <div className="text-right">
                {!t.voidedAt && (
                  <button
                    className="text-xs text-slate-500 hover:text-slate-700"
                    onClick={() => openVoidModal(t.id)}
                  >
                    Anular
                  </button>
                )}
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">
              Sin resultados.
            </div>
          )}
          {loading && (
            <div className="px-3 py-2 text-sm text-slate-500">Cargando...</div>
          )}
        </div>
      </div>

      {showVoidModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-sm space-y-3">
            <div className="text-sm font-semibold">Anular carga</div>
            <textarea
              className="border w-full p-2 rounded text-sm"
              rows="3"
              placeholder="Motivo (opcional)"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded border"
                onClick={() => setShowVoidModal(false)}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1 rounded bg-slate-600 text-white"
                onClick={confirmVoid}
              >
                Anular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
