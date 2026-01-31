// backend/scripts/import_customers_semicolon_csv.js
const fs = require("fs");
const path = require("path");
const { db } = require("../db");

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    'Uso: node backend/scripts/import_customers_semicolon_csv.js "C:\\\\ruta\\\\clientes.csv"'
  );
  process.exit(1);
}

const filePath = path.resolve(inputPath);
if (!fs.existsSync(filePath)) {
  console.error("Archivo no encontrado:", filePath);
  process.exit(1);
}

try {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_dni_unique ON customers(dni)"
  );
} catch (err) {
  console.error("No se pudo crear el índice único de DNI:", err);
  process.exit(1);
}

const content = fs.readFileSync(filePath, "utf8");
const lines = content.split(/\r?\n/);

const updateStmt = db.prepare(
  "UPDATE customers SET nombre=?, celular=?, puntos=? WHERE dni=?"
);
const insertStmt = db.prepare(
  "INSERT INTO customers (dni, nombre, celular, puntos) VALUES (?, ?, ?, ?)"
);

let inserted = 0;
let updated = 0;
let errors = 0;
let processed = 0;

const importTx = db.transaction(() => {
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine || rawLine.trim() === "") continue;

    const parts = rawLine.split(";");
    const dni = (parts[0] || "").trim();
    const nombre = (parts[1] || "").trim();
    const puntosRaw = (parts[2] || "").trim();
    const celularRaw = (parts[3] || "").trim();

    if (
      i === 0 &&
      dni.toLowerCase() === "dni" &&
      nombre.toLowerCase() === "nombre"
    ) {
      continue;
    }

    if (!dni || !nombre) {
      errors += 1;
      continue;
    }

    const puntos = puntosRaw === "" ? 0 : Number(puntosRaw);
    if (Number.isNaN(puntos)) {
      errors += 1;
      continue;
    }

    const celular = celularRaw === "" ? null : celularRaw;

    try {
      const info = updateStmt.run(nombre, celular, puntos, dni);
      if (info.changes > 0) {
        updated += 1;
      } else {
        insertStmt.run(dni, nombre, celular, puntos);
        inserted += 1;
      }
      processed += 1;
    } catch (err) {
      errors += 1;
    }
  }
});

try {
  importTx();
} catch (err) {
  console.error("Importación fallida:", err);
  process.exit(1);
}

console.log(
  `Importación completada. Procesados: ${processed}, Insertados: ${inserted}, Actualizados: ${updated}, Errores: ${errors}`
);

try {
  db.close();
} catch (err) {
  // Ignore close errors to avoid masking import results.
}
