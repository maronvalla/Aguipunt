import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";

const POINTS_PER_OPERATION = 50;
const openRaffleReceiptPrint = ({
  customerName,
  pointsLoaded,
  chanceCount,
}) => {
  const safeCustomerName = customerName || "Sin nombre";
  const safePointsLoaded = Number.isFinite(Number(pointsLoaded))
    ? Number(pointsLoaded)
    : 0;
  const safeChanceCount = Number.isFinite(Number(chanceCount))
    ? Number(chanceCount)
    : 0;
  const formattedDate = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Tucuman",
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Ticket Sorteo</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          html, body { width: 80mm; margin: 0; padding: 0; background: #fff; }
          body { font-family: Arial, sans-serif; }
          .receipt { width: 100%; padding: 6mm 4mm; }
          .title { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 6px; }
          .subtitle { font-size: 10px; text-align: center; margin-bottom: 8px; }
          .row { font-size: 11px; margin: 4px 0; }
          .label { font-weight: bold; }
          .headline { font-size: 15px; font-weight: bold; text-align: center; margin: 10px 0 8px; text-transform: uppercase; }
          .chance { font-size: 18px; font-weight: bold; text-align: center; margin: 8px 0; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="title">Aguipuntos</div>
          <div class="subtitle">Ticket sorteo junio y julio</div>
          <div class="row"><span class="label">Fecha:</span> ${formattedDate}</div>
          <div class="row"><span class="label">Cliente:</span> ${safeCustomerName}</div>
          <div class="divider"></div>
          <div class="headline">Ya estas participando</div>
          <div class="row"><span class="label">Puntos cargados:</span> ${safePointsLoaded}</div>
          <div class="chance">Chances hasta ahora: ${safeChanceCount}</div>
          <div class="divider"></div>
          <div class="subtitle">Durante junio y julio, cada carga suma una chance.</div>
          <div class="subtitle">Avenida Mitre 577 - Aguilares</div>
        </div>
      </body>
    </html>
  `;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    iframe.remove();
    return false;
  }

  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();

  window.setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => {
      iframe.remove();
    }, 500);
  }, 250);

  return true;
};

export default function LoadPoints() {
  const [searchParams] = useSearchParams();
  const [dni, setDni] = useState(() => searchParams.get("dni") || "");
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
  const [raffleReceiptToPrint, setRaffleReceiptToPrint] = useState(null);
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
    const dniFromQuery = searchParams.get("dni") || "";
    if (dniFromQuery && dniFromQuery !== dni) {
      setDni(dniFromQuery);
    }
  }, [searchParams, dni]);

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
    setRaffleReceiptToPrint(null);
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
    setRaffleReceiptToPrint(null);
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
      setCurrentPoints(res.data.newPoints);
      setMessage(`${res.data.message} Nuevo total: ${res.data.newPoints} puntos.`);
      setOperaciones("");
      if (res.data?.raffleTicket) {
        setRaffleReceiptToPrint(res.data.raffleTicket);
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

  const handlePrintRaffleReceipt = () => {
    if (!raffleReceiptToPrint) return;
    openRaffleReceiptPrint(raffleReceiptToPrint);
    setRaffleReceiptToPrint(null);
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

      {raffleReceiptToPrint && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-sm space-y-3">
            <div className="text-sm font-semibold">Ticket de sorteo listo para imprimir</div>
            <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded p-3 space-y-1">
              <div>
                Cliente: <span className="font-semibold">{raffleReceiptToPrint.customerName || "Sin nombre"}</span>
              </div>
              <div>
                Puntos cargados: <span className="font-semibold">{raffleReceiptToPrint.pointsLoaded}</span>
              </div>
              <div>
                Chances hasta ahora: <span className="font-semibold">{raffleReceiptToPrint.chanceCount}</span>
              </div>
              <div className="pt-1 text-center font-semibold text-emerald-700">
                Ya estas participando
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded border"
                onClick={() => setRaffleReceiptToPrint(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handlePrintRaffleReceipt}
              >
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
