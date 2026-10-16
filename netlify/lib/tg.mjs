// Надсилає повідомлення вам у Telegram.
// Змінні середовища: TG_BOT_TOKEN (від @BotFather) і TG_CHAT_ID (ваш chat id).
// Якщо їх немає або Telegram не відповідає, замовлення все одно приймається.

export async function sendTelegram(text) {
  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!r.ok) console.error("telegram error", r.status, await r.text());
  } catch (e) {
    console.error("telegram failed", e);
  }
}
