import { NextResponse } from "next/server";
import { refreshCryptoPrices } from "@/app/lib/cryptoPrices";

// The scheduled price refresh.
//
// Same shape as the FX cron, different clock: fx runs daily against
// open.er-api.com because a currency peg does not move in an afternoon, and
// this runs as often as the schedule allows because crypto does.
//
// WHAT THIS IS NOW, AND WHAT IT IS NOT
//
// It is a warm cache. It is NOT what keeps crypto working. crypto_price()
// refuses anything older than ninety seconds, and Vercel's cron floor is
// once a day on Hobby and once a minute on Pro — so a design that depended
// on this job would be permanently dark on Hobby and one missed run from
// dark on Pro. The Buy Crypto page tops the price up itself through
// /api/crypto/price before it quotes. If this cron never runs, the first
// quote of a quiet period pays for one upstream call and everything still
// works.
//
// The logic lives in app/lib/cryptoPrices.ts, shared with that route, so the
// two cannot drift.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Without this it is a public button that repoints the price every coin is
  // sold at. The on-demand route is deliberately open, but it only acts when
  // a price is actually near expiry; this one always acts.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await refreshCryptoPrices();
  const { status, ...body } = result;

  return NextResponse.json({ ...body, at: new Date().toISOString() }, { status });
}
