// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { DateTime } = require("luxon");

const authRoutes = require("./routes/auth");
const { router: botRoutes, sendDailySummaryInternal } = require("./routes/bot");
const customersRoutes = require("./routes/customers");
const pointsRoutes = require("./routes/points");
const prizesRoutes = require("./routes/prizes");
const reportsRoutes = require("./routes/reports");
const usersRoutes = require("./routes/users");

const requireAuth = require("./middleware/auth");

const app = express();
const DEFAULT_TZ = "America/Argentina/Tucuman";
const DAILY_SUMMARY_HOUR = 22;

const scheduleDailySummary = () => {
  const timezone = process.env.TZ || DEFAULT_TZ;
  const now = DateTime.now().setZone(timezone);
  let nextRun = now.set({ hour: DAILY_SUMMARY_HOUR, minute: 0, second: 0, millisecond: 0 });
  if (nextRun <= now) {
    nextRun = nextRun.plus({ days: 1 });
  }

  const delayMs = nextRun.toMillis() - now.toMillis();

  setTimeout(async () => {
    try {
      await sendDailySummaryInternal();
    } catch (error) {
      console.error("[bot] scheduled daily summary failed", error);
    }
    scheduleDailySummary();
  }, delayMs);
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
app.use("/api/bot", botRoutes);

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
/*
// BOT VIEJO — DESACTIVADO
const shouldStartTelegramBot = Boolean(process.env.TELEGRAM_BOT_TOKEN);

if (shouldStartTelegramBot) {
  console.log("Telegram bot scheduler enabled.");
  sendTelegramMessage();
  setInterval(sendTelegramMessage, TELEGRAM_INTERVAL_MS);
} else {
  console.log(
    "Telegram bot scheduler disabled. Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID."
  );
}
*/
