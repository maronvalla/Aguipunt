const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const router = express.Router();

const clampLimit = (value, def, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(max, n));
};

router.get("/customers", requireRole("admin"), (req, res) => {
  const search = String(req.query.search || "").trim();
  const limit = clampLimit(req.query.limit, 20, 100);
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const where = search ? "WHERE nombre ILIKE $1 OR dni ILIKE $2" : "";
  const like = `%${search}%`;
  const params = search ? [like, like, limit, offset] : [limit, offset];

  db.all(
    `SELECT id, nombre, dni, puntos
     FROM customers
     ${where}
     ORDER BY nombre ASC
     LIMIT ${search ? "$3" : "$1"} OFFSET ${search ? "$4" : "$2"}`,
    params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Error al buscar clientes." });
      }
      if (!search) {
        return res.json({ items: rows || [] });
      }
      db.get(
        `SELECT COUNT(*) as total FROM customers ${where}`,
        search ? [like, like] : [],
        (countErr, countRow) => {
          if (countErr) {
            return res.json({ items: rows || [] });
          }
          res.json({ items: rows || [], total: countRow?.total || 0 });
        }
      );
    }
  );
});

router.get("/customers/by-id/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "Cliente inválido." });
  }

  db.get("SELECT * FROM customers WHERE id = $1", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ message: "Error al buscar cliente." });
    }
    if (!row) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }
    res.json({
      id: row.id,
      dni: row.dni,
      nombre: row.nombre,
      celular: row.celular,
      puntos: row.puntos,
    });
  });
});

router.get("/customers/:id/transactions", requireRole("admin"), (req, res) => {
  const customerId = Number(req.params.id);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return res.status(400).json({ message: "Cliente inválido." });
  }

  const limit = clampLimit(req.query.limit, 50, 200);
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const type = String(req.query.type || "ALL").toUpperCase();
  const order = String(req.query.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  const params = [];
  const whereParts = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  whereParts.push(`customerid = ${addParam(customerId)}`);
  if (type === "LOAD" || type === "REDEEM") {
    whereParts.push(`type = ${addParam(type)}`);
  }
  if (from) {
    whereParts.push(`date(createdat) >= date(${addParam(from)})`);
  }
  if (to) {
    whereParts.push(`date(createdat) <= date(${addParam(to)})`);
  }

  const where = `WHERE ${whereParts.join(" AND ")}`;
  const sql = `
    SELECT id,
           customerid AS "customerId",
           type,
           operations,
           points,
           note,
           userid AS "userId",
           username AS "userName",
           voidedat AS "voidedAt",
           voidedbyuserid AS "voidedByUserId",
           voidreason AS "voidReason",
           originaltransactionid AS "originalTransactionId",
           createdat AS "createdAt"
    FROM transactions
    ${where}
    ORDER BY createdAt ${order}
    LIMIT ${addParam(limit + 1)} OFFSET ${addParam(offset)}
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Error al buscar movimientos." });
    }
    const items = rows || [];
    const hasMore = items.length > limit;
    res.json({ items: items.slice(0, limit), hasMore });
  });
});

router.get(
  "/customers/:id/transactions/export",
  requireRole("admin"),
  (req, res) => {
  const customerId = Number(req.params.id);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return res.status(400).json({ message: "Cliente inválido." });
  }

  const type = String(req.query.type || "ALL").toUpperCase();
  const order = String(req.query.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  const params = [];
  const whereParts = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  whereParts.push(`customerid = ${addParam(customerId)}`);
  if (type === "LOAD" || type === "REDEEM") {
    whereParts.push(`type = ${addParam(type)}`);
  }
  if (from) {
    whereParts.push(`date(createdat) >= date(${addParam(from)})`);
  }
  if (to) {
    whereParts.push(`date(createdat) <= date(${addParam(to)})`);
  }

  const where = `WHERE ${whereParts.join(" AND ")}`;
  const sql = `
    SELECT createdat AS "createdAt",
           type,
           operations,
           points,
           note,
           username AS "userName"
    FROM transactions
    ${where}
    ORDER BY createdAt ${order}
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Error al exportar movimientos." });
    }

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
        return `"${str.replace(/"/g, "\"\"")}"`;
      }
      return str;
    };

    const header = ["createdAt", "type", "operations", "points", "note", "userName"];
    const lines = [header.join(",")];
    (rows || []).forEach((row) => {
      lines.push(
        [
          escapeCsv(row.createdAt),
          escapeCsv(row.type),
          escapeCsv(row.operations),
          escapeCsv(row.points),
          escapeCsv(row.note),
          escapeCsv(row.userName),
        ].join(",")
      );
    });
    const csv = lines.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"customer-${customerId}-transactions.csv\"`
    );
    res.send(csv);
  });
  }
);

router.get("/customers/:dni", (req, res) => {
  const { dni } = req.params;
  if (!dni) {
    return res.status(400).json({ message: "DNI requerido." });
  }

  db.get("SELECT * FROM customers WHERE dni = $1", [dni], (err, row) => {
    if (err) {
      return res.status(500).json({ message: "Error al buscar cliente." });
    }
    if (!row) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }

    res.json({
      id: row.id,
      dni: row.dni,
      nombre: row.nombre,
      celular: row.celular,
      puntos: row.puntos,
    });
  });
});

router.post("/customers", (req, res) => {
  const { numeroDNI, nombreYApellido, numeroCelular } = req.body;

  db.get(
    "SELECT * FROM customers WHERE dni = $1",
    [numeroDNI],
    (err, row) => {
      if (row) {
        return res.status(400).json({ message: "DNI ya existente." });
      }

      db.run(
        "INSERT INTO customers (dni, nombre, celular) VALUES ($1, $2, $3)",
        [numeroDNI, nombreYApellido, numeroCelular],
        () => {
          res.json({ message: "Cliente añadido correctamente." });
        }
      );
    }
  );
});

router.post("/import", requireRole("admin"), async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) {
    return res.status(400).json({ message: "Items requeridos." });
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of items) {
      const dni = String(item?.dni || "").trim();
      const nombre = String(item?.nombre || "").trim();
      const celularRaw =
        item?.celular === null || item?.celular === undefined
          ? null
          : String(item.celular).trim();
      const puntosValue = Number(item?.puntos);

      if (!dni || !nombre || !Number.isFinite(puntosValue)) {
        errors += 1;
        continue;
      }

      const celular = celularRaw === "" ? null : celularRaw;
      const puntos = Math.trunc(puntosValue);

      try {
        const result = await client.query(
          `INSERT INTO customers (dni, nombre, celular, puntos)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (dni) DO UPDATE SET
             nombre = EXCLUDED.nombre,
             celular = EXCLUDED.celular,
             puntos = EXCLUDED.puntos
           RETURNING (xmax = 0) AS inserted`,
          [dni, nombre, celular, puntos]
        );
        if (result.rows?.[0]?.inserted) {
          inserted += 1;
        } else {
          updated += 1;
        }
      } catch (_err) {
        errors += 1;
      }
    }

    await client.query("COMMIT");
    return res.json({ inserted, updated, errors });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error al importar clientes:", err);
    return res
      .status(500)
      .json({ message: "Error al importar clientes.", inserted, updated, errors });
  } finally {
    client.release();
  }
});

module.exports = router;
