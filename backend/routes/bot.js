const express = require("express");
const { DateTime } = require("luxon");

const db = require("../db");
const {
  getChatIdFromUpdate,
  isStartCommand,
  sendTelegramMessage,
} = require("../bot/telegram");

const router = express.Router();

const SETTINGS_KEY_CHAT = "telegram_chat_id";
const DEFAULT_TZ = "America/Argentina/Tucuman";

const upsertSetting = async (key, value) => {
  await db.run(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value]
  );
};

const getSetting = async (key) => {
  const result = await db.get("SELECT value FROM settings WHERE key = $1", [key]);
  return result?.value || null;
};

const resolveChatId = async () => {
  const stored = await getSetting(SETTINGS_KEY_CHAT);
  if (stored) return stored;
  return process.env.TELEGRAM_CHAT_ID || null;
};

const buildDailySummary = async () => {
  const timezone = process.env.TZ || DEFAULT_TZ;
  const now = DateTime.now().setZone(timezone);
  const start = now.startOf("day").toUTC().toJSDate();
  const end = now.endOf("day").toUTC().toJSDate();

  const totalRow = await db.get(
    "SELECT COALESCE(SUM(points), 0) AS total FROM transactions WHERE type = 'LOAD' AND createdat >= $1 AND createdat <= $2",
    [start, end]
  );

  const topRow = await db.get(
    "SELECT username, SUM(points) AS total FROM transactions WHERE type = 'LOAD' AND createdat >= $1 AND createdat <= $2 GROUP BY username ORDER BY total DESC NULLS LAST LIMIT 1",
    [start, end]
  );

  const totalPoints = Number(totalRow?.total || 0);
  const topUserName = topRow?.username || "Sin registros";
  const topUserPoints = Number(topRow?.total || 0);

  const formattedDate = now.toFormat("dd/LL/yyyy");
  return {
    totalPoints,
    topUserName,
    topUserPoints,
    formattedDate,
  };
};

const sendDailySummaryInternal = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = await resolveChatId();

  if (!chatId) {
    throw new Error("Missing Telegram chat id");
  }

  const summary = await buildDailySummary();

  const message = [
    `Resumen diario (${summary.formattedDate})`,
    `Total de puntos cargados: ${summary.totalPoints}`,
    `Usuario con más puntos: ${summary.topUserName} (${summary.topUserPoints})`,
  ].join("\n");

  await sendTelegramMessage({ token, chatId, text: message });

  return summary;
};

router.post(["/register", "/telegram-webhook"], async (req, res) => {
  try {
    const update = req.body || {};
    const isStart = isStartCommand(update);
    const explicitChatId = req.body?.chatId;
    const chatId = explicitChatId || getChatIdFromUpdate(update);

    if (!chatId) {
      return res.status(400).json({ message: "Missing chat id" });
    }

    if (!explicitChatId && !isStart) {
      return res.status(200).json({ ok: true, message: "Ignored non /start update" });
    }

    await upsertSetting(SETTINGS_KEY_CHAT, String(chatId));

    return res.status(200).json({ ok: true, chatId: String(chatId) });
  } catch (error) {
    console.error("[bot] register failed", error);
    return res.status(500).json({ message: "Failed to register chat" });
  }
});

router.post("/daily-summary", async (req, res) => {
  try {
    const secret = req.query.secret;
    if (!process.env.BOT_SECRET || secret !== process.env.BOT_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const summary = await sendDailySummaryInternal();

    return res.status(200).json({ ok: true, summary });
  } catch (error) {
    console.error("[bot] daily summary failed", error);
    return res.status(500).json({ message: "Failed to send daily summary" });
  }
});

module.exports = {
  router,
  sendDailySummaryInternal,
};
