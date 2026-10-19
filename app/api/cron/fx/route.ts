import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseServer";

// Daily FX refresh.
//
// WHY THIS EXISTS
//
// fx_rate() fails closed: past price_max_age it raises rather than guessing.
// That is the right design, but it means a rate nobody refreshes does not
// degrade — it stops payments in that currency outright. Until now nothing
// refreshed anything. The GHS rate was set by hand and was counting down.
//
// WHY A BAD RATE IS WORSE THAN A STALE ONE
//
// A stale rate stops payments, loudly. A WRONG rate prices every payment
// wrongly, silently, until somebody notices the money does not add up. So
// this refuses more often than it accepts:
//
//   - the provider must say it succeeded
//   - the rate must be a finite number greater than zero
//   - it must be within MAX_MOVE of the rate we already hold
//
// A currency that fails any of those keeps its old rate and is reported. If
// the old rate then goes stale, payments stop — which is the correct failure,
// because at that point we genuinely do not know the price.

export const dynamic = "force-dynamic";

// A real currency can move several percent in a day. It does not move 25%
// without something being wrong with either the country or the feed, and
// this cannot tell which — so it stops and asks for a human.
const MAX_MOVE = 0.25;

const PROVIDER = "https://open.er-api.com/v6/latest/USD";

type Outcome = {
  code: string;
  from: number | null;
  to: number | null;
  status: "updated" | "seeded" | "unchanged" | "rejected" | "missing";
  why?: string;
};

export async function GET(request: Request) {
  // Vercel Cron sends this header when CRON_SECRET is set. Without the check
  // the endpoint is a public button that repoints every exchange rate.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: { result?: string; rates?: Record<string, number> };
  try {
    const res = await fetch(PROVIDER, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `rate provider returned ${res.status}`, updated: 0 },
        { status: 502 },
      );
    }
    payload = await res.json();
  } catch (err) {
    console.error("fx cron: provider unreachable", err);
    return NextResponse.json({ error: "rate provider unreachable", updated: 0 }, { status: 502 });
  }

  if (payload.result && payload.result !== "success") {
    return NextResponse.json({ error: `provider said ${payload.result}`, updated: 0 }, { status: 502 });
  }
  const rates = payload.rates;
  if (!rates || typeof rates !== "object") {
    return NextResponse.json({ error: "provider returned no rates", updated: 0 }, { status: 502 });
  }

  // EVERY currency on the books, not just the switched-on ones.
  //
  // This used to intersect fx_rates with the active currencies, on the
  // reasoning that writing rates for currencies nothing can be charged in
  // widens the blast radius of a bad feed for no benefit. The benefit turned
  // out to be the whole product. That filter was a closed loop:
  //
  //   a currency with no rate was never refreshed, so it never got a rate
  //   fx_rate() raises for a switched-off currency, so it could not be
  //   switched on until it had one
  //
  // Ninety-four currencies sat in the table unable to escape it, and the
  // landing page printed "Currencies: 1" under "Send Globally" as a result.
  //
  // The blast-radius worry is still answered, just not by this filter: a
  // rate only decides what KobPay can quote, hold and send. Taking money in
  // additionally needs an active payment provider carrying the code
  // (chargeable_currencies), and widening rates does not add one.
  const [{ data: held, error: heldErr }, { data: known, error: knownErr }] = await Promise.all([
    supabaseAdmin.from("fx_rates").select("currency, units_per_usd"),
    supabaseAdmin.from("currencies").select("code, active"),
  ]);

  if (heldErr || knownErr) {
    console.error("fx cron: cannot read current rates", heldErr ?? knownErr);
    return NextResponse.json({ error: "cannot read current rates", updated: 0 }, { status: 500 });
  }

  const prevByCode = new Map(
    (held ?? []).map((r) => [String(r.currency), Number(r.units_per_usd)]),
  );

  const outcomes: Outcome[] = [];

  for (const row of known ?? []) {
    const code = String(row.code);

    // USD is the peg, not a quote. Nothing to refresh.
    if (code === "USD") continue;

    const next = Number(rates[code]);
    const prev = prevByCode.has(code) ? Number(prevByCode.get(code)) : NaN;

    if (!Number.isFinite(next) || next <= 0) {
      outcomes.push({
        code,
        from: Number.isFinite(prev) ? prev : null,
        to: null,
        status: "missing",
        why: "provider has no usable rate",
      });
      continue;
    }

    if (Number.isFinite(prev) && prev > 0) {
      const move = Math.abs(next - prev) / prev;
      if (move > MAX_MOVE) {
        outcomes.push({
          code,
          from: prev,
          to: next,
          status: "rejected",
          why: `moved ${(move * 100).toFixed(1)}% — kept the old rate`,
        });
        continue;
      }
      // Writing an identical rate every day buries real changes in history.
      if (move === 0) {
        outcomes.push({ code, from: prev, to: next, status: "unchanged" });
        continue;
      }
    }

    const { error } = await supabaseAdmin.rpc("fx_set_rate", {
      p_currency: code,
      p_units_per_usd: next,
      p_source: "open.er-api.com daily",
    });

    if (error) {
      outcomes.push({
        code,
        from: Number.isFinite(prev) ? prev : null,
        to: next,
        status: "rejected",
        why: error.message,
      });
      continue;
    }
    outcomes.push({
      code,
      from: Number.isFinite(prev) ? prev : null,
      to: next,
      // A currency getting its first rate is worth telling apart from one
      // being refreshed: it is a currency entering the product.
      status: Number.isFinite(prev) ? "updated" : "seeded",
    });
  }

  // Now that rates exist, switch on whatever has become usable. Holding and
  // pricing only — chargeable_currencies() still gates taking money in. (035)
  let activated: unknown = null;
  const { data: act, error: actErr } = await supabaseAdmin.rpc("activate_priced_currencies");
  if (actErr) {
    console.error("fx cron: could not activate priced currencies", actErr);
  } else {
    activated = act;
  }

  const updated = outcomes.filter((o) => o.status === "updated").length;
  const seeded = outcomes.filter((o) => o.status === "seeded").length;
  const problems = outcomes.filter((o) => o.status === "rejected" || o.status === "missing");

  // Rejections are the interesting case: the rate is now ageing toward the
  // point where it stops payments, and only a human can decide why the feed
  // disagreed with us.
  if (problems.length > 0) {
    console.error("fx cron: rates not refreshed", problems);
  }

  return NextResponse.json({
    updated,
    seeded,
    activated,
    problems: problems.length,
    outcomes,
    at: new Date().toISOString(),
  });
}
