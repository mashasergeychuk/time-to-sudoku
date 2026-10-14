// Повертає статус оплати для сторінки «Дякуємо».
// Шукає за номером рахунку (invoiceId), а якщо його немає (наприклад, оплату
// відкрили в іншому браузері) — за номером замовлення у виписці mono за добу.
// Потрібна змінна середовища MONO_TOKEN.

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export default async (req) => {
  const token = process.env.MONO_TOKEN;
  if (!token) return json(500, { error: "MONO_TOKEN is not set" });

  const params = new URL(req.url).searchParams;
  const invoiceId = params.get("invoiceId") || "";
  const order = params.get("order") || "";

  if (/^[A-Za-z0-9_-]{4,64}$/.test(invoiceId)) {
    const r = await fetch(
      `https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`,
      { headers: { "X-Token": token } }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(502, { error: "payment provider error" });
    return json(200, { status: data.status, reference: data.reference });
  }

  if (/^TTS-[0-9A-Z-]{4,40}$/.test(order)) {
    const from = Math.floor(Date.now() / 1000) - 24 * 3600;
    const r = await fetch(`https://api.monobank.ua/api/merchant/statement?from=${from}`, {
      headers: { "X-Token": token },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(502, { error: "payment provider error" });
    const items = (data.list || []).filter((i) => i.reference === order);
    if (!items.length) return json(200, { status: "unknown" });
    const paid = items.find((i) => i.status === "success");
    return json(200, { status: paid ? "success" : items[0].status, reference: order });
  }

  return json(400, { error: "bad params" });
};
