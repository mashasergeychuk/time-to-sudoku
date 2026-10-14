// Повертає статус оплати рахунку для сторінки «Дякуємо».
// Потрібна змінна середовища MONO_TOKEN.

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export default async (req) => {
  const token = process.env.MONO_TOKEN;
  if (!token) return json(500, { error: "MONO_TOKEN is not set" });

  const invoiceId = new URL(req.url).searchParams.get("invoiceId") || "";
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(invoiceId)) return json(400, { error: "bad invoice id" });

  const r = await fetch(
    `https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`,
    { headers: { "X-Token": token } }
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return json(502, { error: "payment provider error" });

  // Віддаємо в браузер лише статус, без даних картки
  return json(200, { status: data.status, reference: data.reference });
};
