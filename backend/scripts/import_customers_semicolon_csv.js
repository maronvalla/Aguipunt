// backend/scripts/import_customers_semicolon_csv.js
const fs = require("fs");
const path = require("path");
const db = require("../db");

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

const content = fs.readFileSync(filePath, "utf8");
const lines = content.split(/\r?\n/);

let inserted = 0;
let updated = 0;
let errors = 0;
let processed = 0;

const runImport = async () => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

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
        const updateRes = await client.query(
          "UPDATE customers SET nombre = $1, celular = $2, puntos = $3 WHERE dni = $4",
          [nombre, celular, puntos, dni]
        );
        if (updateRes.rowCount > 0) {
          updated += 1;
        } else {
          await client.query(
            "INSERT INTO customers (dni, nombre, celular, puntos) VALUES ($1, $2, $3, $4)",
            [dni, nombre, celular, puntos]
          );
          inserted += 1;
        }
        processed += 1;
      } catch (_err) {
        errors += 1;
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

runImport()
  .then(() => {
    console.log(
      `ImportaciÃ³n completada. Procesados: ${processed}, Insertados: ${inserted}, Actualizados: ${updated}, Errores: ${errors}`
    );
  })
  .catch((err) => {
    console.error("ImportaciÃ³n fallida:", err);
    process.exit(1);
  });
