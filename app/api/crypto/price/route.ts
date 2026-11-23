import { NextResponse } from "next/server";
import { pricesAreStale, refreshCryptoPrices, STALE_AFTER_MS } from "@/app/lib/cryptoPrices";

// Top the price up on demand, so a quote never depends on a cron having run.
//
// The Buy Crypto page calls this before it asks for a quote. crypto_price()
// refuses anything older than ninety seconds, and Vercel's cron floor is
// once a day on Hobby and once a minute on Pro — so hanging crypto on the
// schedule meant the page was permanently dark on one plan and one missed
// run from dark on the other.
//
// WHY THIS IS OPEN WHEN THE CRON IS NOT
//
// The cron always acts, so it is gated on CRON_SECRET — without that it
// would be a public button that repoints the price every coin is sold at.
// This one only acts when a price is already near expiry, and writes the
// same number from the same feed that the cron would have written a moment
// later. The thing worth protecting is not the write, it is the upstream
// call: a loop hitting this could burn the provider's rate limit and leave
// every price stale, which is the outage it exists to prevent.
//
// So: a stale check before anything upstream, a floor between real calls,
// and one shared promise so a burst of page loads produces one fetch rather
// than one each. All three are per-instance — serverless means several
// containers each keep their own — which is best-effort by design. It turns
// a thousand requests into a handful of upstream calls, not into one, and a
// handful is well inside what the feed allows.

export const dynamic = "force-dynamic";

// Never go upstream more often than this, however many quotes arrive.
const FLOOR_MS = 20_000;

let lastAttempt = 0;
let inFlight: Promise<{ status: number }> | null = null;

export async function POST() {
  let stale: boolean;
  try {
    stale = await pricesAreStale();
  } catch (err) {
    console.error("crypto price: cannot tell whether prices are stale", err);
    // Say so rather than refusing. The quote that follows will be refused by
    // the database if the price really is too old, which is the check that
    // matters; this route failing must not be the thing that stops a sale.
    return NextResponse.json(
      { refreshed: false, reason: "could not check freshness" },
      { status: 200 },
    );
  }

  if (!stale) {
    return NextResponse.json({ refreshed: false, reason: "prices are fresh" });
  }

  const now = Date.now();

  // Somebody else's call is already fetching. Wait for it rather than
  // starting a second one — the whole point is that a burst of page loads
  // costs one upstream call.
  if (inFlight) {
    await inFlight;
    return NextResponse.json({ refreshed: true, reason: "joined a refresh already running" });
  }

  if (now - lastAttempt < FLOOR_MS) {
    return NextResponse.json({
      refreshed: false,
      reason: "refreshed moments ago",
      // Stale but inside the floor means the last attempt failed. The quote
      // will refuse, and that is the correct outcome — better than selling a
      // coin priced off a number nobody can vouch for.
      note: `prices go stale after ${Math.round(STALE_AFTER_MS / 1000)}s`,
    });
  }

  lastAttempt = now;
  const work = refreshCryptoPrices().then((r) => ({ status: r.status }));
  inFlight = work;

  try {
    const result = await work;
    return NextResponse.json(
      { refreshed: result.status === 200, reason: "refreshed" },
      { status: 200 },
    );
  } catch (err) {
    console.error("crypto price: refresh threw", err);
    return NextResponse.json(
      { refreshed: false, reason: "refresh failed" },
      { status: 200 },
    );
  } finally {
    inFlight = null;
  }
}

// A GET here is somebody checking the endpoint is alive. Say what it is
// without implying it can be used to force a refresh.
export async function GET() {
  return NextResponse.json({
    ok: true,
    note: "POST to top up crypto prices when they are near expiry.",
  });
}
