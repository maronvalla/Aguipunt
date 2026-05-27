const express = require("express");
const ExcelJS = require("exceljs");
const dbDefault = require("../db");
const requireRoleDefault = require("../middleware/requireRole");
const { getUtcIsoNow: getUtcIsoNowDefault } = require("../services/time");

const MATCH_KEY = "argentina-vs-jordania-2026-06-27";
const MATCH_LABEL = "Argentina vs Jordania";
const MATCH_DATE = "2026-06-27";
const ALLOWED_OUTCOMES = new Set(["ARG", "EMPATE", "JOR"]);

const buildFilters = (
  searchRaw,
  outcomeRaw,
  argentinaGoalsRaw,
  jordaniaGoalsRaw
) => {
  const search = String(searchRaw || "").trim();
  const outcome = String(outcomeRaw || "").trim().toUpperCase();
  const argentinaGoalsText = String(argentinaGoalsRaw ?? "").trim();
  const jordaniaGoalsText = String(jordaniaGoalsRaw ?? "").trim();
  const argentinaGoals =
    argentinaGoalsText === "" ? null : Number(argentinaGoalsText);
  const jordaniaGoals =
    jordaniaGoalsText === "" ? null : Number(jordaniaGoalsText);
  const params = [];
  const where = [];

  if (search) {
    params.push(`%${search}%`);
    params.push(`%${search}%`);
    where.push(
      `(customer_name_snapshot ILIKE $${params.length - 1} OR customer_dni_snapshot ILIKE $${params.length})`
    );
  }

  if (outcome) {
    params.push(outcome);
    where.push(`predicted_outcome = $${params.length}`);
  }

  if (argentinaGoals !== null) {
    params.push(argentinaGoals);
    where.push(`argentina_goals = $${params.length}`);
  }

  if (jordaniaGoals !== null) {
    params.push(jordaniaGoals);
    where.push(`jordania_goals = $${params.length}`);
  }

  return {
    params,
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    outcome,
    search,
    argentinaGoals,
    jordaniaGoals,
  };
};

const mapOutcomeLabel = (value) => {
  if (value === "ARG") return "Argentina";
  if (value === "JOR") return "Jordania";
  return "Empate";
};

const resolveOutcomeFromScore = (argentinaGoals, jordaniaGoals) => {
  if (argentinaGoals > jordaniaGoals) return "ARG";
  if (argentinaGoals < jordaniaGoals) return "JOR";
  return "EMPATE";
};

const createPredictionsRouter = (deps = {}) => {
  const db = deps.db || dbDefault;
  const requireRole = deps.requireRole || requireRoleDefault;
  const getUtcIsoNow = deps.getUtcIsoNow || getUtcIsoNowDefault;
  const router = express.Router();

router.post("/", async (req, res) => {
  const customerId = Number(req.body?.customerId);
  const predictedOutcome = String(req.body?.predictedOutcome || "")
    .trim()
    .toUpperCase();
  const argentinaGoals = Number(req.body?.argentinaGoals);
  const jordaniaGoals = Number(req.body?.jordaniaGoals);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ message: "Cliente invalido." });
  }
  if (!ALLOWED_OUTCOMES.has(predictedOutcome)) {
    return res.status(400).json({ message: "Resultado pronosticado invalido." });
  }
  if (!Number.isInteger(argentinaGoals) || argentinaGoals < 0) {
    return res.status(400).json({ message: "Goles de Argentina invalidos." });
  }
  if (!Number.isInteger(jordaniaGoals) || jordaniaGoals < 0) {
    return res.status(400).json({ message: "Goles de Jordania invalidos." });
  }

  const expectedOutcome = resolveOutcomeFromScore(argentinaGoals, jordaniaGoals);
  if (predictedOutcome !== expectedOutcome) {
    return res.status(400).json({
      message: "El resultado seleccionado no coincide con el marcador.",
    });
  }

  try {
    const customer = await db.get(
      "SELECT id, nombre, dni FROM customers WHERE id = $1",
      [customerId]
    );
    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }

    const createdAt = getUtcIsoNow();
    const result = await db.run(
      `INSERT INTO predictions
        (customerid, customer_name_snapshot, customer_dni_snapshot, match_key, match_label, match_date, predicted_outcome, argentina_goals, jordania_goals, createdat, userid, username)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        customer.id,
        customer.nombre,
        customer.dni,
        MATCH_KEY,
        MATCH_LABEL,
        MATCH_DATE,
        predictedOutcome,
        argentinaGoals,
        jordaniaGoals,
        createdAt,
        req.user?.id ?? null,
        req.user?.username ?? null,
      ]
    );

    return res.status(201).json({
      id: result.rows?.[0]?.id ?? null,
      customerId: customer.id,
      customerName: customer.nombre,
      customerDni: customer.dni,
      matchKey: MATCH_KEY,
      matchLabel: MATCH_LABEL,
      matchDate: MATCH_DATE,
      predictedOutcome,
      argentinaGoals,
      jordaniaGoals,
      createdAt,
      userId: req.user?.id ?? null,
      userName: req.user?.username ?? null,
    });
  } catch (error) {
    console.error("Error al crear pronostico:", error);
    return res.status(500).json({ message: "Error al guardar pronostico." });
  }
});

router.get("/", requireRole("admin"), async (req, res) => {
  const {
    params,
    whereSql,
    outcome,
    argentinaGoals,
    jordaniaGoals,
  } = buildFilters(
    req.query.search,
    req.query.outcome,
    req.query.argentinaGoals,
    req.query.jordaniaGoals
  );

  if (outcome && !ALLOWED_OUTCOMES.has(outcome)) {
    return res.status(400).json({ message: "Filtro de resultado invalido." });
  }
  if (
    (argentinaGoals !== null &&
      (!Number.isInteger(argentinaGoals) || argentinaGoals < 0)) ||
    (jordaniaGoals !== null &&
      (!Number.isInteger(jordaniaGoals) || jordaniaGoals < 0))
  ) {
    return res.status(400).json({ message: "Filtro de marcador invalido." });
  }

  try {
    const result = await db.all(
      `SELECT id,
              customerid AS "customerId",
              customer_name_snapshot AS "customerName",
              customer_dni_snapshot AS "customerDni",
              match_key AS "matchKey",
              match_label AS "matchLabel",
              match_date AS "matchDate",
              predicted_outcome AS "predictedOutcome",
              argentina_goals AS "argentinaGoals",
              jordania_goals AS "jordaniaGoals",
              to_char(createdat, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
              userid AS "userId",
              username AS "userName"
       FROM predictions
       ${whereSql}
       ORDER BY createdat DESC`,
      params
    );

    return res.json({ items: result.rows || [] });
  } catch (error) {
    console.error("Error al listar pronosticos:", error);
    return res.status(500).json({ message: "Error al listar pronosticos." });
  }
});

router.get("/export.xlsx", requireRole("admin"), async (req, res) => {
  const {
    params,
    whereSql,
    outcome,
    argentinaGoals,
    jordaniaGoals,
  } = buildFilters(
    req.query.search,
    req.query.outcome,
    req.query.argentinaGoals,
    req.query.jordaniaGoals
  );

  if (outcome && !ALLOWED_OUTCOMES.has(outcome)) {
    return res.status(400).json({ message: "Filtro de resultado invalido." });
  }
  if (
    (argentinaGoals !== null &&
      (!Number.isInteger(argentinaGoals) || argentinaGoals < 0)) ||
    (jordaniaGoals !== null &&
      (!Number.isInteger(jordaniaGoals) || jordaniaGoals < 0))
  ) {
    return res.status(400).json({ message: "Filtro de marcador invalido." });
  }

  try {
    const result = await db.pool.query(
      `SELECT customer_name_snapshot AS "customerName",
              customer_dni_snapshot AS "customerDni",
              match_label AS "matchLabel",
              match_date AS "matchDate",
              predicted_outcome AS "predictedOutcome",
              argentina_goals AS "argentinaGoals",
              jordania_goals AS "jordaniaGoals",
              to_char(createdat, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
              username AS "userName"
       FROM predictions
       ${whereSql}
       ORDER BY createdat DESC`,
      params
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pronosticos");

    sheet.columns = [
      { header: "Fecha registro", key: "createdAt", width: 24 },
      { header: "Cliente", key: "customerName", width: 28 },
      { header: "DNI", key: "customerDni", width: 18 },
      { header: "Resultado pronosticado", key: "predictedOutcome", width: 22 },
      { header: "Goles Argentina", key: "argentinaGoals", width: 16 },
      { header: "Goles Jordania", key: "jordaniaGoals", width: 16 },
      { header: "Usuario", key: "userName", width: 18 },
      { header: "Partido", key: "matchLabel", width: 24 },
      { header: "Fecha partido", key: "matchDate", width: 16 },
    ];

    sheet.addRows(
      (result.rows || []).map((row) => ({
        ...row,
        predictedOutcome: mapOutcomeLabel(row.predictedOutcome),
      }))
    );

    sheet.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="pronosticos.xlsx"'
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error al exportar pronosticos:", error);
    return res.status(500).json({ message: "Error al exportar pronosticos." });
  }
});

  return router;
};

module.exports = createPredictionsRouter();
module.exports.createPredictionsRouter = createPredictionsRouter;
