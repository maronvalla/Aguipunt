// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const customersRoutes = require("./routes/customers");
const pointsRoutes = require("./routes/points");
const prizesRoutes = require("./routes/prizes");
const usersRoutes = require("./routes/users");

const requireAuth = require("./middleware/auth");

const app = express();

/* =======================
   Middlewares base
======================= */
app.use(express.json());

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
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

/* =======================
   Start
======================= */
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on port ${PORT}`);
});
