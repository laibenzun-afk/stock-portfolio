// Server-side price fetch. Runs on the server, so there is no browser CORS
// problem and any future API keys stay private (use process.env, never hardcode).
//
// Default source: Yahoo Finance's public chart endpoint. No key required.
// Prices are typically delayed ~15-20 minutes (or the latest close outside
// market hours). It is an UNOFFICIAL endpoint and can change without notice.
// See README for how to swap in Stooq (EOD) or J-Quants (official, free key).

export const dynamic = "force-dynamic";

async function fetchOne(symbol) {
  const hosts = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
  ];
  let lastErr = "failed";
  for (const host of hosts) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (portfolio-app)" },
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = "HTTP " + res.status;
        continue;
      }
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice ?? meta?.previousClose;
      if (typeof price !== "number") {
        lastErr = "価格が見つかりません";
        continue;
      }
      return {
        symbol,
        ok: true,
        price,
        currency: meta?.currency ?? null,
        time: meta?.regularMarketTime ?? null,
      };
    } catch (e) {
      lastErr = e?.message || "ネットワークエラー";
    }
  }
  return { symbol, ok: false, error: lastErr };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("symbols") || "").trim();
  if (!raw) return Response.json({ quotes: [], fetchedAt: Date.now() });

  const symbols = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ].slice(0, 50);

  const quotes = await Promise.all(symbols.map(fetchOne));
  return Response.json({ quotes, fetchedAt: Date.now() });
}
