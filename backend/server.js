// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { DateTime } = require("luxon");

const { version } = require("./package.json");
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
const BOT_LOG_PREFIX = "[BOT]";
const DAILY_SUMMARY_ENABLED_ENV = "DAILY_SUMMARY_ENABLED";
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://aguipunt.vercel.app",
];
const schedulerState = {
  enabled: false,
  timezone: process.env.TZ || DEFAULT_TZ,
  nextRunAt: null,
};

const scheduleDailySummary = () => {
  const timezone = process.env.TZ || DEFAULT_TZ;
  const now = DateTime.now().setZone(timezone);
  let nextRun = now.set({ hour: DAILY_SUMMARY_HOUR, minute: 0, second: 0, millisecond: 0 });
  if (nextRun <= now) {
    nextRun = nextRun.plus({ days: 1 });
  }

  const delayMs = nextRun.toMillis() - now.toMillis();
  schedulerState.enabled = true;
  schedulerState.timezone = timezone;
  schedulerState.nextRunAt = nextRun.toISO();
  console.log(`${BOT_LOG_PREFIX} daily scheduler configured`, {
    timezone,
    nextRunAt: schedulerState.nextRunAt,
  });

  setTimeout(async () => {
    try {
      console.log(`${BOT_LOG_PREFIX} sending summary`);
      const result = await sendDailySummaryInternal();
      if (result.skipped) {
        console.log(`${BOT_LOG_PREFIX} skipped`, { reason: result.reason });
      } else {
        console.log(`${BOT_LOG_PREFIX} sent ok`);
      }
    } catch (error) {
      console.error(`${BOT_LOG_PREFIX} error sending summary`, error);
    }
    scheduleDailySummary();
  }, delayMs);
};

const isDailySummaryEnabled = () => {
  const raw = process.env[DAILY_SUMMARY_ENABLED_ENV];
  return raw === "true" || raw === "1";
};

const getCorsOrigins = () => {
  const raw = String(process.env.CORS_ORIGIN || "").trim();
  if (!raw) return DEFAULT_CORS_ORIGINS;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const corsOrigins = getCorsOrigins();
const allowAllCors = corsOrigins.includes("*");
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowAllCors) return true;
  return corsOrigins.includes(origin);
};
const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

/* =======================
   Middlewares base
======================= */
app.use(express.json());

app.use(cors(corsOptions));

// IMPORTANTE: responder preflight SIEMPRE
app.options("*", cors(corsOptions));

/* =======================
   Rutas públicas
======================= */
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    version,
    schedulerEnabled: schedulerState.enabled,
    schedulerTimezone: schedulerState.timezone,
    schedulerNextRunAt: schedulerState.nextRunAt,
  });
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
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on port ${PORT}`);

  const shouldStartTelegramBot = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const dailySummaryEnabled = isDailySummaryEnabled();

  if (shouldStartTelegramBot && dailySummaryEnabled) {
    console.log(`${BOT_LOG_PREFIX} daily scheduler enabled.`);
    scheduleDailySummary();
  } else if (!shouldStartTelegramBot) {
    console.log(
      `${BOT_LOG_PREFIX} daily scheduler disabled. Missing TELEGRAM_BOT_TOKEN.`
    );
  } else {
    console.log(
      `${BOT_LOG_PREFIX} daily scheduler disabled. ${DAILY_SUMMARY_ENABLED_ENV} is not true.`
    );
  }
});
