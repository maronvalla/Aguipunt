// backend/scripts/push_customers_to_api.js
const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2];
const baseUrl = process.argv[3];
const token = process.argv[4];

if (!inputPath || !baseUrl || !token) {
  console.error(
    'Uso: node backend/scripts/push_customers_to_api.js "C:\\\\ruta\\\\exportaraguipuntos.csv" "https://aguipunt-production.up.railway.app" "JWT"'
  );
  process.exit(1);
}

const filePath = path.resolve(inputPath);
if (!fs.existsSync(filePath)) {
  console.error("Archivo no encontrado:", filePath);
  process.exit(1);
}

const normalizeDni = (value) => String(value || "").replace(/[.\s]/g, "");

const parsePoints = (value) => {
  if (value === null || value === undefined) return NaN;
  const raw = String(value).trim();
  if (raw === "") return 0;
  const normalized = raw.replace(/[.,]/g, "");
  if (normalized === "") return NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildItemsFromCsv = (content) => {
  const lines = content.split(/\r?\n/);
  const items = [];
  let errors = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.trim() === "") continue;

    const parts = rawLine.split(";");
    const dniRaw = (parts[0] || "").trim();
    const nombre = (parts[1] || "").trim();
    const puntosRaw = (parts[2] || "").trim();
    const celularRaw = (parts[3] || "").trim();

    if (
      i === 0 &&
      dniRaw.toLowerCase() === "dni" &&
      nombre.toLowerCase() === "nombre"
    ) {
      continue;
    }

    const dni = normalizeDni(dniRaw);
    const puntos = parsePoints(puntosRaw);
    const celular = celularRaw === "" ? null : celularRaw;

    if (!dni || !nombre || !Number.isFinite(puntos)) {
      errors += 1;
      continue;
    }

    items.push({ dni, nombre, celular, puntos });
  }

  return { items, errors };
};

const chunkItems = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const postBatch = async (url, jwt, items) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
};

const run = async () => {
  const content = fs.readFileSync(filePath, "utf8");
  const { items, errors: localErrors } = buildItemsFromCsv(content);
  const batches = chunkItems(items, 200);

  let inserted = 0;
  let updated = 0;
  let errors = localErrors;

  const apiUrl = `${baseUrl.replace(/\/+$/, "")}/api/customers/import`;

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    if (batch.length === 0) continue;

    const result = await postBatch(apiUrl, token, batch);
    inserted += Number(result?.inserted || 0);
    updated += Number(result?.updated || 0);
    errors += Number(result?.errors || 0);
  }

  console.log(
    `Importaci\u00f3n completada. Insertados: ${inserted}, Actualizados: ${updated}, Errores: ${errors}`
  );
};

run().catch((err) => {
  console.error("Importaci\u00f3n fallida:", err);
  process.exit(1);
});
