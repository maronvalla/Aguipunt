// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const customersRoutes = require("./routes/customers");
const pointsRoutes = require("./routes/points");
const prizesRoutes = require("./routes/prizes");
const reportsRoutes = require("./routes/reports");
const usersRoutes = require("./routes/users");
const db = require("./db");

const requireAuth = require("./middleware/auth");

const app = express();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_INTERVAL_MS = 60 * 1000;
const TELEGRAM_TIMEZONE = "America/Argentina/Tucuman";

const shouldStartTelegramBot = Boolean(
  TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID
);

const getLocalDateString = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TELEGRAM_TIMEZONE }).format(
    new Date()
  );

const fetchDailySummary = async () => {
  const totalResult = await db.pool.query(
    `
      SELECT COALESCE(SUM(points), 0) AS total_points
      FROM transactions
      WHERE type = 'LOAD'
        AND points > 0
        AND ((createdat AT TIME ZONE 'UTC') AT TIME ZONE $1)::date =
            (now() AT TIME ZONE $1)::date
    `,
    [TELEGRAM_TIMEZONE]
  );

  const topResult = await db.pool.query(
    `
      SELECT userid, COALESCE(SUM(points), 0) AS total_points
      FROM transactions
      WHERE type = 'LOAD'
        AND points > 0
        AND ((createdat AT TIME ZONE 'UTC') AT TIME ZONE $1)::date =
            (now() AT TIME ZONE $1)::date
      GROUP BY userid
      ORDER BY total_points DESC
      LIMIT 1
    `,
    [TELEGRAM_TIMEZONE]
  );

  const totalPoints = Number(totalResult.rows?.[0]?.total_points || 0);
  const topRow = topResult.rows?.[0] || null;
  const topUserId = topRow?.userid ?? null;
  const topPoints = Number(topRow?.total_points || 0);

  return { totalPoints, topUserId, topPoints, date: getLocalDateString() };
};

const sendTelegramMessage = async () => {
  if (!shouldStartTelegramBot) return;
  try {
    const summary = await fetchDailySummary();
    console.log(
      "[BOT] sending daily summary:",
      JSON.stringify({
        date: summary.date,
        totalPoints: summary.totalPoints,
        topUserId: summary.topUserId,
        topPoints: summary.topPoints,
      })
    );

    const topUserLabel =
      summary.topUserId === null || summary.topUserId === undefined
        ? "—"
        : String(summary.topUserId);
    const messageText = `📊 Aguipuntos — Resumen del día (${summary.date})\n✅ Puntos cargados hoy: ${summary.totalPoints}\n🏆 Usuario que más cargó: ${topUserLabel} (${summary.topPoints} pts)`;

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: messageText,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Telegram sendMessage failed:", errorText);
    }
  } catch (error) {
    console.error("Telegram sendMessage error:", error);
  }
};

/* =======================
   Middlewares base
======================= */
app.use(express.json());

app.use((req, res, next) => {
  if (req.method !== "OPTIONS") return next();

  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.sendStatus(204);
});

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://aguipunt.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// IMPORTANTE: responder preflight SIEMPRE
app.options("*", cors());

/* =======================
   Rutas públicas
======================= */
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});

// auth público
app.use("/api/auth", authRoutes);

/* =======================
   Middleware JWT
======================= */
app.use("/api", requireAuth);

/* =======================
   Rutas protegidas
======================= */
app.use("/api/customers", customersRoutes);
app.use("/api/points", pointsRoutes);
app.use("/api/prizes", prizesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/users", usersRoutes);

/* =======================
   404
======================= */
app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

/* =======================
   Error handler
======================= */
app.use((err, _req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON" });
  }
  return next(err);
});

app.use((err, _req, res, _next) => {
  if (res.headersSent) return;
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

/* =======================
   Start
======================= */
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on port ${PORT}`);

  if (shouldStartTelegramBot) {
    console.log("[BOT] scheduler enabled");
    sendTelegramMessage();
    setInterval(sendTelegramMessage, TELEGRAM_INTERVAL_MS);
  } else {
    console.log(
      "Telegram bot scheduler disabled. Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID."
    );
  }
});
