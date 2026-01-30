import { useEffect, useState } from "react";
import api from "../api/axios";

export default function RedeemPrize() {
  const [dni, setDni] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [currentPoints, setCurrentPoints] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txError, setTxError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [mode, setMode] = useState("prize");
  const [prizes, setPrizes] = useState([]);
  const [premioId, setPremioId] = useState("");

  const [customPoints, setCustomPoints] = useState("");
  const [customNote, setCustomNote] = useState("");

  const [showAddPrize, setShowAddPrize] = useState(false);
  const [newPrizeName, setNewPrizeName] = useState("");
  const [newPrizePoints, setNewPrizePoints] = useState("");
  const [prizeError, setPrizeError] = useState("");
  const [editingPrizeId, setEditingPrizeId] = useState(null);

  const role = localStorage.getItem("role") || "admin";
  const isAdmin = role === "admin";

  const fetchTransactions = async (id) => {
    if (!isAdmin) return;
    if (!id) return;
    setTxError("");
    try {
      const res = await api.get(
        `/api/customers/customers/${id}/transactions?limit=10`
      );
      setTransactions(res.data?.items || []);
    } catch (e) {
      setTransactions([]);
      setTxError(
        e?.response?.data?.message || "Error al cargar movimientos."
      );
    }
  };

  const fetchCustomer = async () => {
    if (!dni) return;
    setError("");
    setMessage("");
    try {
      const res = await api.get(`/api/customers/customers/${dni}`);
      setCustomerId(res.data.id);
      setCurrentPoints(res.data.puntos);
      fetchTransactions(res.data.id);
    } catch (e) {
      setCustomerId(null);
      setCurrentPoints(null);
      setTransactions([]);
      setError(e?.response?.data?.message || "Error al buscar cliente.");
    }
  };

  const fetchPrizes = async () => {
    try {
      const res = await api.get("/api/prizes/prizes");
      setPrizes(res.data || []);
      if (!premioId && res.data?.length) {
        setPremioId(String(res.data[0].id));
      }
    } catch {
      setPrizes([]);
    }
  };

  useEffect(() => {
    fetchPrizes();
  }, []);

  const submitPrize = async () => {
    setError("");
    setMessage("");
    try {
      const res = await api.post("/api/prizes/prizes/redeem", {
        dni,
        premioId: Number(premioId),
      });
      setCurrentPoints(res.data.newPoints);
      setMessage(`Te quedan: ${res.data.newPoints} puntos.`);
      fetchTransactions(customerId);
    } catch (e) {
      const data = e?.response?.data;
      if (data?.currentPoints !== undefined) {
        setCurrentPoints(data.currentPoints);
      }
      setError(data?.error || data?.message || "Error al canjear premio.");
    }
  };

  const submitCustom = async () => {
    setError("");
    setMessage("");
    try {
      const res = await api.post("/api/points/points/redeem-custom", {
        dni,
        pointsToRedeem: Number(customPoints),
        note: customNote,
      });
      setCurrentPoints(res.data.newPoints);
      setMessage(`Te quedan: ${res.data.newPoints} puntos.`);
      setCustomPoints("");
      setCustomNote("");
      fetchTransactions(customerId);
    } catch (e) {
      const data = e?.response?.data;
      if (data?.currentPoints !== undefined) {
        setCurrentPoints(data.currentPoints);
      }
      setError(data?.error || data?.message || "Error al canjear puntos.");
    }
  };

  const submit = async () => {
    if (mode === "prize") return submitPrize();
    return submitCustom();
  };

  const resetPrizeForm = () => {
    setNewPrizeName("");
    setNewPrizePoints("");
    setEditingPrizeId(null);
    setPrizeError("");
  };

  const handleSavePrize = async () => {
    setPrizeError("");
    const nombre = newPrizeName.trim();
    const costo = Number(newPrizePoints);
    if (!nombre) {
      setPrizeError("Nombre requerido.");
      return;
    }
    if (!Number.isInteger(costo) || costo <= 0) {
      setPrizeError("Puntos requeridos invÃ¡lidos.");
      return;
    }
    try {
      if (editingPrizeId) {
        await api.put(`/api/prizes/prizes/${editingPrizeId}`, {
          nombre,
          costo_puntos: costo,
        });
      } else {
        await api.post("/api/prizes/prizes", { nombre, costo_puntos: costo });
      }
      setShowAddPrize(false);
      resetPrizeForm();
      fetchPrizes();
    } catch (e) {
      setPrizeError(e?.response?.data?.message || "Error al guardar premio.");
    }
  };

  const handleEditPrize = (prize) => {
    setEditingPrizeId(prize.id);
    setNewPrizeName(prize.nombre || "");
    setNewPrizePoints(String(prize.costo_puntos || ""));
    setPrizeError("");
  };

  const handleDeletePrize = async (prize) => {
    const ok = window.confirm(`Eliminar premio ${prize.nombre}?`);
    if (!ok) return;
    setPrizeError("");
    try {
      await api.delete(`/api/prizes/prizes/${prize.id}`);
      fetchPrizes();
      if (editingPrizeId === prize.id) {
        resetPrizeForm();
      }
    } catch (e) {
      setPrizeError(e?.response?.data?.message || "Error al eliminar premio.");
    }
  };

  const closeAddPrize = () => {
    setShowAddPrize(false);
    resetPrizeForm();
  };

  const formatType = (type) => (type === "REDEEM" ? "Canje" : "Carga");
  const formatPoints = (points) => (points > 0 ? `+${points}` : `${points}`);

  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow w-80 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-center">Canjear</h1>
          {isAdmin && (
            <button
              className="text-xs text-blue-700 hover:underline"
              onClick={() => setShowAddPrize(true)}
            >
              AÃ±adir premio
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <input
            className="border w-full p-2 rounded"
            placeholder="DNI"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
          />
          <button
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 rounded"
            onClick={fetchCustomer}
          >
            Buscar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <button
            className={`border rounded p-2 ${
              mode === "prize" ? "bg-blue-500 text-white" : "bg-white"
            }`}
            onClick={() => setMode("prize")}
          >
            Premio
          </button>
          <button
            className={`border rounded p-2 ${
              mode === "custom" ? "bg-blue-500 text-white" : "bg-white"
            }`}
            onClick={() => setMode("custom")}
          >
            Personalizado
          </button>
        </div>

        {mode === "prize" && (
          <select
            className="border w-full p-2 rounded"
            value={premioId}
            onChange={(e) => setPremioId(e.target.value)}
          >
            {prizes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} - {p.nombre} ({p.costo_puntos})
              </option>
            ))}
            {prizes.length === 0 && <option value="">Sin premios</option>}
          </select>
        )}

        {mode === "custom" && (
          <div className="space-y-2">
            <input
              className="border w-full p-2 rounded"
              type="number"
              min="1"
              step="1"
              placeholder="Puntos a canjear"
              value={customPoints}
              onChange={(e) => setCustomPoints(e.target.value)}
            />
            <input
              className="border w-full p-2 rounded"
              placeholder="Nota (opcional)"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
            />
          </div>
        )}

        {currentPoints !== null && (
          <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded p-2">
            Puntos actuales: <span className="font-semibold">{currentPoints}</span>
          </div>
        )}

        {message && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded p-2">
            {message}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}

        <button
          className="bg-blue-500 hover:bg-blue-600 text-white w-full p-2 rounded"
          onClick={submit}
        >
          Canjear
        </button>

        {isAdmin && (
          <div className="pt-2 border-t border-gray-200">
            <div className="text-sm font-semibold text-gray-700 mb-2">
              Ãšltimos movimientos
            </div>
            {txError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
                {txError}
              </div>
            )}
            {!txError && transactions.length === 0 && (
              <div className="text-sm text-gray-500">Sin movimientos.</div>
            )}
            <div className="space-y-2">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded p-2"
                >
                  <div className="flex justify-between">
                    <span>{new Date(t.createdAt).toLocaleString()}</span>
                    <span className="font-semibold">{formatType(t.type)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{formatPoints(t.points)} pts</span>
                    {t.operations ? <span>{t.operations} ops</span> : <span />}
                  </div>
                  {(t.userName || t.userId) && (
                    <div className="text-gray-500">
                      Hecho por: {t.userName || t.userId}
                    </div>
                  )}
                  {t.voidedAt && (
                    <div className="text-rose-600">
                      ANULADA
                      {t.voidedByUserId ? ` ? por ${t.voidedByUserId}` : ""}
                      {t.voidReason ? ` ? ${t.voidReason}` : ""}
                    </div>
                  )}
                  {t.note && <div className="text-gray-500">{t.note}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <a className="block text-center text-blue-700 hover:underline" href="/menu">
          Volver
        </a>
      </div>

      {showAddPrize && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-sm space-y-3">
            <div className="text-sm font-semibold">
              {editingPrizeId ? "Editar premio" : "AÃ±adir premio"}
            </div>
            <input
              className="border w-full p-2 rounded"
              placeholder="Nombre"
              value={newPrizeName}
              onChange={(e) => setNewPrizeName(e.target.value)}
            />
            <input
              className="border w-full p-2 rounded"
              type="number"
              min="1"
              step="1"
              placeholder="Puntos requeridos"
              value={newPrizePoints}
              onChange={(e) => setNewPrizePoints(e.target.value)}
            />
            {prizeError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
                {prizeError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1 rounded border" onClick={closeAddPrize}>
                Cancelar
              </button>
              {editingPrizeId && (
                <button
                  className="px-3 py-1 rounded border"
                  onClick={resetPrizeForm}
                >
                  Nuevo
                </button>
              )}
              <button
                className="px-3 py-1 rounded bg-blue-500 text-white"
                onClick={handleSavePrize}
              >
                Guardar
              </button>
            </div>

            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-600 mb-2">Premios existentes</div>
              {prizes.length === 0 && (
                <div className="text-xs text-gray-500">Sin premios.</div>
              )}
              <div className="space-y-2">
                {prizes.map((p) => (
                  <div
                    key={p.id}
                    className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded p-2"
                  >
                    <div className="flex justify-between">
                      <span>
                        {p.nombre} ({p.costo_puntos})
                      </span>
                      <div className="space-x-2">
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => handleEditPrize(p)}
                        >
                          Editar
                        </button>
                        <button
                          className="text-rose-600 hover:underline"
                          onClick={() => handleDeletePrize(p)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
