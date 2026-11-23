import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseServer";

// The one address the apps POST to.
//
// Sixteen WittyHub apps are built and switched off waiting on this. Their
// client (engine/kobpay.js) is already written to this exact shape, so this
// matches it rather than the other way round:
//
//   POST  { "method": "...", "params": { ... } }
//   x-kobpay-key        the app's key
//   x-kobpay-timestamp  unix seconds
//   x-kobpay-signature  HMAC-SHA256 hex of timestamp + "." + body
//
//   success  { "ok": true,  "result": { ... } }
//   refusal  { "ok": false, "error": { "code": "...", "message": "..." } }
//
// 4xx means never retry. 5xx and 429 mean try again — the apps retry twice.
//
// WHERE THE SIGNATURE IS CHECKED, AND WHY NOT HERE
//
// Verifying an HMAC needs the secret itself; a hash cannot do it. Rather
// than ship sixteen live signing secrets into this process's memory on every
// request, verify_app_signature() does the work inside Postgres and returns
// an app id. The secret is never selected and never crosses the wire.
//
// THE RAW BODY MATTERS
//
// The signature covers the bytes the app sent. Parsing to JSON and
// re-serialising reorders keys and drops whitespace, so the text read here
// is what gets verified, and only then is it parsed.
//
// WHAT IS NOT SERVED YET
//
// create_topup. It identifies the person from their signed-in session rather
// than from a user_ref, so there is nothing for a server-to-server call to
// pass. Serving it needs a key-scoped version that takes user_ref and a
// return_url, which does not exist. It is left out rather than wired to
// something that would fail at the first real call.

export const dynamic = "force-dynamic";

// Only what is deliberately exposed. A method missing from here cannot be
// reached, which is the point: the gateway must not become a way to call
// anything in the schema that happens to be named kobpay_*.
//
// Each entry says how to turn the app's params into the function's
// arguments. The api key is passed through even though the signature has
// already proved it: the functions check it themselves, and two checks that
// agree cost nothing.
type Handler = (p: Record<string, unknown>, apiKey: string) => Record<string, unknown>;

const METHODS: Record<string, { fn: string; args: Handler }> = {
  kobpay_get_balance: {
    fn: "kobpay_get_balance",
    args: (p, k) => ({ p_api_key: k, p_user_id: p.user_ref ?? p.user_id }),
  },
  kobpay_charge: {
    fn: "kobpay_charge",
    args: (p, k) => ({
      p_api_key: k,
      p_user_id: p.user_ref ?? p.user_id,
      p_amount: p.amount,
      p_reason: p.reason ?? null,
      p_idempotency_key: p.idempotency_key ?? null,
    }),
  },
  kobpay_charge_split: {
    fn: "kobpay_charge_split",
    args: (p, k) => ({
      p_api_key: k,
      p_user_ref: p.user_ref,
      // Always an array. A single recipient sent bare is the most likely
      // mistake a caller will make here, so it is accepted and wrapped
      // rather than refused on a technicality.
      p_to_user_refs: Array.isArray(p.to_user_refs)
        ? p.to_user_refs
        : p.to_user_ref
          ? [p.to_user_ref]
          : [],
      p_amount: p.amount,
      p_currency: p.currency ?? "KPC",
      p_reason: p.reason ?? null,
      p_ref: p.ref ?? null,
      p_idempotency_key: p.idempotency_key ?? null,
      p_meta: p.meta ?? null,
    }),
  },
  kobpay_payout: {
    fn: "kobpay_payout",
    args: (p, k) => ({
      p_api_key: k,
      p_user_id: p.user_ref ?? p.user_id,
      p_amount: p.amount,
      p_reason: p.reason ?? null,
      p_idempotency_key: p.idempotency_key ?? null,
    }),
  },
  kobpay_send_abroad: {
    fn: "kobpay_send_abroad",
    args: (p, k) => ({
      p_api_key: k,
      p_user_ref: p.user_ref,
      p_amount_kpc: p.amount,
      p_rail_code: p.rail_code,
      p_destination: p.destination,
      p_recipient_name: p.recipient_name ?? null,
      p_bank_code: p.bank_code ?? null,
      p_reason: p.reason ?? null,
      p_idempotency_key: p.idempotency_key ?? null,
    }),
  },
  kobpay_remittance_quote: {
    fn: "kobpay_remittance_quote",
    args: (p, k) => ({
      p_api_key: k,
      p_amount_kpc: p.amount,
      p_rail_code: p.rail_code,
    }),
  },
  kobpay_crypto_quote: {
    fn: "kobpay_crypto_quote",
    args: (p, k) => ({
      p_api_key: k,
      p_asset: p.asset,
      p_network: p.network,
      p_amount_kpc: p.amount,
    }),
  },
  kobpay_crypto_reserve: {
    fn: "kobpay_crypto_reserve",
    args: (p, k) => ({
      p_api_key: k,
      p_user_ref: p.user_ref,
      p_asset: p.asset,
      p_network: p.network,
      p_address: p.address,
      p_amount_kpc: p.amount,
      p_idempotency_key: p.idempotency_key ?? null,
    }),
  },
};

// A business refusal is not a server fault, and the app must be able to tell
// one reason from another without reading English.
//
// This matches on the message, which is fragile, and it is the wrong place
// for the knowledge: the right fix is for the money functions to RAISE with
// their own SQLSTATE, so the code travels with the error instead of being
// guessed at the edge. Until they do, this keeps the contract the apps were
// promised.
function codeFor(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("available") || m.includes("insufficient")) return "insufficient_funds";
  if (m.includes("not authorized") || m.includes("has not authorized")) return "not_authorized";
  if (m.includes("invalid api key")) return "unauthorized";
  if (m.includes("under 18") || m.includes("age")) return "age_restricted";
  if (m.includes("smallest") || m.includes("largest")) return "amount_out_of_range";
  if (m.includes("already")) return "already_processed";
  return "rejected";
}

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-kobpay-key");
  const timestamp = request.headers.get("x-kobpay-timestamp");
  const signature = request.headers.get("x-kobpay-signature");

  // Read the bytes as sent. Everything about the signature depends on this
  // not being reconstructed.
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail("bad_request", "Could not read the request body.", 400);
  }

  if (!apiKey || !timestamp || !signature) {
    return fail(
      "unauthorized",
      "Send x-kobpay-key, x-kobpay-timestamp and x-kobpay-signature.",
      401,
    );
  }

  const { data: appId, error: sigError } = await supabaseAdmin.rpc(
    "verify_app_signature",
    {
      p_api_key: apiKey,
      p_timestamp: timestamp,
      p_body: raw,
      p_signature: signature,
    },
  );

  if (sigError || !appId) {
    // Deliberately the same answer for an unknown key, a wrong signature and
    // a stale timestamp. The difference is only useful to somebody guessing.
    return fail("unauthorized", sigError?.message ?? "Signature rejected.", 401);
  }

  let parsed: { method?: string; params?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return fail("bad_request", "Body is not valid JSON.", 400);
  }

  const method = parsed.method;
  const params = parsed.params ?? {};

  if (!method || !METHODS[method]) {
    return fail(
      "unknown_method",
      `No method "${method ?? ""}". Available: ${Object.keys(METHODS).join(", ")}.`,
      400,
    );
  }

  const idemKey =
    typeof params.idempotency_key === "string" ? params.idempotency_key : null;

  // Claim before the work, so a retry arriving mid-flight cannot run beside
  // the original.
  const { data: claim, error: claimError } = await supabaseAdmin.rpc("gateway_claim", {
    p_app_id: appId,
    p_idempotency_key: idemKey,
    p_method: method,
    p_body: raw,
  });

  if (claimError) {
    return fail("server_error", "Could not record the request.", 500);
  }

  const c = claim as {
    claimed: boolean;
    replayed?: boolean;
    in_flight?: boolean;
    conflict?: boolean;
    response?: unknown;
    http_status?: number;
    error?: { code: string; message: string };
  };

  if (!c.claimed) {
    if (c.replayed) {
      // The same answer as the first time, and no work done.
      return NextResponse.json(c.response, { status: c.http_status ?? 200 });
    }
    if (c.in_flight) {
      // Retryable, so 429 rather than a 4xx the apps would give up on.
      return fail(
        c.error?.code ?? "in_progress",
        c.error?.message ?? "Still processing.",
        429,
      );
    }
    return fail(
      c.error?.code ?? "conflict",
      c.error?.message ?? "Conflicting request.",
      409,
    );
  }

  const spec = METHODS[method];
  let body: unknown;
  let status: number;

  const { data, error } = await supabaseAdmin.rpc(spec.fn, spec.args(params, apiKey));

  if (error) {
    // 42883 is "function does not exist" — the schema is behind the gateway,
    // which is ours to fix and worth a 5xx so the app retries after a deploy
    // rather than treating it as its own bad request.
    const serverSide = error.code === "42883" || error.code === "42501";
    status = serverSide ? 502 : 400;
    body = {
      ok: false,
      error: {
        code: serverSide ? "server_error" : codeFor(error.message ?? ""),
        message: error.message ?? "Rejected.",
      },
    };
  } else {
    status = 200;
    body = { ok: true, result: data };
  }

  if (idemKey) {
    // Recorded whether it succeeded or failed: a refusal replayed as a
    // refusal is still the same answer, and re-running a charge that was
    // already refused for a good reason helps nobody.
    await supabaseAdmin.rpc("gateway_finish", {
      p_app_id: appId,
      p_idempotency_key: idemKey,
      p_response: body,
      p_http_status: status,
    });
  }

  return NextResponse.json(body, { status });
}

// A GET here is somebody checking the address is alive, or a browser that
// followed a link. Say what this is without implying it can be used.
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "method_not_allowed",
        message:
          "POST a signed {method, params} body. See x-kobpay-key, " +
          "x-kobpay-timestamp and x-kobpay-signature.",
      },
    },
    { status: 405 },
  );
}
