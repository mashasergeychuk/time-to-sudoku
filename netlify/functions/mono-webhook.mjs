// mono надсилає сюди зміни статусу оплати. Ми перевіряємо підпис банку
// і оновлюємо статус замовлення в Google Таблиці.
// Змінні середовища: MONO_TOKEN, SHEET_URL, SHEET_SECRET.

import crypto from "node:crypto";
import { postToSheet } from "../lib/sheet.mjs";
import { sendTelegram } from "../lib/tg.mjs";

let cachedKey = null;

async function getPublicKey(token, refresh = false) {
  if (cachedKey && !refresh) return cachedKey;
  const r = await fetch("https://api.monobank.ua/api/merchant/pubkey", {
    headers: { "X-Token": token },
  });
  const { key } = await r.json();
  cachedKey = Buffer.from(key, "base64").toString("utf8"); // PEM
  return cachedKey;
}

function isValid(rawBody, signBase64, pem) {
  try {
    const v = crypto.createVerify("SHA256");
    v.update(rawBody);
    v.end();
    return v.verify(pem, Buffer.from(signBase64, "base64"));
  } catch {
    return false;
  }
}

// Записуємо в таблицю лише кінцеві статуси
const STATUS = {
  success: "оплачено",
  failure: "оплата не пройшла",
  expired: "рахунок прострочено",
  reversed: "кошти повернено",
};

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const token = process.env.MONO_TOKEN;
  if (!token) return new Response("no token", { status: 500 });

  const raw = await req.text();
  const sign = req.headers.get("x-sign") || "";

  let ok = isValid(raw, sign, await getPublicKey(token));
  if (!ok) ok = isValid(raw, sign, await getPublicKey(token, true)); // ключ міг змінитися
  if (!ok) return new Response("bad signature", { status: 400 });

  let data;
  try { data = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const status = STATUS[data.status];
  if (!status || !data.reference) return new Response("ok"); // проміжні статуси пропускаємо

  try {
    await postToSheet({
      action: "status",
      orderId: data.reference,
      status,
      paidAt: data.status === "success" ? data.modifiedDate : "",
    });
  } catch (e) {
    console.error("sheet status failed", e);
    return new Response("sheet error", { status: 500 }); // mono спробує ще раз
  }

  const sum = data.finalAmount ?? data.amount;
  const sumText = typeof sum === "number" ? ` — ${sum / 100} грн` : "";
  const icon = { success: "✅", failure: "❌", expired: "⌛", reversed: "↩️" }[data.status];
  await sendTelegram(`${icon} ${status[0].toUpperCase() + status.slice(1)}: ${data.reference}${sumText}`);

  return new Response("ok");
};
