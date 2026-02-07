const express = require("express");
const db = require("../db");
const { buildDailySummary } = require("../services/dailySummary");
const {
  getChatIdFromUpdate,
  isStartCommand,
  sendTelegramMessage,
} = require("../bot/telegram");

const router = express.Router();

const SETTINGS_KEY_CHAT = "telegram_chat_id";
const SETTINGS_KEY_CHATS = "telegram_chat_ids";
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

const parseChatIds = (value) => {
  if (!value) return [];
  return Array.from(
    new Set(
      String(value)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
};

const getChatIds = async () => {
  const storedList = await getSetting(SETTINGS_KEY_CHATS);
  if (storedList) {
    return parseChatIds(storedList);
  }

  const legacyChatId = await getSetting(SETTINGS_KEY_CHAT);
  if (legacyChatId) {
    const migrated = parseChatIds(legacyChatId);
    if (migrated.length > 0) {
      await upsertSetting(SETTINGS_KEY_CHATS, migrated.join(","));
      return migrated;
    }
  }

  return parseChatIds(process.env.TELEGRAM_CHAT_ID || null);
};

const addChatId = async (chatId) => {
  const normalized = String(chatId).trim();
  if (!normalized) {
    const error = new Error("Missing chat id");
    error.status = 400;
    throw error;
  }

  const existing = await getChatIds();
  if (existing.includes(normalized)) {
    return existing;
  }

  if (existing.length >= 2) {
    const error = new Error("Max 2 chat ids");
    error.status = 400;
    throw error;
  }

  const next = [...existing, normalized];
  await upsertSetting(SETTINGS_KEY_CHATS, next.join(","));
  return next;
};

const resolveChatId = async () => {
  const chatIds = await getChatIds();
  return chatIds[0] || null;
};

const sendDailySummaryInternal = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId1 = await resolveChatId();
  const chatId2 = process.env.TELEGRAM_CHAT_ID_2;
  const recipients = [chatId1, chatId2].filter(Boolean).map(String);
  const uniqueRecipients = [...new Set(recipients)];

  if (!token) {
    return { skipped: true, reason: "Missing TELEGRAM_BOT_TOKEN" };
  }

  if (!uniqueRecipients.length) {
    return { skipped: true, reason: "Missing Telegram chat id" };
  }

  const summary = await buildDailySummary();

  const message = [
    `📊 Aguipuntos — Resumen (${summary.formattedDate})`,
    `✅ Puntos cargados hoy: ${summary.totalPoints}`,
    `🏆 Usuario que más cargó: ${summary.topUserName} (${summary.topUserPoints} pts)`,
  ].join("\n");

  for (const chatId of uniqueRecipients) {
    try {
      await sendTelegramMessage({ token, chatId, text: message });
    } catch (error) {
      console.error("[bot] failed to send daily summary", { chatId, error });
    }
  }

  console.info("[bot] daily summary sent", { chatIds: uniqueRecipients });

  return { skipped: false, summary };
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

    const chatIds = await addChatId(chatId);

    return res.status(200).json({ ok: true, chatId: String(chatId), chatIds });
  } catch (error) {
    const status = error.status || 500;
    console.error("[bot] register failed", error);
    return res.status(status).json({ message: error.message || "Failed to register chat" });
  }
});

router.post("/daily-summary", async (req, res) => {
  try {
    const secret = req.query.secret;
    if (!process.env.BOT_SECRET || secret !== process.env.BOT_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const result = await sendDailySummaryInternal();

    if (result.skipped) {
      return res.status(400).json({ ok: false, reason: result.reason });
    }

    return res.status(200).json({ ok: true, summary: result.summary });
  } catch (error) {
    console.error("[bot] daily summary failed", error);
    return res.status(500).json({ message: "Failed to send daily summary" });
  }
});

module.exports = {
  router,
  sendDailySummaryInternal,
};
