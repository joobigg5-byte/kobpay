// Supabase clients for the bills layer, matching the pattern already used in
// app/api/vault/deposit/route.ts: a service-role client for writes, an anon
// client purely to turn an accessToken into a user.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null

/** Service role. Bypasses RLS. Never import this into anything that runs in
 *  the browser — it is a full-access key. */
export function admin(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service-role environment is not configured')
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _admin
}

/** Verify a caller's access token and return their user id, or null. */
export async function userFromToken(accessToken?: string | null): Promise<string | null> {
  if (!accessToken) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase public environment is not configured')
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data?.user) return null
  return data.user.id
}

/** A client that acts AS the caller, so RLS and auth.uid() apply. This is what
 *  calls start_bill_payment: the function reads auth.uid() to know whose wallet
 *  to debit, and it must be the caller's, never the service role's. */
export function asUser(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/** Shared guard for the cron routes. Vercel Cron sends the bearer itself. */
export function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}
