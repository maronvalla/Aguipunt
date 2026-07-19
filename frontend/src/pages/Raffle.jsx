import { useEffect, useRef, useState } from "react";
import api, { API_BASE } from "../api/axios";
import { formatTucumanDateTime } from "../utils/date";

const CONFETTI = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 100}%`,
  delay: `${(index % 9) * 0.16}s`,
  duration: `${2.8 + (index % 5) * 0.35}s`,
  color: ["#fde047", "#34d399", "#60a5fa", "#f472b6", "#fb923c"][index % 5],
}));

function TvPrizeIcon() {
  return (
    <div className="raffle-tv-float relative mx-auto w-48 sm:w-64" aria-label="Premio: televisión">
      <div className="absolute -inset-8 rounded-full bg-cyan-300/20 blur-2xl" />
      <svg className="relative w-full drop-shadow-2xl" viewBox="0 0 260 205" role="img">
        <defs>
          <linearGradient id="tvFrame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f8fafc" />
            <stop offset="1" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id="tvScreen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="0.5" stopColor="#2563eb" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <rect x="8" y="18" width="244" height="150" rx="18" fill="url(#tvFrame)" />
        <rect x="17" y="27" width="226" height="132" rx="12" fill="#0f172a" />
        <rect x="24" y="34" width="212" height="118" rx="8" fill="url(#tvScreen)" />
        <path d="M25 115C70 70 119 145 176 75c22-27 43-23 60-12v89H24z" fill="#22d3ee" opacity=".38" />
        <path d="M105 168h50l8 19H97z" fill="#cbd5e1" />
        <rect x="75" y="186" width="110" height="10" rx="5" fill="#e2e8f0" />
        <circle cx="219" cy="93" r="4" fill="#f8fafc" opacity=".8" />
      </svg>
      <div className="absolute -right-3 top-3 rotate-6 rounded-full bg-yellow-300 px-3 py-1 text-sm font-black text-blue-950 shadow-lg">
        ¡PREMIO!
      </div>
    </div>
  );
}

export default function Raffle() {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [items, setItems] = useState([]);
  const [campaign, setCampaign] = useState({ from: "2026-06-01", to: "2026-07-31" });
  const [winner, setWinner] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [showExperience, setShowExperience] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [topLoaders, setTopLoaders] = useState([]);
  const [topLoadersLoading, setTopLoadersLoading] = useState(false);
  const [topLoadersError, setTopLoadersError] = useState("");
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

  const fetchTopLoaders = async () => {
    setTopLoadersLoading(true);
    setTopLoadersError("");
    try {
      const res = await api.get("/api/raffle/top-loaders");
      setTopLoaders(res.data?.items || []);
    } catch (e) {
      setTopLoaders([]);
      setTopLoadersError(e?.response?.data?.message || "No se pudo cargar el ranking.");
    } finally {
      setTopLoadersLoading(false);
    }
  };

  const executeDraw = async () => {
    setDrawing(true);
    setError("");
    setDrawError("");
    try {
      const res = await api.post("/api/raffle/draw");
      setWinner(res.data || null);
      fetchTopLoaders();
    } catch (e) {
      const message = e?.response?.data?.message || "Error al realizar el sorteo.";
      setError(message);
      setDrawError(message);
    } finally {
      setDrawing(false);
      setCountdown(null);
    }
  };

  const activateDraw = () => {
    setError("");
    setDrawError("");
    setShowExperience(true);
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
    fetchTopLoaders();
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

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div className="text-sm text-gray-600">
            {items.length} carga{items.length === 1 ? "" : "s"} encontrada
            {items.length === 1 ? "" : "s"}.
          </div>

          <details className="group relative justify-self-start sm:justify-self-center">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true">🏆</span>
              Top 5 cargadores
              <span className="text-[10px] transition group-open:rotate-180">▼</span>
            </summary>
            <div className="z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:absolute sm:bottom-full sm:left-1/2 sm:mb-2 sm:mt-0 sm:-translate-x-1/2">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Más puntos cargados
              </div>
              {topLoadersLoading && (
                <div className="py-3 text-center text-xs text-slate-400">Cargando ranking...</div>
              )}
              {!topLoadersLoading && topLoadersError && (
                <div className="rounded bg-red-50 p-2 text-xs text-red-600">{topLoadersError}</div>
              )}
              {!topLoadersLoading && !topLoadersError && topLoaders.length === 0 && (
                <div className="py-3 text-center text-xs text-slate-400">Sin cargas para mostrar.</div>
              )}
              {!topLoadersLoading && !topLoadersError && topLoaders.length > 0 && (
                <ol className="space-y-1.5">
                  {topLoaders.map((loader, index) => (
                    <li
                      key={`${loader.userId ?? "user"}-${loader.userName}`}
                      className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs"
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-bold ${index === 0 ? "bg-yellow-100 text-yellow-700" : "bg-slate-200 text-slate-600"}`}>
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                        {loader.userName}
                      </span>
                      <span className="text-right">
                        <span className="block font-bold text-blue-700">
                          {Number(loader.totalPoints || 0).toLocaleString("es-AR")} pts
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {loader.loadCount} carga{loader.loadCount === 1 ? "" : "s"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>

          <button
            className="justify-self-start rounded border px-3 py-2 text-sm hover:bg-gray-50 sm:justify-self-end"
            type="button"
            onClick={downloadNewRegistrations}
          >
            Descargar nuevos registrados
          </button>
        </div>
      </div>

      {showExperience && (
        <div
          className="fixed inset-0 z-50 flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-8 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Sorteo por una televisión"
        >
          <div className="raffle-aurora absolute inset-0" />
          <div className="raffle-grid absolute inset-0 opacity-30" />
          <div className="raffle-orbit absolute h-[42rem] w-[42rem] rounded-full border border-cyan-300/20" />
          <div className="raffle-orbit-reverse absolute h-[30rem] w-[30rem] rounded-full border border-violet-300/20" />

          {!drawInProgress && winner && !drawError &&
            CONFETTI.map((piece) => (
              <span
                key={piece.id}
                className="raffle-confetti absolute -top-8 h-4 w-2 rounded-sm"
                style={{
                  left: piece.left,
                  backgroundColor: piece.color,
                  animationDelay: piece.delay,
                  animationDuration: piece.duration,
                }}
              />
            ))}

          <main className="relative z-10 w-full max-w-4xl text-center">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.45em] text-cyan-200 sm:text-sm">
              Aguipuntos presenta
            </p>
            <TvPrizeIcon />

            {countdown !== null && countdown > 0 && (
              <div className="raffle-pop mt-4">
                <p className="text-lg font-semibold text-cyan-100 sm:text-2xl">
                  La televisión está por encontrar dueño
                </p>
                <div className="relative mx-auto mt-6 flex h-44 w-44 items-center justify-center sm:h-56 sm:w-56">
                  <div className="raffle-countdown-ring absolute inset-0 rounded-full border-4 border-cyan-300/25" />
                  <div className="absolute inset-4 rounded-full border border-white/20 bg-white/10 shadow-[0_0_55px_rgba(34,211,238,0.35)] backdrop-blur" />
                  <span className="relative text-8xl font-black tabular-nums drop-shadow-xl sm:text-9xl">
                    {countdown}
                  </span>
                </div>
                <div className="mx-auto mt-7 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-yellow-300 to-pink-400 transition-all duration-1000 ease-linear"
                    style={{ width: `${((10 - countdown) / 10) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {drawing && (
              <div className="raffle-pop mt-7 space-y-4">
                <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-yellow-300" />
                <h2 className="text-3xl font-black sm:text-5xl">Buscando la chance ganadora...</h2>
                <p className="text-cyan-100">Todas las cargas tienen su oportunidad.</p>
              </div>
            )}

            {!drawInProgress && winner && !drawError && (
              <div className="raffle-winner-reveal mx-auto mt-6 max-w-3xl rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-xl sm:p-10">
                <p className="text-sm font-black uppercase tracking-[0.35em] text-yellow-300 sm:text-lg">
                  ¡Tenemos ganador!
                </p>
                <h2 className="mt-4 break-words text-4xl font-black leading-tight sm:text-7xl">
                  {winner.winner?.customerName || "Sin nombre"}
                </h2>
                <p className="mt-4 text-2xl font-bold text-cyan-100 sm:text-4xl">
                  {winner.winner?.customerPhone || "Sin número de teléfono"}
                </p>
                <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-slate-950/40 px-5 py-2 text-sm text-slate-200 sm:text-base">
                  <span>Chance #{winner.chanceNumber}</span>
                  <span className="text-cyan-300">•</span>
                  <span>{winner.eligibleEntryCount} chances participantes</span>
                </div>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="rounded-xl bg-white px-7 py-3 font-bold text-blue-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-cyan-50"
                    onClick={() => setShowExperience(false)}
                  >
                    Volver al sorteo
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-white/30 bg-white/10 px-7 py-3 font-bold text-white transition hover:bg-white/20"
                    onClick={activateDraw}
                  >
                    Sortear nuevamente
                  </button>
                </div>
              </div>
            )}

            {!drawInProgress && drawError && (
              <div className="raffle-pop mx-auto mt-6 max-w-xl rounded-2xl border border-red-300/30 bg-red-500/15 p-6 backdrop-blur">
                <h2 className="text-2xl font-black">No se pudo completar el sorteo</h2>
                <p className="mt-2 text-red-100">{drawError}</p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="rounded-xl bg-white px-6 py-3 font-bold text-blue-950"
                    onClick={activateDraw}
                  >
                    Intentar nuevamente
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-white/30 px-6 py-3 font-bold"
                    onClick={() => setShowExperience(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
