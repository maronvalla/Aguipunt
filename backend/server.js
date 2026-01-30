const express = require("express");
const cors = require("cors");
const auth = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const customerRoutes = require("./routes/customers");
const pointsRoutes = require("./routes/points");
const prizesRoutes = require("./routes/prizes");
const reportsRoutes = require("./routes/reports");
const transactionsRoutes = require("./routes/transactions");
const usersRoutes = require("./routes/users");

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  ...String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes); // PUBLICO: login, change-password, etc.

app.use("/api", requireAuth);     // TODO lo demás requiere token

// y abajo montás el resto (ya protegidos por el requireAuth)
app.use("/api/customers", customersRoutes);
app.use("/api/points", pointsRoutes);
app.use("/api/prizes", prizesRoutes);
app.use("/api/users", usersRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
