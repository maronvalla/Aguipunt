const express = require("express");
const ExcelJS = require("exceljs");
const dbDefault = require("../db");
const requireRoleDefault = require("../middleware/requireRole");
const {
  CAMPAIGN_FROM,
  CAMPAIGN_TO,
  getCampaignRange,
} = require("../services/raffleCampaign");

const createRaffleRouter = (deps = {}) => {
  const db = deps.db || dbDefault;
  const requireRole = deps.requireRole || requireRoleDefault;
  const router = express.Router();

  router.get("/entries", requireRole("admin"), async (req, res) => {
    const search = String(req.query.search || "").trim();
    const user = String(req.query.user || req.query.userName || "").trim();
    const range = getCampaignRange();
    const params = [range.startSql, range.endSql];
    const filters = [];

    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (search) {
      const like = `%${search}%`;
      const nameParam = addParam(like);
      const dniParam = addParam(like);
      const phoneParam = addParam(like);
      filters.push(
        `(e."customerName" ILIKE ${nameParam} OR e."customerDni" ILIKE ${dniParam} OR e."customerPhone" ILIKE ${phoneParam})`
      );
    }

    if (user) {
      filters.push(`e."userName" ILIKE ${addParam(`%${user}%`)}`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
      const result = await db.all(
        `WITH raffle_entries AS (
           SELECT t.id,
                  ROW_NUMBER() OVER (ORDER BY t.createdat ASC, t.id ASC)::int AS "chanceNumber",
                  to_char(t.createdat, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
                  t.points,
                  t.operations,
                  t.userid AS "userId",
                  t.username AS "userName",
                  t.customerid AS "customerId",
                  c.dni AS "customerDni",
                  c.nombre AS "customerName",
                  c.celular AS "customerPhone"
           FROM transactions t
           JOIN customers c ON c.id = t.customerid
           WHERE t.type = 'LOAD'
             AND t.voidedat IS NULL
             AND t.createdat >= $1
             AND t.createdat < $2
         )
         SELECT *
         FROM raffle_entries e
         ${where}
         ORDER BY e."createdAt" DESC, e.id DESC`,
        params
      );

      return res.json({
        campaign: {
          from: CAMPAIGN_FROM,
          to: CAMPAIGN_TO,
        },
        items: result?.rows || [],
      });
    } catch (err) {
      console.error("Error al cargar sorteo:", err);
      return res.status(500).json({ message: "Error al cargar sorteo." });
    }
  });

  router.get(
    "/new-registrations/export.xlsx",
    requireRole("admin"),
    async (_req, res) => {
      const range = getCampaignRange();

      try {
        const result = await db.pool.query(
          `SELECT dni, nombre, celular
           FROM customers
           WHERE createdat >= $1
             AND createdat < $2
           ORDER BY createdat ASC, nombre ASC`,
          [range.startSql, range.endSql]
        );

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Nuevos registrados");

        sheet.columns = [
          { header: "DNI", key: "dni", width: 14 },
          { header: "Nombre", key: "nombre", width: 30 },
          { header: "Celular", key: "celular", width: 18 },
        ];

        sheet.addRows(
          (result.rows || []).map((row) => ({
            dni: row.dni,
            nombre: row.nombre,
            celular: row.celular,
          }))
        );

        sheet.getRow(1).font = { bold: true };
        sheet.columns.forEach((column) => {
          let maxLength = String(column.header || "").length;
          column.eachCell({ includeEmpty: true }, (cell) => {
            const value =
              cell.value === null || cell.value === undefined ? "" : cell.value;
            const length = String(value).length;
            if (length > maxLength) maxLength = length;
          });
          column.width = Math.max(column.width || 10, Math.min(40, maxLength + 2));
        });

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="nuevos-registrados-junio-2026.xlsx"'
        );
        await workbook.xlsx.write(res);
        res.end();
      } catch (err) {
        console.error("Error al exportar nuevos registrados:", err);
        return res
          .status(500)
          .json({ message: "Error al exportar nuevos registrados." });
      }
    }
  );

  return router;
};

module.exports = createRaffleRouter();
module.exports.createRaffleRouter = createRaffleRouter;
module.exports.CAMPAIGN_FROM = CAMPAIGN_FROM;
module.exports.CAMPAIGN_TO = CAMPAIGN_TO;
