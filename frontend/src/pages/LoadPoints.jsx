import { useEffect, useRef, useState } from "react";
import api from "../api/axios";

const POINTS_PER_OPERATION = 50;
const PREDICTION_MATCH_LABEL = "Argentina vs Jordania";
const PREDICTION_MATCH_DATE_LABEL = "27/06";
const TEAMS = [
  {
    key: "argentina",
    label: "Argentina",
    kind: "argentina",
  },
  {
    key: "jordania",
    label: "Jordania",
    kind: "jordania",
  },
];

const resolveOutcomeFromScore = (argentinaGoals, jordaniaGoals) => {
  if (argentinaGoals > jordaniaGoals) return "ARG";
  if (argentinaGoals < jordaniaGoals) return "JOR";
  return "EMPATE";
};

const formatOutcomeLabel = (value) => {
  if (value === "ARG") return "Gana Argentina";
  if (value === "JOR") return "Gana Jordania";
  return "Empate";
};

const openPredictionReceiptPrint = ({
  customerName,
  resultLabel,
  argentinaGoals,
  jordaniaGoals,
  currentPoints,
}) => {
  const safeCustomerName = customerName || "Sin nombre";
  const safeResultLabel = resultLabel || "Sin resultado";
  const safeCurrentPoints = Number.isFinite(Number(currentPoints))
    ? Number(currentPoints)
    : 0;
  const formattedDate = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Tucuman",
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Recibo Pronostico</title>
        <style>
          @page { size: 58mm auto; margin: 0; }
          body { font-family: Arial, sans-serif; margin: 0; }
          .receipt { width: 50mm; padding: 4mm 3mm; }
          .title { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 6px; }
          .subtitle { font-size: 10px; text-align: center; margin-bottom: 8px; }
          .row { font-size: 11px; margin: 4px 0; }
          .label { font-weight: bold; }
          .result { font-size: 12px; font-weight: bold; text-align: center; margin: 8px 0 4px; }
          .score { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 8px; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="title">Aguipuntos</div>
          <div class="subtitle">Recibo de pronostico</div>
          <div class="row"><span class="label">Fecha:</span> ${formattedDate}</div>
          <div class="row"><span class="label">Cliente:</span> ${safeCustomerName}</div>
          <div class="row"><span class="label">Partido:</span> ${PREDICTION_MATCH_LABEL}</div>
          <div class="row"><span class="label">Fecha partido:</span> ${PREDICTION_MATCH_DATE_LABEL}</div>
          <div class="divider"></div>
          <div class="result">${safeResultLabel}</div>
          <div class="score">Argentina ${argentinaGoals} - ${jordaniaGoals} Jordania</div>
          <div class="divider"></div>
          <div class="row"><span class="label">Puntos Aguipuntos:</span> ${safeCurrentPoints}</div>
          <div class="divider"></div>
          <div class="result">¡Gracias por tu visita!</div>
          <div class="subtitle">Avenida Mitre 577 - Aguilares</div>
        </div>
        <script>
          window.onload = () => {
            window.print();
            window.close();
          };
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open("", "print-prediction-receipt", "width=320,height=520");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

const FlagIcon = ({ kind }) => {
  if (kind === "argentina") {
    return (
      <div className="mx-auto h-14 w-20 overflow-hidden rounded-md border border-slate-200 shadow-sm">
        <div className="h-1/3 bg-sky-300" />
        <div className="flex h-1/3 items-center justify-center bg-white">
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
        </div>
        <div className="h-1/3 bg-sky-300" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto h-14 w-20 overflow-hidden rounded-md border border-slate-200 shadow-sm bg-white">
      <div className="absolute inset-y-0 right-0 w-4/5">
        <div className="h-1/3 bg-black" />
        <div className="h-1/3 bg-white" />
        <div className="h-1/3 bg-emerald-600" />
      </div>
      <div
        className="absolute inset-y-0 left-0 w-0 border-y-[28px] border-l-[28px] border-y-transparent border-l-red-600"
        aria-hidden="true"
      />
    </div>
  );
};

export default function LoadPoints() {
  const [dni, setDni] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [operaciones, setOperaciones] = useState("");
  const [currentPoints, setCurrentPoints] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [txError, setTxError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [argentinaGoals, setArgentinaGoals] = useState("0");
  const [jordaniaGoals, setJordaniaGoals] = useState("0");
  const [pendingPrediction, setPendingPrediction] = useState(null);
  const [predictionError, setPredictionError] = useState("");
  const [predictionSuccess, setPredictionSuccess] = useState("");
  const [savingPrediction, setSavingPrediction] = useState(false);
  const lookupTimeoutRef = useRef(null);

  const operacionesNumber = Number(operaciones);
  const isOperacionesValid =
    Number.isInteger(operacionesNumber) && operacionesNumber > 0;
  const pointsCalculated = isOperacionesValid
    ? operacionesNumber * POINTS_PER_OPERATION
    : 0;
  const isCustomerLoaded = selectedCustomerId !== null;
  const role = localStorage.getItem("role") || "admin";
  const isAdmin = role === "admin";
  const isCashier = role === "cashier";
  const argentinaGoalsNumber = Number(argentinaGoals);
  const jordaniaGoalsNumber = Number(jordaniaGoals);
  const predictedOutcome = resolveOutcomeFromScore(
    Number.isInteger(argentinaGoalsNumber) ? argentinaGoalsNumber : 0,
    Number.isInteger(jordaniaGoalsNumber) ? jordaniaGoalsNumber : 0
  );
  const hasPendingPredictionForCustomer =
    pendingPrediction && pendingPrediction.customerId === selectedCustomerId;
  const isCashierPredictionLocked = isCashier && hasPendingPredictionForCustomer;

  const resetPredictionForm = () => {
    setArgentinaGoals("0");
    setJordaniaGoals("0");
    setPredictionError("");
  };

  const openPredictionModal = () => {
    if (hasPendingPredictionForCustomer) {
      setArgentinaGoals(String(pendingPrediction.argentinaGoals));
      setJordaniaGoals(String(pendingPrediction.jordaniaGoals));
      setPredictionError("");
    } else {
      resetPredictionForm();
    }
    setPredictionSuccess("");
    setShowPredictionModal(true);
  };

  const fetchTransactions = async (customerId) => {
    if (!isAdmin) return;
    if (!customerId) return;
    setTxError("");
    try {
      const res = await api.get(
        `/api/customers/customers/${customerId}/transactions?limit=10`
      );
      setTransactions(res.data?.items || []);
    } catch (e) {
      setTransactions([]);
      setTxError(
        e?.response?.data?.message || "Error al cargar movimientos."
      );
    }
  };

  const lookupCustomer = async (rawDni) => {
    const trimmedDni = rawDni.trim();
    if (!trimmedDni || trimmedDni.length < 7) return;
    setLoadingLookup(true);
    setLookupError("");
    try {
      const res = await api.get(
        `/api/customers/customers/${encodeURIComponent(trimmedDni)}`
      );
      setCustomer(res.data);
      setSelectedCustomerId(res.data.id);
      setCurrentPoints(res.data.puntos);
      fetchTransactions(res.data.id);
    } catch (e) {
      const status = e?.response?.status;
      setCustomer(null);
      setSelectedCustomerId(null);
      setCurrentPoints(null);
      setTransactions([]);
      if (status === 404) {
        setLookupError("Cliente no encontrado.");
      } else {
        setLookupError(e?.response?.data?.message || "Error al buscar cliente.");
      }
    } finally {
      setLoadingLookup(false);
    }
  };

  useEffect(() => {
    if (lookupTimeoutRef.current) {
      clearTimeout(lookupTimeoutRef.current);
    }
    const trimmedDni = dni.trim();
    setCustomer(null);
    setLookupError("");
    setError("");
    setMessage("");
    setSelectedCustomerId(null);
    setCurrentPoints(null);
    setTransactions([]);
    setPendingPrediction(null);
    setPredictionSuccess("");
    if (!trimmedDni || trimmedDni.length < 7) {
      setLoadingLookup(false);
      return;
    }
    lookupTimeoutRef.current = setTimeout(() => {
      lookupCustomer(trimmedDni);
    }, 300);
    return () => {
      if (lookupTimeoutRef.current) {
        clearTimeout(lookupTimeoutRef.current);
      }
    };
  }, [dni]);

  const handleSearch = async () => {
    if (!dni) {
      setError("DNI requerido");
      return;
    }
    setError("");
    setMessage("");
    await lookupCustomer(dni);
  };

  const handleSubmit = async () => {
    setError("");
    setMessage("");
    if (!isCustomerLoaded) {
      setError("Primero buscá y cargá el cliente.");
      return;
    }
    if (!isOperacionesValid) {
      setError("Las operaciones deben ser un número entero mayor a 0.");
      return;
    }
    const body = {
      dni,
      puntosAgregados: Number(pointsCalculated),
      operations: operacionesNumber,
    };
    try {
      const res = await api.post("/api/points/points/load", body);
      let predictionSaved = false;
      if (pendingPrediction) {
        try {
          await api.post("/api/predictions", {
            customerId: selectedCustomerId,
            predictedOutcome: pendingPrediction.predictedOutcome,
            argentinaGoals: pendingPrediction.argentinaGoals,
            jordaniaGoals: pendingPrediction.jordaniaGoals,
          });
          predictionSaved = true;
        } catch (predictionSaveError) {
          setError(
            predictionSaveError?.response?.data?.message ||
              "Los puntos se cargaron, pero no se pudo guardar el pronostico."
          );
        }
      }
      setCurrentPoints(res.data.newPoints);
      setMessage(
        pendingPrediction
          ? predictionSaved
            ? `${res.data.message} Nuevo total: ${res.data.newPoints} puntos. Pronostico guardado.`
            : `${res.data.message} Nuevo total: ${res.data.newPoints} puntos.`
          : `${res.data.message} Nuevo total: ${res.data.newPoints} puntos.`
      );
      setOperaciones("");
      if (predictionSaved) {
        setPendingPrediction(null);
      }
      fetchTransactions(selectedCustomerId);
    } catch (e) {
      const data = e?.response?.data;
      setError(data?.error || data?.message || "Error al cargar puntos");
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleSubmit();
  };

  const handleDniKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleSavePrediction = async () => {
    const argentina = Number(argentinaGoals);
    const jordania = Number(jordaniaGoals);

    if (!isCustomerLoaded) {
      setPredictionError("Primero buscá y cargá el cliente.");
      return;
    }
    if (!Number.isInteger(argentina) || argentina < 0) {
      setPredictionError("Los goles de Argentina deben ser un entero mayor o igual a 0.");
      return;
    }
    if (!Number.isInteger(jordania) || jordania < 0) {
      setPredictionError("Los goles de Jordania deben ser un entero mayor o igual a 0.");
      return;
    }
    setSavingPrediction(true);
    setPredictionError("");
    try {
      openPredictionReceiptPrint({
        customerName: customer?.nombre,
        resultLabel: formatOutcomeLabel(predictedOutcome),
        argentinaGoals: argentina,
        jordaniaGoals: jordania,
        currentPoints: currentPoints ?? customer?.puntos ?? 0,
      });
      setPendingPrediction({
        customerId: selectedCustomerId,
        predictedOutcome,
        argentinaGoals: argentina,
        jordaniaGoals: jordania,
      });
      setPredictionSuccess(
        "Pronostico listo. Se guardara cuando completes la carga de puntos."
      );
      setShowPredictionModal(false);
      resetPredictionForm();
    } catch (e) {
      setPredictionError(
        e?.response?.data?.message || "Error al guardar pronostico."
      );
    } finally {
      setSavingPrediction(false);
    }
  };

  const handleReprintPrediction = () => {
    if (!hasPendingPredictionForCustomer) return;
    openPredictionReceiptPrint({
      customerName: customer?.nombre,
      resultLabel: formatOutcomeLabel(pendingPrediction.predictedOutcome),
      argentinaGoals: pendingPrediction.argentinaGoals,
      jordaniaGoals: pendingPrediction.jordaniaGoals,
      currentPoints: currentPoints ?? customer?.puntos ?? 0,
    });
  };

  const formatType = (type) => (type === "REDEEM" ? "Canje" : "Carga");
  const formatPoints = (points) =>
    points > 0 ? `+${points}` : `${points}`;

  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow w-80 space-y-3">
        <h1 className="text-lg font-semibold text-center">Cargar Puntos</h1>

        <form onSubmit={handleFormSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              className="border w-full p-2 rounded"
              placeholder="DNI"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              onKeyDown={handleDniKeyDown}
            />
            <button
              type="button"
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 rounded"
              onClick={handleSearch}
            >
              Buscar
            </button>
          </div>

          <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded p-2">
            {loadingLookup && <div>Buscando cliente...</div>}
            {!loadingLookup && customer?.nombre && (
              <div>
                Cliente: <span className="font-semibold">{customer.nombre}</span>
                {role === "admin" || role === "cashier" ? (
                  <button
                    type="button"
                    className="ml-2 text-xs text-blue-700 underline hover:text-blue-900"
                    onClick={openPredictionModal}
                  >
                    Pronostico
                  </button>
                ) : null}
              </div>
            )}
            {!loadingLookup && customer?.puntos !== undefined && (
              <div>
                Puntos actuales:{" "}
                <span className="font-semibold">{customer.puntos}</span>
              </div>
            )}
            {!loadingLookup && lookupError && <div>{lookupError}</div>}
          </div>

          <input
            className="border w-full p-2 rounded"
            type="number"
            min="1"
            step="1"
            placeholder="Operaciones"
            value={operaciones}
            onChange={(e) => setOperaciones(e.target.value)}
          />

          <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded p-2">
            Puntos a cargar:{" "}
            <span className="font-semibold">{pointsCalculated}</span>{" "}
            <span className="text-xs text-gray-500">
              (50 puntos por operación)
            </span>
          </div>

          {currentPoints !== null && (
            <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded p-2">
              Puntos actuales:{" "}
              <span className="font-semibold">{currentPoints}</span>
            </div>
          )}

          {message && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded p-2">
              {message}
            </div>
          )}

          {predictionSuccess && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded p-2">
              {predictionSuccess}
            </div>
          )}

          {pendingPrediction && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              Pronostico pendiente: {formatOutcomeLabel(pendingPrediction.predictedOutcome)}.
              Se guardara al cargar los puntos.
            </div>
          )}

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white w-full p-2 rounded"
            disabled={!isCustomerLoaded || !isOperacionesValid}
          >
            Cargar
          </button>
        </form>

        {isAdmin && (
          <div className="pt-2 border-t border-gray-200">
            <div className="text-sm font-semibold text-gray-700 mb-2">
              Últimos movimientos
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

      {showPredictionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Registrar pronostico</div>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={() => setShowPredictionModal(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded p-2 space-y-1">
              <div>
                Cliente: <span className="font-semibold">{customer?.nombre}</span>
              </div>
              <div>
                Partido: <span className="font-semibold">{PREDICTION_MATCH_LABEL}</span>
              </div>
              <div>
                Fecha: <span className="font-semibold">{PREDICTION_MATCH_DATE_LABEL}</span>
              </div>
            </div>

            <div className="rounded border border-emerald-100 bg-emerald-50 p-2 text-sm text-emerald-800">
              Resultado:{" "}
              <span className="font-semibold">
                {formatOutcomeLabel(
                  isCashierPredictionLocked
                    ? pendingPrediction.predictedOutcome
                    : predictedOutcome
                )}
              </span>
            </div>

            {isCashierPredictionLocked && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                Este pronostico ya fue guardado para este cliente. Como cajero solo podés reimprimirlo hasta completar la carga de puntos.
              </div>
            )}

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Marcador pronosticado
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="rounded-lg border border-blue-200 bg-white p-3 text-center">
                  <FlagIcon kind={TEAMS[0].kind} />
                  <div className="mt-2 text-sm font-semibold text-slate-800">
                    {TEAMS[0].label}
                  </div>
                  <input
                    className="mt-3 w-full rounded border border-blue-200 p-2 text-center text-lg font-semibold"
                    type="number"
                    min="0"
                    step="1"
                    value={argentinaGoals}
                    onChange={(e) => setArgentinaGoals(e.target.value)}
                    disabled={isCashierPredictionLocked}
                    aria-label="Goles de Argentina"
                  />
                </div>

                <div className="text-xl font-bold text-slate-400">vs</div>

                <div className="rounded-lg border border-blue-200 bg-white p-3 text-center">
                  <FlagIcon kind={TEAMS[1].kind} />
                  <div className="mt-2 text-sm font-semibold text-slate-800">
                    {TEAMS[1].label}
                  </div>
                  <input
                    className="mt-3 w-full rounded border border-blue-200 p-2 text-center text-lg font-semibold"
                    type="number"
                    min="0"
                    step="1"
                    value={jordaniaGoals}
                    onChange={(e) => setJordaniaGoals(e.target.value)}
                    disabled={isCashierPredictionLocked}
                    aria-label="Goles de Jordania"
                  />
                </div>
              </div>
            </div>

            {predictionError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-2">
                {predictionError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded border"
                onClick={() => setShowPredictionModal(false)}
              >
                Cancelar
              </button>
              {isCashierPredictionLocked ? (
                <button
                  type="button"
                  className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={handleReprintPrediction}
                >
                  Reimprimir
                </button>
              ) : (
                <button
                  type="button"
                  className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white disabled:bg-blue-300"
                  onClick={handleSavePrediction}
                  disabled={savingPrediction}
                >
                  {savingPrediction ? "Guardando..." : "Guardar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
