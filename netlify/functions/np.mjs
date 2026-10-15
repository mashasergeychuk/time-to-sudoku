// Підказки Нової пошти для форми замовлення: міста, відділення й поштомати.
//   ?type=cities&q=Київ
//   ?type=warehouses&city=<Ref міста>&kind=branch|locker&q=74
// Змінна середовища NP_API_KEY — ключ API з кабінету Нової пошти.

const API = "https://api.novaposhta.ua/v2.0/json/";

const json = (status, data, cache = true) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache ? "public, max-age=600" : "no-store",
    },
  });

async function call(modelName, calledMethod, methodProperties) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.NP_API_KEY || "", modelName, calledMethod, methodProperties }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.success) throw new Error((d.errors || []).join("; ") || `np error ${r.status}`);
  return d.data || [];
}

export default async (req) => {
  const p = new URL(req.url).searchParams;
  const type = p.get("type");
  const q = (p.get("q") || "").trim().slice(0, 60);

  try {
    if (type === "cities") {
      if (q.length < 2) return json(200, []);
      const data = await call("Address", "searchSettlements", { CityName: q, Limit: "20", Page: "1" });
      const list = (data[0]?.Addresses || [])
        .filter((a) => a.DeliveryCity && Number(a.Warehouses) > 0)
        .map((a) => ({ label: a.Present, value: a.Present, ref: a.DeliveryCity }));
      return json(200, list.slice(0, 15));
    }

    if (type === "warehouses") {
      const city = p.get("city") || "";
      if (!/^[0-9a-f-]{36}$/i.test(city)) return json(400, { error: "bad city" }, false);
      const locker = p.get("kind") === "locker";

      const props = { CityRef: city, Limit: "500", Page: "1", Language: "UA" };
      if (q) props.FindByString = q;
      let data;
      try { data = await call("AddressGeneral", "getWarehouses", props); }
      catch { data = await call("Address", "getWarehouses", props); }

      const needle = q.toLowerCase();
      const list = data
        .filter((w) => (w.CategoryOfWarehouse === "Postomat") === locker)
        .filter((w) => !needle || String(w.Description).toLowerCase().includes(needle) || String(w.Number) === q)
        .sort((a, b) => (String(b.Number) === q) - (String(a.Number) === q) || Number(a.Number) - Number(b.Number))
        .slice(0, 40)
        .map((w) => ({ label: w.Description, value: w.Description }));
      return json(200, list);
    }

    return json(400, { error: "bad type" }, false);
  } catch (e) {
    console.error("np error", e);
    return json(502, { error: "np unavailable" }, false);
  }
};
