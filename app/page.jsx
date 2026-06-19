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
      // range=2y & events=div so we also receive the dividend history
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&events=div`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (portfolio-app)" },
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = "HTTP " + res.status;
        continue;
      }
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      const price = meta?.regularMarketPrice ?? meta?.previousClose;
      if (typeof price !== "number") {
        lastErr = "価格が見つかりません";
        continue;
      }

      // Sum the dividends actually paid in the trailing 12 months
      // = an estimate of the annual dividend per share (実績ベース).
      let annualDividend = null;
      const divs = result?.events?.dividends;
      if (divs && typeof divs === "object") {
        const cutoff = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
        let sum = 0;
        let count = 0;
        for (const key in divs) {
          const d = divs[key];
          if (d && typeof d.amount === "number" && (d.date ?? 0) >= cutoff) {
            sum += d.amount;
            count += 1;
          }
        }
        if (count > 0) annualDividend = Math.round(sum * 100) / 100;
      }

      return {
        symbol,
        ok: true,
        price,
        currency: meta?.currency ?? null,
        time: meta?.regularMarketTime ?? null,
        annualDividend,
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

  const symbols = raw
    ? [
        ...new Set(
          raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        ),
      ].slice(0, 50)
    : [];

  // Fetch the requested quotes and the USD/JPY rate in parallel.
  // Yahoo's "JPY=X" = how many yen per 1 USD (e.g. ~150), used to convert
  // US-stock values into yen for the combined portfolio totals.
  const [quotes, rateQuote] = await Promise.all([
    Promise.all(symbols.map(fetchOne)),
    fetchOne("JPY=X"),
  ]);
  const usdJpy = rateQuote.ok ? rateQuote.price : null;

  return Response.json({ quotes, usdJpy, fetchedAt: Date.now() });
}
