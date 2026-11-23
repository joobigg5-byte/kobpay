import { supabaseAdmin } from "./supabaseServer";

// ONE COPY OF THE PRICE REFRESH.
//
// Two things call this: the cron, which keeps prices warm on a schedule, and
// the on-demand route the Buy Crypto page hits before it asks for a quote.
// They used to be one route, and the second was going to be a copy of the
// first — which is how the navigation lists ended up disagreeing three times.
//
// WHY ON DEMAND EXISTS AT ALL
//
// crypto_price() refuses anything older than ninety seconds, and a quote
// that cannot get a price refuses with it. Hanging that on a cron was a bad
// bet: Vercel's cron floor is once a day on Hobby and once a minute on Pro,
// so on Hobby the page is dark permanently and on Pro it is one missed run
// from dark. The page topping the price up itself removes the dependency —
// the cron becomes a warm cache, and losing it costs one extra upstream call
// on the next quote instead of taking crypto offline.

const PROVIDER = "https://api.coingecko.com/api/v3/simple/price";

// A single run will not move a price by more than this. A feed glitch that
// prints Bitcoin at $900 is far more likely than the market doing it, and on
// the rare occasion it IS the market, refusing is still right: the price
// goes stale, quotes refuse, and nobody is sold a coin priced off the wrong
// side of a crash.
const MAX_MOVE = 0.25;

/**
 * Refresh before the ninety-second cliff rather than at it. A quote arriving
 * at eighty-nine seconds would otherwise pass this check and then be refused
 * by the database a moment later.
 */
export const STALE_AFTER_MS = 45_000;

export type Outcome = {
  symbol: string;
  from: number | null;
  to: number | null;
  status: "updated" | "seeded" | "unchanged" | "rejected" | "missing";
  why?: string;
};

export type RefreshResult = {
  updated: number;
  seeded: number;
  unchanged: number;
  problems: number;
  without_feed_id: string[];
  outcomes: Outcome[];
  note?: string;
  error?: string;
  status: number;
};

/**
 * True when any active asset has no price, or the oldest price is near the
 * cliff. Cheap — one indexed read — so the on-demand route can ask before
 * deciding to call anything upstream.
 */
export async function pricesAreStale(): Promise<boolean> {
  const [{ data: assets }, { data: prices }] = await Promise.all([
    supabaseAdmin.from("crypto_assets").select("symbol").eq("is_active", true),
    supabaseAdmin.from("crypto_prices").select("symbol, fetched_at"),
  ]);

  const active = (assets ?? []).map((a) => String(a.symbol));
  if (active.length === 0) return false;

  const seen = new Map(
    (prices ?? []).map((p) => [String(p.symbol), Date.parse(String(p.fetched_at))]),
  );

  const cutoff = Date.now() - STALE_AFTER_MS;
  // A missing price counts as stale, not as nothing to do — that is the
  // first-ever quote for a newly switched-on asset.
  return active.some((s) => !seen.has(s) || !(seen.get(s)! > cutoff));
}

export async function refreshCryptoPrices(): Promise<RefreshResult> {
  const empty = {
    updated: 0, seeded: 0, unchanged: 0, problems: 0,
    without_feed_id: [] as string[], outcomes: [] as Outcome[],
  };

  const [{ data: assets, error: assetErr }, { data: held, error: heldErr }] =
    await Promise.all([
      supabaseAdmin
        .from("crypto_assets")
        .select("symbol, price_feed_id, is_active")
        .eq("is_active", true),
      supabaseAdmin.from("crypto_prices").select("symbol, usd_price"),
    ]);

  if (assetErr || heldErr) {
    console.error("crypto prices: cannot read assets or prices", assetErr ?? heldErr);
    return { ...empty, error: "cannot read assets", status: 500 };
  }

  const wanted = (assets ?? []).filter((a) => a.price_feed_id);
  const unnamed = (assets ?? []).filter((a) => !a.price_feed_id).map((a) => String(a.symbol));

  if (wanted.length === 0) {
    // Not an error. No coins are switched on yet, or none has a feed name,
    // and there is nothing to do until somebody decides.
    return {
      ...empty,
      without_feed_id: unnamed,
      note: unnamed.length > 0
        ? `no active asset has a price_feed_id (${unnamed.join(", ")})`
        : "no active assets",
      status: 200,
    };
  }

  const ids = wanted.map((a) => String(a.price_feed_id)).join(",");
  const url = `${PROVIDER}?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;

  let payload: Record<string, { usd?: number }>;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      // Without this a slow upstream holds the customer's quote open for as
      // long as it likes. Better to fail fast and let the existing price
      // stand or the quote refuse.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return { ...empty, without_feed_id: unnamed,
        error: `price provider returned ${res.status}`, status: 502 };
    }
    payload = await res.json();
  } catch (err) {
    console.error("crypto prices: provider unreachable", err);
    return { ...empty, without_feed_id: unnamed,
      error: "price provider unreachable", status: 502 };
  }

  const prevBySymbol = new Map(
    (held ?? []).map((r) => [String(r.symbol), Number(r.usd_price)]),
  );

  const outcomes: Outcome[] = [];

  for (const asset of wanted) {
    const symbol = String(asset.symbol);
    const feedId = String(asset.price_feed_id);
    const next = Number(payload?.[feedId]?.usd);
    const prev = prevBySymbol.has(symbol) ? Number(prevBySymbol.get(symbol)) : NaN;

    if (!Number.isFinite(next) || next <= 0) {
      outcomes.push({
        symbol,
        from: Number.isFinite(prev) ? prev : null,
        to: null,
        status: "missing",
        why: `provider returned nothing usable for "${feedId}"`,
      });
      continue;
    }

    if (Number.isFinite(prev) && prev > 0) {
      const move = Math.abs(next - prev) / prev;
      if (move > MAX_MOVE) {
        outcomes.push({
          symbol, from: prev, to: next, status: "rejected",
          why: `moved ${(move * 100).toFixed(1)}% in one run — kept the old price`,
        });
        continue;
      }
      // A price that has not moved still needs its timestamp refreshed, or
      // crypto_price() calls it stale and stops every quote. Here the write
      // IS the liveness signal, which is the one way this differs from the
      // FX job.
      if (move === 0) {
        const { error } = await supabaseAdmin.rpc("crypto_set_price", {
          p_symbol: symbol, p_usd_price: next, p_source: "coingecko",
        });
        outcomes.push(
          error
            ? { symbol, from: prev, to: next, status: "rejected", why: error.message }
            : { symbol, from: prev, to: next, status: "unchanged" },
        );
        continue;
      }
    }

    const { error } = await supabaseAdmin.rpc("crypto_set_price", {
      p_symbol: symbol, p_usd_price: next, p_source: "coingecko",
    });

    outcomes.push(
      error
        ? { symbol, from: Number.isFinite(prev) ? prev : null, to: next,
            status: "rejected", why: error.message }
        : { symbol, from: Number.isFinite(prev) ? prev : null, to: next,
            status: Number.isFinite(prev) ? "updated" : "seeded" },
    );
  }

  const problems = outcomes.filter(
    (o) => o.status === "rejected" || o.status === "missing",
  );

  if (problems.length > 0) {
    console.error("crypto prices: not refreshed", problems);
  }

  return {
    updated: outcomes.filter((o) => o.status === "updated").length,
    seeded: outcomes.filter((o) => o.status === "seeded").length,
    unchanged: outcomes.filter((o) => o.status === "unchanged").length,
    problems: problems.length,
    without_feed_id: unnamed,
    outcomes,
    status: 200,
  };
}
