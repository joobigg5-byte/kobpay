import { NextResponse } from "next/server";
import { deliverQueuedWebhooks } from "@/app/lib/webhooks";

// The webhook sweeper.
//
// WHAT THIS IS AND IS NOT
//
// It is the safety net. It is NOT how apps hear about things quickly — the
// gateway kicks a delivery pass after every call, so a webhook normally
// goes out within a second of the money moving.
//
// This exists for what that misses: a delivery that failed and is waiting
// on its backoff, an app that was down, and anything queued by something
// other than a gateway call.
//
// Vercel's cron floor is once a day on Hobby and once a minute on Pro. On
// Hobby a failed delivery waits a day for its retry, which for a payment
// notification is the same as not retrying. If webhooks matter, this is one
// of the reasons to be on Pro.
//
// The delivery logic lives in app/lib/webhooks.ts, shared with the gateway,
// so the two cannot drift.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await deliverQueuedWebhooks(20);

  return NextResponse.json({
    claimed: results.length,
    delivered: results.filter((r) => r.ok).length,
    results,
    at: new Date().toISOString(),
  });
}
