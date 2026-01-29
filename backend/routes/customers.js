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

  const where = search
    ? "WHERE lower(nombre) LIKE ? OR lower(dni) LIKE ?"
    : "";
  const like = `%${search.toLowerCase()}%`;
  const params = search ? [like, like, limit, offset] : [limit, offset];

  db.all(
    `SELECT id, nombre, dni, puntos
     FROM customers
     ${where}
     ORDER BY nombre ASC
     LIMIT ? OFFSET ?`,
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
    return res.status(400).json({ message: "Cliente invÃ¡lido." });
  }

  db.get("SELECT * FROM customers WHERE id = ?", [id], (err, row) => {
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
    return res.status(400).json({ message: "Cliente invÃ¡lido." });
  }

  const limit = clampLimit(req.query.limit, 50, 200);
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const type = String(req.query.type || "ALL").toUpperCase();
  const order = String(req.query.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  const whereParts = ["customerId = ?"];
  const params = [customerId];

  if (type === "LOAD" || type === "REDEEM") {
    whereParts.push("type = ?");
    params.push(type);
  }

  if (from) {
    whereParts.push("date(createdAt) >= date(?)");
    params.push(from);
  }
  if (to) {
    whereParts.push("date(createdAt) <= date(?)");
    params.push(to);
  }

  const where = `WHERE ${whereParts.join(" AND ")}`;
  const sql = `
    SELECT id, customerId, type, operations, points, note, userId, userName,
           voidedAt, voidedByUserId, voidReason, originalTransactionId, createdAt
    FROM transactions
    ${where}
    ORDER BY createdAt ${order}
    LIMIT ? OFFSET ?
  `;

  db.all(sql, [...params, limit + 1, offset], (err, rows) => {
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
    return res.status(400).json({ message: "Cliente invÃ¡lido." });
  }

  const type = String(req.query.type || "ALL").toUpperCase();
  const order = String(req.query.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  const whereParts = ["customerId = ?"];
  const params = [customerId];

  if (type === "LOAD" || type === "REDEEM") {
    whereParts.push("type = ?");
    params.push(type);
  }
  if (from) {
    whereParts.push("date(createdAt) >= date(?)");
    params.push(from);
  }
  if (to) {
    whereParts.push("date(createdAt) <= date(?)");
    params.push(to);
  }

  const where = `WHERE ${whereParts.join(" AND ")}`;
  const sql = `
    SELECT createdAt, type, operations, points, note, userName
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

  db.get("SELECT * FROM customers WHERE dni = ?", [dni], (err, row) => {
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
    "SELECT * FROM customers WHERE dni = ?",
    [numeroDNI],
    (err, row) => {
      if (row) {
        return res.status(400).json({ message: "DNI ya existente." });
      }

      db.run(
        "INSERT INTO customers (dni, nombre, celular) VALUES (?, ?, ?)",
        [numeroDNI, nombreYApellido, numeroCelular],
        () => {
          res.json({ message: "Cliente aÃ±adido correctamente." });
        }
      );
    }
  );
});

module.exports = router;
