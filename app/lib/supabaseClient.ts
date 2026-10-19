import { createClient } from '@supabase/supabase-js';
import { askForPin } from './pinBridge';

const supabaseUrl = "https://kkkswdnelmuwxzshowgy.supabase.co";
const supabaseAnonKey = "sb_publishable_MUaHd8aC0bBQ3YKAmhTM3Q_Ld6S6bUA";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- PIN interception -------------------------------------------------------
//
// 026 raises PIN_REQUIRED from record_ledger_transaction whenever a signed-in
// person spends from their own wallet without a recent PIN confirmation. That
// error can surface from any of a dozen RPCs, and will surface from ones not
// written yet.
//
// Rather than teach every page to catch it, rpc() is wrapped once here: on
// PIN_REQUIRED it raises the prompt, waits, and retries the identical call.
// Pages stay unaware a PIN exists.
//
// confirm_pin is excluded for the obvious reason, and the retry happens only
// once — a second PIN_REQUIRED means the confirmation did not take, and
// looping would just reopen the prompt forever.

const rawRpc = supabase.rpc.bind(supabase);

// The generic signature of rpc() is built from the database types, which are
// not generated in this project; re-expressing it faithfully is not possible,
// so the wrapper is typed loosely and the behaviour is kept identical.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(supabase as any).rpc = async (fn: string, args?: unknown, opts?: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first = await (rawRpc as any)(fn, args, opts);

  const needsPin =
    first?.error &&
    typeof first.error.message === "string" &&
    first.error.message.includes("PIN_REQUIRED") &&
    fn !== "confirm_pin" &&
    fn !== "set_transaction_pin";

  if (!needsPin) return first;

  const confirmed = await askForPin();
  if (!confirmed) return first;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (rawRpc as any)(fn, args, opts);
};
