import { useState } from "react";
import api from "../api/axios";

export default function AddCustomer() {
  const [numeroDNI, setNumeroDNI] = useState("");
  const [nombreYApellido, setNombreYApellido] = useState("");
  const [numeroCelular, setNumeroCelular] = useState("");

  const submit = async () => {
    try {
      const res = await api.post("/api/customers/customers", {
        numeroDNI,
        nombreYApellido,
        numeroCelular,
      });
      alert(res.data.message);
      setNumeroDNI("");
      setNombreYApellido("");
      setNumeroCelular("");
    } catch (e) {
      alert(e?.response?.data?.message || "Error al agregar cliente.");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
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

        <a className="block text-center text-blue-700 hover:underline" href="/menu">
          Volver
        </a>
      </div>
    </div>
  );
}
