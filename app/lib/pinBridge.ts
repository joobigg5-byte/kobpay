// A one-slot bridge between "a database call needs a PIN" and "a prompt is on
// screen".
//
// The alternative was a React context every spending page has to import and
// call before every RPC — which is a dozen edits now and a forgotten one
// later, the same shape of problem the SQL side had. This keeps the knowledge
// in one place: supabaseClient wraps rpc(), and anything that comes back
// PIN_REQUIRED raises the prompt and retries once.

type Resolver = (confirmed: boolean) => void;

let pending: Resolver | null = null;

export const PIN_EVENT = "kobpay:pin-required";

/** Raise the prompt. Resolves true once the PIN is confirmed, false if cancelled. */
export function askForPin(): Promise<boolean> {
  // A second request while one is open would orphan the first promise and
  // leave that call hanging forever. Refuse rather than leak it.
  if (pending) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    pending = resolve;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(PIN_EVENT));
    } else {
      // No window means no prompt can appear; failing closed is correct.
      pending = null;
      resolve(false);
    }
  });
}

/** Called by the prompt when the person confirms or cancels. */
export function settlePin(confirmed: boolean) {
  const resolve = pending;
  pending = null;
  resolve?.(confirmed);
}
