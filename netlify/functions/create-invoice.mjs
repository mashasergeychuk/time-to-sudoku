// Приймає замовлення з сайту:
//  1) рахує суму на сервері (щоб її не можна було підмінити в браузері);
//  2) записує замовлення в Google Таблицю;
//  3) для оплати карткою створює рахунок у plata by mono і повертає посилання на оплату.
// Змінні середовища: MONO_TOKEN, SHEET_URL, SHEET_SECRET.

import { postToSheet } from "../lib/sheet.mjs";
import { sendTelegram } from "../lib/tg.mjs";

const PRICE = 370;      // грн за одну книжечку
const SET_PRICE = 1000; // грн за набір №1 + №2 + №3
const BOOKS = {
  n1: "Судоку №1, складний",
  n2: "Судоку №2, легкий",
  n3: "Судоку №3, середній",
};

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "bad json" }); }

  const orderId = clean(body.orderId, 40);
  if (!/^TTS-[0-9A-Z-]+$/.test(orderId)) return json(400, { error: "bad order id" });
  const pay = body.pay === "cod" ? "cod" : "card";

  // Кількість кожної книжечки (1–20)
  const counts = { n1: 0, n2: 0, n3: 0 };
  for (const item of Array.isArray(body.items) ? body.items : []) {
    const qty = Math.floor(Number(item.qty));
    if (!(item.id in counts) || !(qty >= 1 && qty <= 20)) return json(400, { error: "bad item" });
    counts[item.id] += qty;
  }
  if (!(counts.n1 + counts.n2 + counts.n3)) return json(400, { error: "empty cart" });

  // Кожна трійка №1+№2+№3 іде як набір, решта поштучно
  const sets = Math.min(counts.n1, counts.n2, counts.n3);
  const basketOrder = [];
  if (sets) {
    basketOrder.push({
      name: "Набір судоку №1, №2, №3",
      qty: sets, sum: SET_PRICE * 100, total: SET_PRICE * 100 * sets,
      unit: "шт.", code: "set-123",
    });
  }
  for (const id of Object.keys(BOOKS)) {
    const qty = counts[id] - sets;
    if (qty > 0) {
      basketOrder.push({
        name: BOOKS[id], qty, sum: PRICE * 100, total: PRICE * 100 * qty,
        unit: "шт.", code: id,
      });
    }
  }
  const amount = basketOrder.reduce((s, i) => s + i.total, 0); // у копійках
  const itemsText = basketOrder.map((i) => `${i.name} × ${i.qty}`).join("; ");
  const email = clean(body.email, 120);

  // Запис у таблицю. Якщо таблиця недоступна, замовлення все одно приймаємо.
  try {
    await postToSheet({
      action: "add",
      orderId,
      status: pay === "card" ? "очікує оплату" : "накладений платіж",
      total: amount / 100,
      pay: pay === "card" ? "картка онлайн" : "накладений платіж",
      items: itemsText,
      name: clean(body.name), phone: clean(body.phone, 40), email,
      city: clean(body.city), np: clean(body.np, 40), note: clean(body.note, 1000),
      callback: Boolean(body.callback),
    });
  } catch (e) {
    console.error("sheet add failed", e);
  }

  // Сповіщення в Telegram
  const lines = [
    `🧩 Нове замовлення ${orderId}`,
    "",
    ...basketOrder.map((i) => `• ${i.name} × ${i.qty}`),
    `Сума: ${amount / 100} грн`,
    `Оплата: ${pay === "card" ? "картка онлайн (чекаємо оплату)" : "накладений платіж"}`,
    "",
    `${clean(body.name)}, ${clean(body.phone, 40)}`,
    `${clean(body.city)}`,
    `${clean(body.np, 200)}`,
  ];
  if (body.note) lines.push(`Коментар: ${clean(body.note, 500)}`);
  if (body.callback) lines.push("📞 Просить передзвонити");
  await sendTelegram(lines.join("\n"));

  if (pay === "cod") return json(200, { ok: true });

  const token = process.env.MONO_TOKEN;
  if (!token) return json(500, { error: "MONO_TOKEN is not set" });

  const siteUrl = process.env.URL || new URL(req.url).origin;
  const payload = {
    amount,
    ccy: 980,
    merchantPaymInfo: {
      reference: orderId,
      destination: `Замовлення ${orderId}, time to sudoku`,
      basketOrder,
      ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { customerEmails: [email] } : {}),
    },
    redirectUrl: `${siteUrl}/thanks.html?order=${encodeURIComponent(orderId)}`,
    webHookUrl: `${siteUrl}/.netlify/functions/mono-webhook`,
    validity: 3600,
  };

  const r = await fetch("https://api.monobank.ua/api/merchant/invoice/create", {
    method: "POST",
    headers: { "X-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.pageUrl) {
    console.error("mono invoice error", r.status, data);
    return json(502, { error: "payment provider error" });
  }
  return json(200, { invoiceId: data.invoiceId, pageUrl: data.pageUrl });
};
