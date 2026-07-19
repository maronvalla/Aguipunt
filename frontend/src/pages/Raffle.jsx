import { useEffect, useRef, useState } from "react";
import api, { API_BASE } from "../api/axios";
import { formatTucumanDateTime } from "../utils/date";

export default function Raffle() {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [items, setItems] = useState([]);
  const [campaign, setCampaign] = useState({ from: "2026-06-01", to: "2026-07-31" });
  const [winner, setWinner] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(null);
  const drawRequestStarted = useRef(false);

  const buildEntriesQuery = () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (userFilter.trim()) params.set("user", userFilter.trim());
    const query = params.toString();
    return `/api/raffle/entries${query ? `?${query}` : ""}`;
  };

  const fetchEntries = async () => {
    if (activeRequest.current) {
      activeRequest.current.abort();
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const res = await api.get(buildEntriesQuery(), {
        signal: controller.signal,
      });
      if (activeRequest.current === controller) {
        activeRequest.current = null;
      }
      setItems(res.data?.items || []);
      if (res.data?.campaign) {
        setCampaign(res.data.campaign);
      }
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") {
        return;
      }
      setItems([]);
      setError(e?.response?.data?.message || "Error al cargar sorteo.");
    } finally {
      setLoading(false);
    }
  };

  const fetchLastResult = async () => {
    try {
      const res = await api.get("/api/raffle/result");
      setWinner(res.data?.result || null);
    } catch (e) {
      setError(e?.response?.data?.message || "Error al cargar el ganador.");
    }
  };

  const executeDraw = async () => {
    setDrawing(true);
    setError("");
    try {
      const res = await api.post("/api/raffle/draw");
      setWinner(res.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || "Error al realizar el sorteo.");
    } finally {
      setDrawing(false);
      setCountdown(null);
    }
  };

  const activateDraw = () => {
    setError("");
    drawRequestStarted.current = false;
    setCountdown(10);
  };

  const downloadNewRegistrations = async () => {
    try {
      setError("");
      const token = localStorage.getItem("token");
      const baseUrl = API_BASE.replace(/\/+$/, "");
      const response = await fetch(
        `${baseUrl}/api/raffle/new-registrations/export.xlsx`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Error al descargar archivo.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = "nuevos-registrados-junio-julio-2026.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(e?.message || "Error al descargar archivo.");
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchEntries();
    }, 250);
    return () => {
      clearTimeout(handle);
      if (activeRequest.current) {
        activeRequest.current.abort();
      }
    };
  }, [search, userFilter]);

  useEffect(() => {
    fetchLastResult();
  }, []);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown === 0) {
      if (!drawRequestStarted.current) {
        drawRequestStarted.current = true;
        executeDraw();
      }
      return undefined;
    }

    const handle = setTimeout(() => {
      setCountdown((current) => current - 1);
    }, 1000);
    return () => clearTimeout(handle);
  }, [countdown]);

  const drawInProgress = countdown !== null || drawing;

  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-lg shadow w-full max-w-6xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Sorteo</h1>
            <p className="text-sm text-gray-600">
              Campaña {campaign.from} al {campaign.to}
            </p>
          </div>
          <a className="text-blue-700 hover:underline" href="/menu">
            Volver
          </a>
        </div>

        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-center">
          {countdown !== null && countdown > 0 && (
            <div className="py-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                El sorteo comienza en
              </p>
              <div className="mt-2 text-7xl font-bold tabular-nums text-blue-700">
                {countdown}
              </div>
            </div>
          )}

          {drawing && (
            <div className="py-8 text-lg font-semibold text-blue-700">
              Eligiendo ganador...
            </div>
          )}

          {!drawInProgress && winner && (
            <div className="space-y-2 py-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Ganador del sorteo
              </p>
              <h2 className="text-3xl font-bold text-gray-900">
                {winner.winner?.customerName || "Sin nombre"}
              </h2>
              <p className="text-xl font-semibold text-gray-700">
                {winner.winner?.customerPhone || "Sin número de teléfono"}
              </p>
              <p className="text-sm text-gray-500">
                Chance #{winner.chanceNumber} de {winner.eligibleEntryCount}
                {winner.drawnAt
                  ? ` · ${formatTucumanDateTime(winner.drawnAt)}`
                  : ""}
              </p>
            </div>
          )}

          {!drawInProgress && !winner && (
            <p className="py-3 text-sm text-gray-600">
              Cada carga válida de junio y julio representa una chance.
            </p>
          )}

          {!drawInProgress && (
            <button
              className="mt-3 rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={loading}
              onClick={activateDraw}
            >
              Activar sorteo
            </button>
          )}
        </section>

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="border w-full p-2 rounded"
            placeholder="Buscar por nombre, DNI o celular"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="border w-full p-2 rounded"
            placeholder="Filtrar por usuario cargador"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}

        <div className="border rounded overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[90px_180px_1.3fr_120px_130px_100px_110px_1fr] gap-2 bg-gray-50 text-sm font-semibold p-2">
              <div>Chance</div>
              <div>Fecha</div>
              <div>Cliente</div>
              <div>DNI</div>
              <div>Celular</div>
              <div>Puntos</div>
              <div>Operación</div>
              <div>Usuario</div>
            </div>

            {loading && (
              <div className="p-3 text-sm text-gray-500">Cargando...</div>
            )}

            {!loading && items.length === 0 && (
              <div className="p-3 text-sm text-gray-500">
                No hay cargas de puntos para el sorteo.
              </div>
            )}

            {!loading &&
              items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[90px_180px_1.3fr_120px_130px_100px_110px_1fr] gap-2 p-2 text-sm border-t"
                >
                  <div className="font-semibold">#{item.chanceNumber}</div>
                  <div>{formatTucumanDateTime(item.createdAt)}</div>
                  <div>{item.customerName || "-"}</div>
                  <div>{item.customerDni || "-"}</div>
                  <div>{item.customerPhone || "-"}</div>
                  <div className="text-emerald-700">+{item.points}</div>
                  <div>{item.operations || "-"}</div>
                  <div>{item.userName || item.userId || "-"}</div>
                </div>
              ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-600">
            {items.length} carga{items.length === 1 ? "" : "s"} encontrada
            {items.length === 1 ? "" : "s"}.
          </div>
          <button
            className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
            type="button"
            onClick={downloadNewRegistrations}
          >
            Descargar nuevos registrados
          </button>
        </div>
      </div>
    </div>
  );
}
