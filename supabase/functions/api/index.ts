import { Hono } from "hono";
import { cors } from "hono/cors";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as XLSX from "xlsx";

type UserClaims = { id: number; username: string; role: "admin" | "cashier" };
type Variables = { user: UserClaims };

const app = new Hono<{ Variables: Variables }>();
const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
if (!databaseUrl) throw new Error("Missing SUPABASE_DB_URL");

const sql = postgres(databaseUrl, { prepare: false, max: 2, idle_timeout: 20 });
const query = async <
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  text: string,
  params: unknown[] = [],
) => (await sql.unsafe(text, params as any[])) as unknown as T[];

const allowedOrigins = new Set([
  "https://aguipunt.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
]);

app.use(
  "*",
  cors({
    origin: (origin) =>
      allowedOrigins.has(origin) ? origin : "https://aguipunt.vercel.app",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

const jsonError = (c: any, status: number, message: string, extra = {}) =>
  c.json({ message, ...extra }, status);

const auth = async (c: any, next: () => Promise<void>) => {
  if (
    c.req.path === "/api/health" ||
    c.req.path === "/api/auth/login" ||
    c.req.path.startsWith("/api/bot/") ||
    c.req.path === "/api/auth/bootstrap-admin"
  ) {
    await next();
    return;
  }
  const header = c.req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secret = Deno.env.get("JWT_SECRET");
  if (!token) return jsonError(c, 401, "Token requerido.");
  if (!secret) return jsonError(c, 500, "Configuración inválida del servidor.");
  try {
    c.set("user", jwt.verify(token, secret) as UserClaims);
    await next();
  } catch {
    return jsonError(c, 401, "Token inválido.");
  }
};

const admin = async (c: any, next: () => Promise<void>) => {
  if (c.get("user")?.role !== "admin") {
    return jsonError(c, 403, "Acceso denegado");
  }
  await next();
};

const body = async (c: any) => await c.req.json().catch(() => ({}));
const integer = (value: unknown) =>
  Number.isInteger(Number(value)) ? Number(value) : null;
const clamp = (value: unknown, fallback: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.max(1, Math.min(max, Math.trunc(n)))
    : fallback;
};
const csvEscape = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[,"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const fileResponse = (data: BodyInit, type: string, filename: string) =>
  new Response(data, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
const workbookResponse = (
  rows: Record<string, unknown>[],
  columns: [string, string][],
  filename: string,
) => {
  const normalized = rows.map((row) =>
    Object.fromEntries(columns.map(([header, key]) => [header, row[key] ?? ""]))
  );
  const sheet = XLSX.utils.json_to_sheet(normalized);
  sheet["!cols"] = columns.map(([header]) => ({
    wch: Math.max(14, header.length + 2),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Datos");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return fileResponse(
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename,
  );
};

app.get(
  "/api/health",
  (c) =>
    c.json({
      ok: true,
      time: new Date().toISOString(),
      platform: "supabase-edge",
    }),
);

app.post("/api/auth/login", async (c) => {
  const input = await body(c);
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  if (!username || !password) {
    return jsonError(c, 400, "Usuario y contraseña requeridos.");
  }
  const [user] = await query<
    {
      id: number;
      username: string;
      password_hash: string;
      role: "admin" | "cashier";
    }
  >(
    "SELECT id, username, password_hash, role FROM users WHERE username = $1",
    [username],
  );
  const valid = user &&
    (/^\$2[aby]\$/.test(user.password_hash)
      ? await bcrypt.compare(password, user.password_hash)
      : password === user.password_hash);
  if (!valid) return jsonError(c, 401, "Credenciales inválidas.");
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) return jsonError(c, 500, "Configuración inválida del servidor.");
  const role = user.role || "admin";
  const token = jwt.sign(
    { id: user.id, username: user.username, role },
    secret,
    { expiresIn: "8h" },
  );
  return c.json({ message: "Inicio de sesión exitoso.", token, role });
});

app.use("/api/*", auth);

app.get(
  "/api/users/users",
  admin,
  async (c) =>
    c.json(await query("SELECT id, username, role FROM users ORDER BY id ASC")),
);

app.post("/api/users/users", admin, async (c) => {
  const input = await body(c);
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  const role = input.role === "admin" ? "admin" : "cashier";
  if (username.length < 3 || username.length > 30) {
    return jsonError(c, 400, "Usuario inválido (3-30 caracteres).");
  }
  if (password.length < 4) {
    return jsonError(c, 400, "Contraseña inválida (mínimo 4).");
  }
  if (
    (await query("SELECT id FROM users WHERE username = $1", [username])).length
  ) return jsonError(c, 409, "Usuario ya existe.");
  const hash = await bcrypt.hash(password, 10);
  const [created] = await query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
    [username, hash, role],
  );
  return c.json({ id: created.id, username, role }, 201);
});

app.patch("/api/users/users/:id/password", admin, async (c) => {
  const id = integer(c.req.param("id"));
  const input = await body(c);
  const password = String(input.password || "");
  if (!id || id <= 0) return jsonError(c, 400, "ID inválido.");
  if (password.length < 4) {
    return jsonError(c, 400, "Contraseña inválida (mínimo 4).");
  }
  const rows = await query(
    "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id",
    [await bcrypt.hash(password, 10), id],
  );
  return rows.length
    ? c.json({ ok: true })
    : jsonError(c, 404, "Usuario no encontrado.");
});

app.delete("/api/users/users/:id", admin, async (c) => {
  const id = integer(c.req.param("id"));
  if (!id || id <= 0) return jsonError(c, 400, "ID inválido.");
  const rows = await query("DELETE FROM users WHERE id = $1 RETURNING id", [
    id,
  ]);
  return rows.length
    ? c.json({ ok: true })
    : jsonError(c, 404, "Usuario no encontrado.");
});

app.get("/api/customers/customers", admin, async (c) => {
  const search = String(c.req.query("search") || "").trim();
  const limit = clamp(c.req.query("limit"), 20, 100);
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const params: unknown[] = [];
  let where = "";
  if (search) {
    params.push(`%${search}%`);
    where = "WHERE nombre ILIKE $1 OR dni ILIKE $1";
  }
  params.push(limit, offset);
  const items = await query(
    `SELECT id, nombre, dni, puntos, createdat AS "createdAt" FROM customers ${where} ORDER BY nombre ASC LIMIT $${
      params.length - 1
    } OFFSET $${params.length}`,
    params,
  );
  if (!search) return c.json({ items });
  const [count] = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM customers ${where}`,
    params.slice(0, 1),
  );
  return c.json({ items, total: Number(count?.total || 0) });
});

app.get("/api/customers/customers/by-id/:id", admin, async (c) => {
  const id = integer(c.req.param("id"));
  if (!id || id <= 0) return jsonError(c, 400, "Cliente inválido.");
  const [row] = await query(
    'SELECT id, dni, nombre, celular, puntos, createdat AS "createdAt" FROM customers WHERE id = $1',
    [id],
  );
  return row ? c.json(row) : jsonError(c, 404, "Cliente no encontrado.");
});

const transactionFilters = (c: any, customerId: number) => {
  const params: unknown[] = [customerId];
  const where = ["customerid = $1"];
  const type = String(c.req.query("type") || "ALL").toUpperCase();
  if (["LOAD", "REDEEM"].includes(type)) {
    params.push(type);
    where.push(`type = $${params.length}`);
  }
  const from = String(c.req.query("from") || "");
  const to = String(c.req.query("to") || "");
  if (from) {
    params.push(from);
    where.push(`createdat >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`createdat < ($${params.length}::date + interval '1 day')`);
  }
  return { params, where: `WHERE ${where.join(" AND ")}` };
};

app.get("/api/customers/customers/:id/transactions", admin, async (c) => {
  const id = integer(c.req.param("id"));
  if (!id || id <= 0) return jsonError(c, 400, "Cliente inválido.");
  const { params, where } = transactionFilters(c, id);
  const limit = clamp(c.req.query("limit"), 50, 200);
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const order = c.req.query("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  params.push(limit + 1, offset);
  const rows = await query(
    `SELECT id, customerid AS "customerId", type, operations, points, note, userid AS "userId", username AS "userName", voidedat AS "voidedAt", voidedbyuserid AS "voidedByUserId", voidreason AS "voidReason", originaltransactionid AS "originalTransactionId", createdat AS "createdAt" FROM transactions ${where} ORDER BY createdat ${order} LIMIT $${
      params.length - 1
    } OFFSET $${params.length}`,
    params,
  );
  return c.json({ items: rows.slice(0, limit), hasMore: rows.length > limit });
});

app.get(
  "/api/customers/customers/:id/transactions/export",
  admin,
  async (c) => {
    const id = integer(c.req.param("id"));
    if (!id || id <= 0) return jsonError(c, 400, "Cliente inválido.");
    const { params, where } = transactionFilters(c, id);
    const order = c.req.query("order")?.toLowerCase() === "desc"
      ? "DESC"
      : "ASC";
    const rows = await query(
      `SELECT createdat AS "createdAt", type, operations, points, note, username AS "userName" FROM transactions ${where} ORDER BY createdat ${order}`,
      params,
    );
    const headers = [
      "createdAt",
      "type",
      "operations",
      "points",
      "note",
      "userName",
    ];
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
    ].join("\n");
    return fileResponse(
      csv,
      "text/csv; charset=utf-8",
      `customer-${id}-transactions.csv`,
    );
  },
);

app.get("/api/customers/export.csv", admin, async (c) => {
  const search = String(c.req.query("search") || "").trim();
  const params = search ? [`%${search}%`] : [];
  const where = search ? "WHERE nombre ILIKE $1 OR dni ILIKE $1" : "";
  const rows = await query(
    `SELECT dni, nombre, celular, puntos FROM customers ${where} ORDER BY nombre ASC`,
    params,
  );
  const headers = ["dni", "nombre", "celular", "puntos"];
  return fileResponse(
    [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
    ].join("\n"),
    "text/csv; charset=utf-8",
    "customers.csv",
  );
});

app.get("/api/customers/export.xlsx", admin, async (c) => {
  const search = String(c.req.query("search") || "").trim();
  const rows = await query(
    `SELECT dni, nombre, celular, puntos FROM customers ${
      search ? "WHERE nombre ILIKE $1 OR dni ILIKE $1" : ""
    } ORDER BY nombre ASC`,
    search ? [`%${search}%`] : [],
  );
  return workbookResponse(rows, [["DNI", "dni"], ["Nombre", "nombre"], [
    "Celular",
    "celular",
  ], ["Puntos", "puntos"]], "customers.xlsx");
});

app.get("/api/customers/customers/:dni", async (c) => {
  const [row] = await query(
    "SELECT id, dni, nombre, celular, puntos FROM customers WHERE dni = $1",
    [c.req.param("dni")],
  );
  return row ? c.json(row) : jsonError(c, 404, "Cliente no encontrado.");
});

app.post("/api/customers/customers", async (c) => {
  const input = await body(c);
  const dni = String(input.numeroDNI || "").trim();
  const nombre = String(input.nombreYApellido || "").trim();
  const celular = input.numeroCelular
    ? String(input.numeroCelular).trim()
    : null;
  if (!dni || !nombre) return jsonError(c, 400, "DNI y nombre requeridos.");
  if ((await query("SELECT id FROM customers WHERE dni = $1", [dni])).length) {
    return jsonError(c, 400, "DNI ya existente.");
  }
  await query(
    "INSERT INTO customers (dni, nombre, celular) VALUES ($1, $2, $3)",
    [dni, nombre, celular],
  );
  return c.json({ message: "Cliente añadido correctamente." });
});

app.post("/api/customers/import", admin, async (c) => {
  const input = await body(c);
  if (!Array.isArray(input.items)) {
    return jsonError(c, 400, "Items requeridos.");
  }
  let inserted = 0, updated = 0, errors = 0;
  await sql.begin(async (tx) => {
    for (const item of input.items) {
      const dni = String(item?.dni || "").trim();
      const nombre = String(item?.nombre || "").trim();
      const puntos = Number(item?.puntos);
      if (!dni || !nombre || !Number.isFinite(puntos)) {
        errors++;
        continue;
      }
      try {
        const existing = await tx`SELECT id FROM customers WHERE dni = ${dni}`;
        await tx`INSERT INTO customers (dni, nombre, celular, puntos) VALUES (${dni}, ${nombre}, ${
          item?.celular || null
        }, ${
          Math.trunc(puntos)
        }) ON CONFLICT (dni) DO UPDATE SET nombre = EXCLUDED.nombre, celular = EXCLUDED.celular, puntos = EXCLUDED.puntos`;
        existing.length ? updated++ : inserted++;
      } catch {
        errors++;
      }
    }
  });
  return c.json({ inserted, updated, errors });
});

app.get(
  "/api/prizes/prizes",
  async (c) =>
    c.json(
      await query(
        "SELECT id, nombre, costo_puntos FROM prizes ORDER BY id ASC",
      ),
    ),
);

app.post("/api/prizes/prizes", admin, async (c) => {
  const input = await body(c);
  const nombre = String(input.nombre || "").trim();
  const costo = integer(input.costo_puntos);
  if (!nombre) return jsonError(c, 400, "Nombre requerido.");
  if (!costo || costo <= 0) {
    return jsonError(c, 400, "Puntos requeridos inválidos.");
  }
  const [row] = await query(
    "INSERT INTO prizes (nombre, costo_puntos) VALUES ($1, $2) RETURNING id",
    [nombre, costo],
  );
  return c.json({ id: row.id, nombre, costo_puntos: costo });
});

app.put("/api/prizes/prizes/:id", admin, async (c) => {
  const id = integer(c.req.param("id"));
  const input = await body(c);
  const nombre = String(input.nombre || "").trim();
  const costo = integer(input.costo_puntos);
  if (!id || !nombre || !costo || costo <= 0) {
    return jsonError(c, 400, "Datos de premio inválidos.");
  }
  const rows = await query(
    "UPDATE prizes SET nombre = $1, costo_puntos = $2 WHERE id = $3 RETURNING id",
    [nombre, costo, id],
  );
  return rows.length
    ? c.json({ id, nombre, costo_puntos: costo })
    : jsonError(c, 404, "Premio no encontrado.");
});

app.delete("/api/prizes/prizes/:id", admin, async (c) => {
  const id = integer(c.req.param("id"));
  if (!id) return jsonError(c, 400, "ID inválido.");
  return (await query("DELETE FROM prizes WHERE id = $1 RETURNING id", [id]))
      .length
    ? c.json({ ok: true })
    : jsonError(c, 404, "Premio no encontrado.");
});

const loadOrRedeem = async (c: any, mode: "load" | "custom" | "prize") => {
  const input = await body(c);
  const dni = String(input.dni || "").trim();
  const user = c.get("user") as UserClaims;
  if (!dni) return jsonError(c, 400, "DNI requerido.");
  const [customer] = await query<any>(
    "SELECT * FROM customers WHERE dni = $1",
    [dni],
  );
  if (!customer) return jsonError(c, 404, "Cliente no encontrado.");
  let delta = 0,
    operations: number | null = null,
    note: string | null = null,
    prizeId: number | null = null,
    redeemMode: string | null = null;
  if (mode === "load") {
    const points = Number(input.puntosAgregados);
    if (!Number.isFinite(points) || points <= 0) {
      return jsonError(c, 400, "Puntos inválidos. Deben ser mayores a 0.");
    }
    delta = points;
    const ops = Number(input.operations);
    operations = Number.isFinite(ops) && ops > 0
      ? Math.trunc(ops)
      : points % 50 === 0
      ? points / 50
      : null;
  } else if (mode === "custom") {
    const points = integer(input.pointsToRedeem);
    if (!points || points <= 0) {
      return jsonError(c, 400, "Puntos inválidos. Deben ser mayor a 0.");
    }
    delta = -points;
    note = String(input.note || "").trim() || "Canje personalizado";
    redeemMode = "CUSTOM";
  } else {
    prizeId = integer(input.premioId);
    if (!prizeId || prizeId <= 0) {
      return jsonError(c, 400, "Premio inválido. Debe ser mayor a 0.");
    }
    const [prize] = await query<any>("SELECT * FROM prizes WHERE id = $1", [
      prizeId,
    ]);
    if (!prize) return jsonError(c, 404, "Premio inexistente.");
    delta = -Number(prize.costo_puntos);
    note = String(input.note || prize.nombre || "Canje");
    redeemMode = "PRIZE";
  }
  const newPoints = Number(customer.puntos) + delta;
  if (newPoints < 0) {
    return jsonError(c, 400, "Saldo insuficiente", {
      error: "Saldo insuficiente",
      currentPoints: customer.puntos,
    });
  }
  const createdAt = new Date().toISOString();
  await sql.begin(async (tx) => {
    await tx`UPDATE customers SET puntos = ${newPoints} WHERE id = ${customer.id}`;
    await tx`INSERT INTO transactions (customerid, type, operations, points, note, userid, username, redeemmode, prizeid, createdat) VALUES (${customer.id}, ${
      mode === "load" ? "LOAD" : "REDEEM"
    }, ${operations}, ${delta}, ${note}, ${user.id}, ${user.username}, ${redeemMode}, ${prizeId}, ${createdAt})`;
  });
  let raffleTicket = null;
  if (
    mode === "load" && createdAt >= "2026-06-01T03:00:00.000Z" &&
    createdAt < "2026-08-01T03:00:00.000Z"
  ) {
    const [count] = await query<any>(
      "SELECT COUNT(1)::int AS count FROM transactions WHERE customerid = $1 AND type = 'LOAD' AND voidedat IS NULL AND createdat >= $2 AND createdat < $3",
      [customer.id, "2026-06-01T03:00:00.000Z", "2026-08-01T03:00:00.000Z"],
    );
    raffleTicket = {
      customerName: customer.nombre,
      pointsLoaded: delta,
      chanceCount: Number(count?.count || 0),
    };
  }
  return c.json({
    message: mode === "load"
      ? "Puntos cargados correctamente."
      : "Puntos canjeados correctamente.",
    puntosNuevos: newPoints,
    currentPoints: customer.puntos,
    newPoints,
    raffleTicket,
  });
};

app.post("/api/points/points/load", (c) => loadOrRedeem(c, "load"));
app.post("/api/points/points/redeem-custom", (c) => loadOrRedeem(c, "custom"));
app.post("/api/prizes/prizes/redeem", (c) => loadOrRedeem(c, "prize"));
app.post("/api/prizes/points/redeem", (c) => loadOrRedeem(c, "prize"));

app.post("/api/transactions/transactions/:id/void", admin, async (c) => {
  const id = integer(c.req.param("id"));
  const input = await body(c);
  const user = c.get("user");
  if (!id) return jsonError(c, 400, "Transacción inválida.");
  const [txRow] = await query<any>("SELECT * FROM transactions WHERE id = $1", [
    id,
  ]);
  if (!txRow) return jsonError(c, 404, "Transacción no encontrada.");
  if (txRow.type !== "LOAD") {
    return jsonError(c, 400, "Solo se puede anular cargas.");
  }
  if (txRow.voidedat) return jsonError(c, 400, "La carga ya está anulada.");
  const [customer] = await query<any>("SELECT * FROM customers WHERE id = $1", [
    txRow.customerid,
  ]);
  const deltaPoints = -Number(txRow.points);
  const newPoints = Number(customer.puntos) + deltaPoints;
  const now = new Date().toISOString();
  const reason = String(input.reason || "").trim();
  let adjustment: any[] = [];
  await sql.begin(async (db) => {
    await db`UPDATE customers SET puntos = ${newPoints} WHERE id = ${customer.id}`;
    await db`UPDATE transactions SET voidedat = ${now}, voidedbyuserid = ${user.id}, voidreason = ${
      reason || null
    } WHERE id = ${id}`;
    adjustment =
      await db`INSERT INTO transactions (customerid, type, points, note, userid, username, originaltransactionid, createdat) VALUES (${txRow.customerid}, 'ADJUST', ${deltaPoints}, ${`Anulación de carga #${id}${
        reason ? `: ${reason}` : ""
      }`}, ${user.id}, ${user.username}, ${id}, ${now}) RETURNING id`;
  });
  return c.json({
    ok: true,
    originalId: id,
    adjustTransactionId: adjustment[0]?.id,
    customerId: txRow.customerid,
    deltaPoints,
    newPoints,
  });
});

const MATCH_KEY = "argentina-vs-jordania-2026-06-27";
const MATCH_LABEL = "Argentina vs Jordania";
const MATCH_DATE = "2026-06-27";
const outcomes = new Set(["ARG", "EMPATE", "JOR"]);
const predictionFilters = (c: any) => {
  const params: unknown[] = [];
  const where: string[] = [];
  const search = String(c.req.query("search") || "").trim();
  const outcome = String(c.req.query("outcome") || "").trim().toUpperCase();
  const argText = String(c.req.query("argentinaGoals") ?? "").trim();
  const jorText = String(c.req.query("jordaniaGoals") ?? "").trim();
  const argentinaGoals = argText === "" ? null : integer(argText);
  const jordaniaGoals = jorText === "" ? null : integer(jorText);
  if (search) {
    params.push(`%${search}%`);
    where.push(
      `(customer_name_snapshot ILIKE $${params.length} OR customer_dni_snapshot ILIKE $${params.length})`,
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
    where: where.length ? `WHERE ${where.join(" AND ")}` : "",
    outcome,
    argentinaGoals,
    jordaniaGoals,
  };
};
const validPredictionFilters = (
  filters: ReturnType<typeof predictionFilters>,
) =>
  (!filters.outcome || outcomes.has(filters.outcome)) &&
  (filters.argentinaGoals === null || filters.argentinaGoals >= 0) &&
  (filters.jordaniaGoals === null || filters.jordaniaGoals >= 0);

app.post("/api/predictions", async (c) => {
  const input = await body(c);
  const user = c.get("user");
  const customerId = integer(input.customerId);
  const predictedOutcome = String(input.predictedOutcome || "").trim()
    .toUpperCase();
  const argentinaGoals = integer(input.argentinaGoals);
  const jordaniaGoals = integer(input.jordaniaGoals);
  if (!customerId || customerId <= 0) {
    return jsonError(c, 400, "Cliente inválido.");
  }
  if (!outcomes.has(predictedOutcome)) {
    return jsonError(c, 400, "Resultado pronosticado inválido.");
  }
  if (argentinaGoals === null || argentinaGoals < 0) {
    return jsonError(c, 400, "Goles de Argentina inválidos.");
  }
  if (jordaniaGoals === null || jordaniaGoals < 0) {
    return jsonError(c, 400, "Goles de Jordania inválidos.");
  }
  const expected = argentinaGoals > jordaniaGoals
    ? "ARG"
    : argentinaGoals < jordaniaGoals
    ? "JOR"
    : "EMPATE";
  if (predictedOutcome !== expected) {
    return jsonError(
      c,
      400,
      "El resultado seleccionado no coincide con el marcador.",
    );
  }
  const [customer] = await query<any>(
    "SELECT id, nombre, dni FROM customers WHERE id = $1",
    [customerId],
  );
  if (!customer) return jsonError(c, 404, "Cliente no encontrado.");
  const createdAt = new Date().toISOString();
  const [created] = await query<any>(
    `INSERT INTO predictions (customerid, customer_name_snapshot, customer_dni_snapshot, match_key, match_label, match_date, predicted_outcome, argentina_goals, jordania_goals, createdat, userid, username) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
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
      user.id,
      user.username,
    ],
  );
  return c.json({
    id: created.id,
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
    userId: user.id,
    userName: user.username,
  }, 201);
});

app.get("/api/predictions", admin, async (c) => {
  const filters = predictionFilters(c);
  if (!validPredictionFilters(filters)) {
    return jsonError(c, 400, "Filtro de pronóstico inválido.");
  }
  const items = await query(
    `SELECT id, customerid AS "customerId", customer_name_snapshot AS "customerName", customer_dni_snapshot AS "customerDni", match_key AS "matchKey", match_label AS "matchLabel", match_date AS "matchDate", predicted_outcome AS "predictedOutcome", argentina_goals AS "argentinaGoals", jordania_goals AS "jordaniaGoals", createdat AS "createdAt", userid AS "userId", username AS "userName" FROM predictions ${filters.where} ORDER BY createdat DESC`,
    filters.params,
  );
  return c.json({ items });
});

app.get("/api/predictions/export.xlsx", admin, async (c) => {
  const filters = predictionFilters(c);
  if (!validPredictionFilters(filters)) {
    return jsonError(c, 400, "Filtro de pronóstico inválido.");
  }
  const rows = await query(
    `SELECT createdat AS "createdAt", customer_name_snapshot AS "customerName", customer_dni_snapshot AS "customerDni", predicted_outcome AS "predictedOutcome", argentina_goals AS "argentinaGoals", jordania_goals AS "jordaniaGoals", username AS "userName", match_label AS "matchLabel", match_date AS "matchDate" FROM predictions ${filters.where} ORDER BY createdat DESC`,
    filters.params,
  );
  for (const row of rows) {
    row.predictedOutcome = row.predictedOutcome === "ARG"
      ? "Argentina"
      : row.predictedOutcome === "JOR"
      ? "Jordania"
      : "Empate";
  }
  return workbookResponse(rows, [
    ["Fecha registro", "createdAt"],
    ["Cliente", "customerName"],
    ["DNI", "customerDni"],
    ["Resultado pronosticado", "predictedOutcome"],
    ["Goles Argentina", "argentinaGoals"],
    ["Goles Jordania", "jordaniaGoals"],
    ["Usuario", "userName"],
    ["Partido", "matchLabel"],
    ["Fecha partido", "matchDate"],
  ], "pronosticos.xlsx");
});

const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Tucuman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const addDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10).replace(/^/, "");
const nextDay = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};
const reportRange = (c: any) => {
  const from = String(c.req.query("from") || "").trim() || localDate();
  const to = String(c.req.query("to") || "").trim() || from;
  return {
    from,
    to,
    start: `${from}T03:00:00.000Z`,
    end: `${nextDay(to)}T03:00:00.000Z`,
  };
};
const reportUser = (c: any, params: unknown[], alias = "t") => {
  const userIdRaw = String(c.req.query("userId") || "").trim();
  const userName = String(c.req.query("userName") || c.req.query("user") || "")
    .trim();
  if (userIdRaw && /^\d+$/.test(userIdRaw)) {
    params.push(Number(userIdRaw));
    return { clause: ` AND ${alias}.userid = $${params.length}`, valid: true };
  }
  if (userName) {
    params.push(userName);
    return {
      clause: ` AND ${alias}.username = $${params.length}`,
      valid: true,
    };
  }
  return { clause: "", valid: !userIdRaw };
};

app.get("/api/reports/points-loaded", admin, async (c) => {
  const range = reportRange(c);
  const params: unknown[] = [range.start, range.end];
  const userFilter = reportUser(c, params);
  if (!userFilter.valid) {
    return jsonError(
      c,
      400,
      "El filtro de usuario debe ser un ID numérico o un nombre.",
    );
  }
  const where =
    `WHERE t.type = 'LOAD' AND t.voidedat IS NULL AND t.createdat >= $1 AND t.createdat < $2${userFilter.clause}`;
  const [total] = await query<any>(
    `SELECT COALESCE(SUM(t.points), 0)::int AS total FROM transactions t ${where}`,
    params,
  );
  const items = await query(
    `SELECT t.id, t.createdat AS "createdAt", t.points, t.operations, t.userid AS "userId", t.username AS "userName", t.customerid AS "customerId", c.dni AS "customerDni", c.nombre AS "customerName" FROM transactions t JOIN customers c ON c.id = t.customerid ${where} ORDER BY t.createdat DESC`,
    params,
  );
  const totalPointsLoaded = Number(total?.total || 0);
  return c.json({
    totals: { totalPointsLoaded, totalVoided: 0, totalNet: totalPointsLoaded },
    items,
  });
});

app.get("/api/reports/points-redeemed-by-user", admin, async (c) => {
  const range = reportRange(c);
  const params: unknown[] = [range.start, range.end];
  const userFilter = reportUser(c, params);
  if (!userFilter.valid) {
    return jsonError(
      c,
      400,
      "El filtro de usuario debe ser un ID numérico o un nombre.",
    );
  }
  const where =
    `WHERE t.type = 'REDEEM' AND t.voidedat IS NULL AND t.createdat >= $1 AND t.createdat < $2${userFilter.clause}`;
  const summary = await query<any>(
    `SELECT t.userid AS "userId", t.username AS "userName", COALESCE(SUM(CASE WHEN t.redeemmode = 'CUSTOM' OR (t.redeemmode IS NULL AND t.note = 'Canje personalizado') THEN ABS(t.points) ELSE 0 END), 0)::int AS "customRedeemedPoints", COALESCE(SUM(CASE WHEN t.redeemmode = 'PRIZE' OR (t.redeemmode IS NULL AND p_name.id IS NOT NULL) THEN 1 ELSE 0 END), 0)::int AS "prizeRedemptionsCount" FROM transactions t LEFT JOIN prizes p_name ON p_name.nombre = t.note ${where} GROUP BY t.userid, t.username ORDER BY "customRedeemedPoints" DESC, "prizeRedemptionsCount" DESC`,
    params,
  );
  const details = await query<any>(
    `SELECT t.userid AS "userId", t.username AS "userName", COALESCE(p_id.nombre, p_name.nombre, t.note, 'Premio') AS "prizeName", COUNT(1)::int AS "redemptionsCount", COALESCE(SUM(ABS(t.points)),0)::int AS "redeemedPoints" FROM transactions t LEFT JOIN prizes p_id ON p_id.id = t.prizeid LEFT JOIN prizes p_name ON p_name.nombre = t.note ${where} AND (t.redeemmode = 'PRIZE' OR (t.redeemmode IS NULL AND p_name.id IS NOT NULL)) GROUP BY t.userid, t.username, COALESCE(p_id.nombre, p_name.nombre, t.note, 'Premio') ORDER BY "redeemedPoints" DESC`,
    params,
  );
  const items = summary.map((row: any) => ({
    userId: row.userId,
    userName: row.userName || null,
    customRedeemedPoints: Number(row.customRedeemedPoints || 0),
    prizeRedemptionsCount: Number(row.prizeRedemptionsCount || 0),
    prizeDetails: details.filter((d: any) =>
      d.userId === row.userId && d.userName === row.userName
    ).map((d: any) => ({
      prizeName: d.prizeName,
      redemptionsCount: Number(d.redemptionsCount),
      redeemedPoints: Number(d.redeemedPoints),
    })),
  }));
  const totals = items.reduce((acc, item) => ({
    totalCustomRedeemedPoints: acc.totalCustomRedeemedPoints +
      item.customRedeemedPoints,
    totalPrizeRedemptions: acc.totalPrizeRedemptions +
      item.prizeRedemptionsCount,
    usersWithRedemptions: acc.usersWithRedemptions +
      ((item.customRedeemedPoints || item.prizeRedemptionsCount) ? 1 : 0),
  }), {
    totalCustomRedeemedPoints: 0,
    totalPrizeRedemptions: 0,
    usersWithRedemptions: 0,
  });
  return c.json({ totals, items });
});

const CAMPAIGN_FROM = "2026-06-01";
const CAMPAIGN_TO = "2026-07-31";
const CAMPAIGN_START = "2026-06-01T03:00:00.000Z";
const CAMPAIGN_END = "2026-08-01T03:00:00.000Z";
const RAFFLE_RESULT_KEY = "raffle_2026_june_july_result";
const effectiveCampaignEnd = () => {
  const now = new Date();
  const start = new Date(CAMPAIGN_START);
  const end = new Date(CAMPAIGN_END);
  return (now < start ? start : now < end ? now : end).toISOString();
};
const raffleEntries = async (search = "", user = "") => {
  const params: unknown[] = [CAMPAIGN_START, effectiveCampaignEnd()];
  const filters: string[] = [];
  if (search) {
    params.push(`%${search}%`);
    filters.push(
      `(e."customerName" ILIKE $${params.length} OR e."customerDni" ILIKE $${params.length} OR e."customerPhone" ILIKE $${params.length})`,
    );
  }
  if (user) {
    params.push(`%${user}%`);
    filters.push(`e."userName" ILIKE $${params.length}`);
  }
  return await query<any>(
    `WITH raffle_entries AS (SELECT t.id, ROW_NUMBER() OVER (ORDER BY t.createdat ASC, t.id ASC)::int AS "chanceNumber", t.createdat AS "createdAt", t.points, t.operations, t.userid AS "userId", t.username AS "userName", t.customerid AS "customerId", c.dni AS "customerDni", c.nombre AS "customerName", c.celular AS "customerPhone" FROM transactions t JOIN customers c ON c.id = t.customerid WHERE t.type = 'LOAD' AND t.voidedat IS NULL AND t.createdat >= $1 AND t.createdat < $2) SELECT * FROM raffle_entries e ${
      filters.length ? `WHERE ${filters.join(" AND ")}` : ""
    } ORDER BY e."createdAt" DESC, e.id DESC`,
    params,
  );
};

app.get("/api/raffle/entries", admin, async (c) => {
  const items = await raffleEntries(
    String(c.req.query("search") || "").trim(),
    String(c.req.query("user") || c.req.query("userName") || "").trim(),
  );
  return c.json({
    campaign: {
      from: CAMPAIGN_FROM,
      to: CAMPAIGN_TO,
      effectiveTo: effectiveCampaignEnd(),
    },
    items,
  });
});

app.get("/api/raffle/result", admin, async (c) => {
  const [row] = await query<any>("SELECT value FROM settings WHERE key = $1", [
    RAFFLE_RESULT_KEY,
  ]);
  try {
    return c.json({ result: row?.value ? JSON.parse(row.value) : null });
  } catch {
    return c.json({ result: null });
  }
});

app.delete("/api/raffle/result", admin, async (c) => {
  await query("DELETE FROM settings WHERE key = $1", [RAFFLE_RESULT_KEY]);
  return c.json({ ok: true });
});

app.get("/api/raffle/top-loaders", admin, async (c) => {
  const rows = await query<any>(
    `SELECT userid AS "userId", username AS "userName", COALESCE(SUM(points),0)::int AS "totalPoints", COUNT(1)::int AS "loadCount" FROM transactions WHERE type = 'LOAD' AND voidedat IS NULL AND username IS NOT NULL AND createdat >= $1 AND createdat < $2 GROUP BY userid, username ORDER BY "totalPoints" DESC, "loadCount" DESC, "userName" ASC LIMIT 5`,
    [CAMPAIGN_START, effectiveCampaignEnd()],
  );
  return c.json({
    items: rows.map((r: any) => ({
      ...r,
      userName: r.userName || "Sin usuario",
      totalPoints: Number(r.totalPoints),
      loadCount: Number(r.loadCount),
    })),
  });
});

app.post("/api/raffle/draw", admin, async (c) => {
  const entries = (await raffleEntries()).sort((a: any, b: any) =>
    a.chanceNumber - b.chanceNumber
  );
  if (!entries.length) {
    return jsonError(c, 409, "No hay cargas válidas para realizar el sorteo.");
  }
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
  const selected = entries[Math.floor(random * entries.length)];
  const result = {
    winner: {
      transactionId: selected.id,
      customerId: selected.customerId,
      customerName: selected.customerName,
      customerPhone: selected.customerPhone,
    },
    chanceNumber: selected.chanceNumber,
    eligibleEntryCount: entries.length,
    drawnAt: new Date().toISOString(),
  };
  await query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [RAFFLE_RESULT_KEY, JSON.stringify(result)],
  );
  return c.json(result);
});

app.get("/api/raffle/new-registrations/export.xlsx", admin, async () => {
  const rows = await query(
    "SELECT dni, nombre, celular FROM customers WHERE createdat >= $1 AND createdat < $2 ORDER BY createdat ASC, nombre ASC",
    [CAMPAIGN_START, CAMPAIGN_END],
  );
  return workbookResponse(rows, [["DNI", "dni"], ["Nombre", "nombre"], [
    "Celular",
    "celular",
  ]], "nuevos-registrados-junio-julio-2026.xlsx");
});

app.post("/api/auth/bootstrap-admin", async (c) => {
  const input = await body(c);
  const configured = Deno.env.get("BOOTSTRAP_SECRET");
  if (!configured || String(input.secret || "") !== configured) {
    return jsonError(c, 403, "Forbidden.");
  }
  const username = String(input.username || "Admin").trim() || "Admin";
  const password = String(input.password || "");
  if (!password) return jsonError(c, 400, "Password requerido.");
  const hash = await bcrypt.hash(password, 10);
  await query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin') ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'",
    [username, hash],
  );
  return c.json({ ok: true, username });
});

const getSetting = async (key: string) =>
  (await query<any>("SELECT value FROM settings WHERE key = $1", [key]))[0]
    ?.value || null;
const setSetting = async (key: string, value: string) => {
  await query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value],
  );
};
const parseChatIds = (
  value: unknown,
) => [
  ...new Set(
    String(value || "").split(",").map((v) => v.trim()).filter(Boolean),
  ),
];
const getChatIds = async () => {
  const current = parseChatIds(await getSetting("telegram_chat_ids"));
  if (current.length) return current;
  const legacy = parseChatIds(await getSetting("telegram_chat_id"));
  if (legacy.length) {
    await setSetting("telegram_chat_ids", legacy.join(","));
    return legacy;
  }
  return parseChatIds(Deno.env.get("TELEGRAM_CHAT_ID"));
};
const sendTelegram = async (chatId: string, text: string) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(
      `Telegram API error: ${result.description || response.statusText}`,
    );
  }
};
const dailySummary = async () => {
  const date = localDate();
  const start = `${date}T03:00:00.000Z`;
  const end = `${nextDay(date)}T03:00:00.000Z`;
  const [totals] = await query<any>(
    "SELECT COALESCE(SUM(points),0)::int AS total FROM transactions WHERE type = 'LOAD' AND voidedat IS NULL AND createdat >= $1 AND createdat < $2",
    [start, end],
  );
  const [top] = await query<any>(
    "SELECT username, COALESCE(SUM(points),0)::int AS points FROM transactions WHERE type = 'LOAD' AND voidedat IS NULL AND createdat >= $1 AND createdat < $2 GROUP BY username ORDER BY points DESC NULLS LAST LIMIT 1",
    [start, end],
  );
  const redeemed = await query<any>(
    'SELECT userid AS "userId", username AS "userName", COALESCE(SUM(ABS(points)),0)::int AS "redeemedPoints" FROM transactions WHERE type = \'REDEEM\' AND voidedat IS NULL AND createdat >= $1 AND createdat < $2 AND (redeemmode = \'CUSTOM\' OR (redeemmode IS NULL AND note = \'Canje personalizado\')) GROUP BY userid, username ORDER BY "redeemedPoints" DESC',
    [start, end],
  );
  return {
    totalPoints: Number(totals?.total || 0),
    topUserName: top?.username || "Sin registros",
    topUserPoints: Number(top?.points || 0),
    customRedeemedByUser: redeemed.map((r: any) => ({
      ...r,
      redeemedPoints: Number(r.redeemedPoints),
    })),
    formattedDate: date.split("-").reverse().join("/"),
  };
};
const sendDailySummary = async () => {
  if (!Deno.env.get("TELEGRAM_BOT_TOKEN")) {
    return { skipped: true, reason: "Missing TELEGRAM_BOT_TOKEN" };
  }
  const recipients = [
    ...new Set(
      [...(await getChatIds()), Deno.env.get("TELEGRAM_CHAT_ID_2")].filter(
        Boolean,
      ) as string[],
    ),
  ];
  if (!recipients.length) {
    return { skipped: true, reason: "Missing Telegram chat id" };
  }
  const summary = await dailySummary();
  const custom = summary.customRedeemedByUser.map((item: any) =>
    `- ${
      item.userName || (item.userId ? `ID ${item.userId}` : "Sin usuario")
    }: ${item.redeemedPoints} pts`
  );
  const message = [
    `Aguipuntos - Resumen (${summary.formattedDate})`,
    `Puntos cargados hoy: ${summary.totalPoints}`,
    `Usuario que más cargó: ${summary.topUserName} (${summary.topUserPoints} pts)`,
    custom.length
      ? `Canjes personalizados hoy:\n${custom.join("\n")}`
      : "Canjes personalizados hoy: sin canjes.",
  ].join("\n");
  for (const chatId of recipients) {
    try {
      await sendTelegram(chatId, message);
    } catch (error) {
      console.error("Telegram send failed", chatId, error);
    }
  }
  return { skipped: false, summary };
};

app.post("/api/bot/register", async (c) => {
  const input = await body(c);
  const chatId = input.chatId || input?.message?.chat?.id ||
    input?.my_chat_member?.chat?.id;
  const isStart = String(input?.message?.text || "").trim().startsWith(
    "/start",
  );
  if (!chatId) return jsonError(c, 400, "Missing chat id");
  if (!input.chatId && !isStart) {
    return c.json({ ok: true, message: "Ignored non /start update" });
  }
  const ids = await getChatIds();
  const normalized = String(chatId);
  if (!ids.includes(normalized)) {
    if (ids.length >= 2) return jsonError(c, 400, "Max 2 chat ids");
    ids.push(normalized);
    await setSetting("telegram_chat_ids", ids.join(","));
  }
  return c.json({ ok: true, chatId: normalized, chatIds: ids });
});
app.post("/api/bot/telegram-webhook", async (c) => {
  const input = await body(c);
  const chatId = input.chatId || input?.message?.chat?.id ||
    input?.my_chat_member?.chat?.id;
  if (!chatId) return jsonError(c, 400, "Missing chat id");
  if (
    !input.chatId &&
    !String(input?.message?.text || "").trim().startsWith("/start")
  ) return c.json({ ok: true, message: "Ignored non /start update" });
  const ids = await getChatIds();
  const normalized = String(chatId);
  if (!ids.includes(normalized)) {
    if (ids.length >= 2) return jsonError(c, 400, "Max 2 chat ids");
    ids.push(normalized);
    await setSetting("telegram_chat_ids", ids.join(","));
  }
  return c.json({ ok: true, chatId: normalized, chatIds: ids });
});
app.post("/api/bot/cron-daily-summary", async (c) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Tucuman",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour !== "22") {
    return jsonError(c, 403, "Outside scheduled window.");
  }

  const sentDate = await getSetting("telegram_daily_summary_last_date");
  if (sentDate === date) {
    return c.json({ ok: true, skipped: true, reason: "Already sent today" });
  }

  const result = await sendDailySummary();
  if (result.skipped) {
    return c.json({ ok: false, reason: result.reason }, 400);
  }
  await setSetting("telegram_daily_summary_last_date", date);
  return c.json({ ok: true, summary: result.summary });
});
app.post("/api/bot/daily-summary", async (c) => {
  if (
    !Deno.env.get("BOT_SECRET") ||
    c.req.query("secret") !== Deno.env.get("BOT_SECRET")
  ) return jsonError(c, 401, "Unauthorized");
  const result = await sendDailySummary();
  return result.skipped
    ? c.json({ ok: false, reason: result.reason }, 400)
    : c.json({ ok: true, summary: result.summary });
});

app.notFound((c) => jsonError(c, 404, "Not found"));
app.onError((error, c) => {
  console.error(error);
  return jsonError(c, 500, "Internal server error");
});

Deno.serve((request) => {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/functions\/v1\/api/, "") || "/";
  // Hosted Edge Functions may expose the function name as the first path
  // segment. The frontend contract already begins with /api, so collapse the
  // duplicated /api/api prefix when present.
  if (url.pathname.startsWith("/api/api/")) {
    url.pathname = url.pathname.slice(4);
  }
  return app.fetch(new Request(url, request));
});
