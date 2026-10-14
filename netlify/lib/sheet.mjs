// Відправляє дані в Google Таблицю через скрипт Apps Script.
// Потрібні змінні середовища SHEET_URL (посилання на веб-застосунок) і SHEET_SECRET.
// Якщо їх немає, таблиця просто пропускається, сайт працює далі.

export async function postToSheet(payload) {
  const url = process.env.SHEET_URL;
  const secret = process.env.SHEET_SECRET;
  if (!url || !secret) return { skipped: true };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, secret }),
    redirect: "follow",
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* Google іноді повертає HTML з помилкою */ }
  if (!r.ok || !data.ok) {
    throw new Error(`sheet error ${r.status}: ${data.error || text.slice(0, 200)}`);
  }
  return data;
}
