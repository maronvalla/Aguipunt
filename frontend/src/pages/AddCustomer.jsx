import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function AddCustomer() {
  const navigate = useNavigate();
  const [numeroDNI, setNumeroDNI] = useState("");
  const [nombreYApellido, setNombreYApellido] = useState("");
  const [numeroCelular, setNumeroCelular] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastCreatedDni, setLastCreatedDni] = useState("");

  const submit = async () => {
    try {
      setErrorMessage("");
      const res = await api.post("/api/customers/customers", {
        numeroDNI,
        nombreYApellido,
        numeroCelular,
      });
      setSuccessMessage(res.data.message || "Cliente agregado correctamente.");
      setLastCreatedDni(numeroDNI);
      setNumeroDNI("");
      setNombreYApellido("");
      setNumeroCelular("");
    } catch (e) {
      setSuccessMessage("");
      setErrorMessage(e?.response?.data?.message || "Error al agregar cliente.");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  const goToLoadPoints = () => {
    if (!lastCreatedDni) return;
    navigate(`/load?dni=${encodeURIComponent(lastCreatedDni)}`);
  };

  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow w-80 space-y-3">
        <h1 className="text-lg font-semibold text-center">Añadir Cliente</h1>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="border w-full p-2 rounded"
            placeholder="DNI"
            value={numeroDNI}
            onChange={(e) => setNumeroDNI(e.target.value)}
          />
          <input
            className="border w-full p-2 rounded"
            placeholder="Nombre y Apellido"
            value={nombreYApellido}
            onChange={(e) => setNombreYApellido(e.target.value)}
          />
          <input
            className="border w-full p-2 rounded"
            placeholder="Celular"
            value={numeroCelular}
            onChange={(e) => setNumeroCelular(e.target.value)}
          />

          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white w-full p-2 rounded"
          >
            Guardar
          </button>
        </form>

        {successMessage && (
          <div className="space-y-3 rounded-lg border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-blue-50 p-4 text-sm text-emerald-900 shadow-sm">
            <div className="font-semibold">{successMessage}</div>
            <div className="text-xs uppercase tracking-wide text-emerald-700">
              Siguiente paso recomendado
            </div>
            <button
              type="button"
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-emerald-700"
              onClick={goToLoadPoints}
            >
              Ir a cargar puntos ahora
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="rounded border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <a className="block text-center text-blue-700 hover:underline" href="/menu">
          Volver
        </a>
      </div>
    </div>
  );
}
