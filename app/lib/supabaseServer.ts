// Server-side Supabase clients, built on first use rather than at import time.
//
// WHY THIS FILE EXISTS
//
// Every API route used to do this at the top of the module:
//
//   const supabaseAdmin = createClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.SUPABASE_SERVICE_ROLE_KEY!
//   );
//
// `next build` imports every route module during "Collecting page data", so
// that line runs at BUILD time, not at request time. If the variable is not
// present in the build environment, createClient throws "supabaseUrl is
// required" and the whole build fails - naming a route nobody touched, for a
// reason unrelated to the commit.
//
// That is what killed the kpc-upgrade preview build: the variables existed but
// were scoped to Production, the preview build got none of them, and
// /api/apps/payout brought the deployment down.
//
// The `!` suffix made it worse. It told TypeScript the values were definitely
// there, so the compiler never raised the question that the build then
// answered the hard way.
//
// HOW THIS FIXES IT
//
// Each export is a Proxy. Nothing is constructed until a property is read, and
// that only happens inside a request handler. Call sites are unchanged -
// supabaseAdmin.from("accounts") reads exactly as before - so each route needs
// only its header replaced, with no behavioural difference at runtime.
//
// If a variable really is missing, the failure now arrives at request time,
// names the variable, and affects one endpoint instead of every deployment.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Add it in Vercel -> Settings -> Environment ` +
        `Variables, enable it for every environment you deploy to ` +
        `(Production, Preview, Development), then redeploy.`,
    );
  }
  return value;
}

/** Builds on first property access, then reuses that one instance. */
function lazy<T extends object>(make: () => T): T {
  let instance: T | null = null;
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      instance ??= make();
      const value = Reflect.get(instance as object, prop, receiver);
      // Methods must keep their `this`, or supabase-js loses its internals.
      return typeof value === "function" ? value.bind(instance) : value;
    },
    has(_target, prop) {
      instance ??= make();
      return prop in (instance as object);
    },
  });
}

/**
 * Service role. Bypasses RLS and is the only identity that may call
 * record_ledger_transaction (004 revoked it from anon and authenticated).
 * Server only - this key must never reach a browser bundle.
 */
export const supabaseAdmin: SupabaseClient = lazy(() =>
  createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
);

/**
 * Anon key, used only to turn a caller's access token into a verified user
 * via supabaseAuth.auth.getUser(token).
 */
export const supabaseAuth: SupabaseClient = lazy(() =>
  createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
);

/**
 * A client that acts AS the caller, so RLS applies and auth.uid() is them.
 * Anything calling a function that checks auth.uid() needs this rather than
 * supabaseAdmin - the savings functions, for instance, where the service role
 * would be the wrong identity entirely.
 */
export function supabaseAs(accessToken: string): SupabaseClient {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );
}
