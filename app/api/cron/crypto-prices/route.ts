import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseServer";

// Crypto price refresh.
//
// WHY THIS IS NOT THE FX CRON
//
// Same shape, different clock. fx runs daily against open.er-api.com and
// tolerates a rate up to fx_max_age_minutes old, which is a day. That is
// right for a cedi and ruinous for a coin: crypto_price() refuses past
// crypto_price_max_age_seconds, which is ninety. So this has to run far more
// often than the FX job, and a missed run stops crypto quotes within two
// minutes rather than within a day.
//
// That is the correct failure. A quote refused is a customer told to come
// back; a quote priced off a stale number is a coin sold at yesterday's
// price, and on a 2% margin yesterday's price is the difference between a
// business and a donation.
//
// WHICH COINS, AND WHAT THEY ARE CALLED
//
// Neither is hardcoded. The assets come from crypto_assets where is_active,
// and each row carries price_feed_id — what the feed calls that coin. The
// feed says "bitcoin"; KobPay says "BTC". 047 already proved what happens
// when a provider's names and ours are treated as one namespace: every
// mobile money payout failed for weeks because GH_MTN was being sent to
// Paystack as a bank code.
//
// WHY IT REFUSES MORE OFTEN THAN IT ACCEPTS
//
// A wrong price is worse than no price. No price stops sales loudly; a wrong
// one sells coin at it, quietly, until the margin report says LOST MONEY. So
// a value is written only if the feed answered, the number is finite and
// positive, and it is within MAX_MOVE of what we already hold.

export const dynamic = "force-dynamic";

// Per run, not per day. At a one-minute cadence a 25% jump is a feed fault —
// a decimal point, a wrong denomination, a zero — far more often than it is
// the market. And on the rare occasion it is the market, refusing is still
// right: the price goes stale, quotes refuse, and nobody is sold a coin
// priced from the wrong side of a crash.
const MAX_MOVE = 0.25;

const PROVIDER = "https://api.coingecko.com/api/v3/simple/price";

type Outcome = {
  symbol: string;
  from: number | null;
  to: number | null;
  status: "updated" | "seeded" | "unchanged" | "rejected" | "missing";
  why?: string;
};

export async function GET(request: Request) {
  // Same gate as the FX cron. Without it this is a public button that
  // repoints the price every coin is sold at.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [{ data: assets, error: assetErr }, { data: held, error: heldErr }] =
    await Promise.all([
      supabaseAdmin
        .from("crypto_assets")
        .select("symbol, price_feed_id, is_active")
        .eq("is_active", true),
      supabaseAdmin.from("crypto_prices").select("symbol, usd_price"),
    ]);

  if (assetErr || heldErr) {
    console.error("crypto cron: cannot read assets or prices", assetErr ?? heldErr);
    return NextResponse.json({ error: "cannot read assets", updated: 0 }, { status: 500 });
  }

  const wanted = (assets ?? []).filter((a) => a.price_feed_id);
  const unnamed = (assets ?? []).filter((a) => !a.price_feed_id).map((a) => a.symbol);

  if (wanted.length === 0) {
    // Not an error. No coins are switched on yet, or none has a feed name,
    // and there is nothing for this job to do until somebody decides.
    return NextResponse.json({
      updated: 0,
      note:
        unnamed.length > 0
          ? `no active asset has a price_feed_id (${unnamed.join(", ")})`
          : "no active assets",
      at: new Date().toISOString(),
    });
  }

  const ids = wanted.map((a) => String(a.price_feed_id)).join(",");
  const url = `${PROVIDER}?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;

  let payload: Record<string, { usd?: number }>;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `price provider returned ${res.status}`, updated: 0 },
        { status: 502 },
      );
    }
    payload = await res.json();
  } catch (err) {
    console.error("crypto cron: provider unreachable", err);
    return NextResponse.json(
      { error: "price provider unreachable", updated: 0 },
      { status: 502 },
    );
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
          symbol,
          from: prev,
          to: next,
          status: "rejected",
          why: `moved ${(move * 100).toFixed(1)}% in one run — kept the old price`,
        });
        continue;
      }
      // A price that has not moved still needs its timestamp refreshed, or
      // crypto_price() will call it stale and stop every quote. This is the
      // one place this job differs from the FX one, which skips a no-op
      // write to keep its history readable. Here the write IS the liveness
      // signal.
      if (move === 0) {
        const { error } = await supabaseAdmin.rpc("crypto_set_price", {
          p_symbol: symbol,
          p_usd_price: next,
          p_source: "coingecko",
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
      p_symbol: symbol,
      p_usd_price: next,
      p_source: "coingecko",
    });

    if (error) {
      outcomes.push({
        symbol,
        from: Number.isFinite(prev) ? prev : null,
        to: next,
        status: "rejected",
        why: error.message,
      });
      continue;
    }

    outcomes.push({
      symbol,
      from: Number.isFinite(prev) ? prev : null,
      to: next,
      status: Number.isFinite(prev) ? "updated" : "seeded",
    });
  }

  const problems = outcomes.filter(
    (o) => o.status === "rejected" || o.status === "missing",
  );

  // A rejection matters more here than in the FX job: the price is now
  // ageing toward ninety seconds, after which every crypto quote refuses.
  if (problems.length > 0) {
    console.error("crypto cron: prices not refreshed", problems);
  }

  return NextResponse.json({
    updated: outcomes.filter((o) => o.status === "updated").length,
    seeded: outcomes.filter((o) => o.status === "seeded").length,
    unchanged: outcomes.filter((o) => o.status === "unchanged").length,
    problems: problems.length,
    without_feed_id: unnamed,
    outcomes,
    at: new Date().toISOString(),
  });
}
