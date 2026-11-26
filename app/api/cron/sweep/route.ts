import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseServer";

// The jobs that run on a clock rather than on a request.
//
// WHY THIS EXISTS
//
// release_due_safe_payments() and expire_disputes() were written, tested and
// never called. Nothing in the codebase referenced either of them. So a Safe
// Send would hold a buyer's money and the release window would pass with
// nobody acting on it — the money sits until a person runs the function by
// hand.
//
// That is the same shape of failure as the webhook queue: a complete piece
// of work with no process picking it up. Both were invisible because
// everything looks right in the database.
//
// ONE ROUTE, SEVERAL JOBS
//
// Vercel's Hobby plan allows a small number of cron entries, and these all
// want the same cadence anyway. Each job is called independently and a
// failure in one does not stop the others: an escrow release must not be
// skipped because dispute expiry had a bad day.
//
// A missing function is reported, not thrown. These names come from
// migrations applied at different times, and a sweep that dies on the first
// absent one would silently stop running the jobs that do exist.

export const dynamic = "force-dynamic";

const JOBS: { name: string; fn: string; why: string }[] = [
  {
    name: "safe payments",
    fn: "release_due_safe_payments",
    why: "Releases escrow whose window has passed. Without it a buyer's money is held indefinitely.",
  },
  {
    name: "disputes",
    fn: "expire_disputes",
    why: "Closes disputes nobody answered, so held funds resolve one way or the other.",
  },
  {
    name: "stuck gateway calls",
    fn: "gateway_release_stuck",
    why: "Frees idempotency claims from requests that died mid-flight, so a retry is not refused forever.",
  },
];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ran: Record<string, unknown>[] = [];

  for (const job of JOBS) {
    const { data, error } = await supabaseAdmin.rpc(job.fn);

    if (error) {
      // 42883 is "function does not exist" — that migration is not applied
      // here. Worth reporting plainly; not worth failing the sweep over.
      const missing = error.code === "42883";
      if (!missing) console.error(`sweep: ${job.fn} failed`, error);
      ran.push({
        job: job.name,
        ok: false,
        [missing ? "not_installed" : "error"]: missing
          ? `${job.fn}() does not exist in this database`
          : error.message,
      });
      continue;
    }

    ran.push({ job: job.name, ok: true, result: data ?? null });
  }

  return NextResponse.json({
    ran,
    at: new Date().toISOString(),
    note: ran.some((r) => r.ok === false)
      ? "Something did not run. Each line says which and why."
      : undefined,
  });
}
