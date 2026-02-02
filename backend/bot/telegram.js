const fetch = global.fetch;

const TELEGRAM_API_BASE = "https://api.telegram.org";

const getChatIdFromUpdate = (update) => {
  const messageChatId = update?.message?.chat?.id;
  if (messageChatId) return String(messageChatId);
  const memberChatId = update?.my_chat_member?.chat?.id;
  if (memberChatId) return String(memberChatId);
  return null;
};

const isStartCommand = (update) => {
  const text = update?.message?.text;
  if (!text) return false;
  return text.trim().startsWith("/start");
};

const sendTelegramMessage = async ({ token, chatId, text }) => {
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }
  if (!chatId) {
    throw new Error("Missing Telegram chat id");
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const description = data?.description || response.statusText;
    throw new Error(`Telegram API error: ${description}`);
  }

  return data;
};

module.exports = {
  getChatIdFromUpdate,
  isStartCommand,
  sendTelegramMessage,
};
