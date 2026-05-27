import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { formatTucumanDateTime } from "../utils/date";

const OUTCOME_OPTIONS = [
  { value: "", label: "Todos los resultados" },
  { value: "ARG", label: "Argentina" },
  { value: "EMPATE", label: "Empate" },
  { value: "JOR", label: "Jordania" },
];

const formatOutcome = (value) => {
  if (value === "ARG") return "Argentina";
  if (value === "JOR") return "Jordania";
  return "Empate";
};

export default function Predictions() {
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const [argentinaGoals, setArgentinaGoals] = useState("");
  const [jordaniaGoals, setJordaniaGoals] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(null);

  const buildExportUrl = () => {
    const baseUrl = import.meta.env.VITE_API_URL || "";
    const trimmedBase = baseUrl.replace(/\/+$/, "");
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (outcome) params.set("outcome", outcome);
    if (argentinaGoals.trim() !== "") {
      params.set("argentinaGoals", argentinaGoals.trim());
    }
    if (jordaniaGoals.trim() !== "") {
      params.set("jordaniaGoals", jordaniaGoals.trim());
    }
    const query = params.toString();
    return `${trimmedBase}/api/predictions/export.xlsx${query ? `?${query}` : ""}`;
  };

  const downloadXlsx = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(buildExportUrl(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Error al descargar archivo.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = "pronosticos.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(e?.message || "Error al descargar archivo.");
    }
  };

  const fetchPredictions = async () => {
    if (activeRequest.current) {
      activeRequest.current.abort();
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (outcome) params.set("outcome", outcome);
      if (argentinaGoals.trim() !== "") {
        params.set("argentinaGoals", argentinaGoals.trim());
      }
      if (jordaniaGoals.trim() !== "") {
        params.set("jordaniaGoals", jordaniaGoals.trim());
      }
      const res = await api.get(`/api/predictions?${params.toString()}`, {
        signal: controller.signal,
      });
      if (activeRequest.current === controller) {
        activeRequest.current = null;
      }
      setItems(res.data?.items || []);
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") {
        return;
      }
      setItems([]);
      setError(e?.response?.data?.message || "Error al listar pronosticos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchPredictions();
    }, 250);
    return () => {
      clearTimeout(handle);
      if (activeRequest.current) {
        activeRequest.current.abort();
      }
    };
  }, [search, outcome, argentinaGoals, jordaniaGoals]);

  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Pronosticos</h1>
          <a className="text-blue-700 hover:underline" href="/menu">
            Volver
          </a>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            className="border w-full p-2 rounded"
            placeholder="Buscar por nombre o DNI"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border w-full p-2 rounded bg-white"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            {OUTCOME_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            className="border w-full p-2 rounded"
            type="number"
            min="0"
            step="1"
            placeholder="Goles Argentina"
            value={argentinaGoals}
            onChange={(e) => setArgentinaGoals(e.target.value)}
          />
          <input
            className="border w-full p-2 rounded"
            type="number"
            min="0"
            step="1"
            placeholder="Goles Jordania"
            value={jordaniaGoals}
            onChange={(e) => setJordaniaGoals(e.target.value)}
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}

        <div className="border rounded overflow-hidden">
          <div className="grid grid-cols-6 gap-2 bg-gray-50 text-sm font-semibold p-2">
            <div>Fecha registro</div>
            <div>Cliente</div>
            <div>DNI</div>
            <div>Resultado</div>
            <div>Marcador</div>
            <div>Usuario</div>
          </div>

          {loading && (
            <div className="p-3 text-sm text-gray-500">Cargando...</div>
          )}

          {!loading && items.length === 0 && (
            <div className="p-3 text-sm text-gray-500">
              No hay pronosticos para mostrar.
            </div>
          )}

          {!loading &&
            items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-6 gap-2 p-2 text-sm border-t"
              >
                <div>{formatTucumanDateTime(item.createdAt)}</div>
                <div>{item.customerName}</div>
                <div>{item.customerDni}</div>
                <div>{formatOutcome(item.predictedOutcome)}</div>
                <div>
                  Argentina {item.argentinaGoals} - Jordania {item.jordaniaGoals}
                </div>
                <div>{item.userName || item.userId || "-"}</div>
              </div>
            ))}
        </div>

        <div className="flex justify-end">
          <button
            className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
            type="button"
            onClick={downloadXlsx}
          >
            Descargar Excel
          </button>
        </div>
      </div>
    </div>
  );
}
