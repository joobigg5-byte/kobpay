// Card number handling that runs ONLY in the browser.
//
// Nothing here may be called from a route handler, a server component or a
// server action. The moment a card number reaches KobPay's backend, every
// system it touches is in PCI DSS scope — an annual audit with a
// questionnaire, scans and evidence, not a checkbox. Keeping the number in
// the customer's own browser and sending a token instead is what keeps that
// off the table, and it is cheaper than any amount of care afterwards.
//
// So the job of this file is small and strictly local: tell the customer
// their number is mistyped before they wait on a provider to say so, and
// show the right card logo. The number itself goes straight from the input
// into the provider's tokenizer and nowhere else.
//
// WHAT A LUHN CHECK IS NOT
//
// It is a typo detector, nothing more. It catches a wrong digit and two
// adjacent digits swapped, which is most of what people do wrong. It does
// NOT mean the card exists, that it has money on it, or that it can receive
// a payout. Only the provider knows those, and only at the moment of
// sending.

export type CardNetwork =
  | "visa" | "mastercard" | "amex" | "discover"
  | "diners" | "jcb" | "unionpay" | "maestro" | "unknown";

type Rule = { network: CardNetwork; label: string; test: RegExp; lengths: number[] };

// Issuer identification numbers, longest-prefix first so Maestro's broad
// ranges cannot swallow a Mastercard.
const RULES: Rule[] = [
  { network: "amex",       label: "American Express", test: /^3[47]/,                     lengths: [15] },
  { network: "diners",     label: "Diners Club",      test: /^3(?:0[0-5]|[68])/,          lengths: [14, 16, 19] },
  { network: "jcb",        label: "JCB",              test: /^35(?:2[89]|[3-8])/,         lengths: [16, 17, 18, 19] },
  { network: "unionpay",   label: "UnionPay",         test: /^62/,                        lengths: [16, 17, 18, 19] },
  { network: "visa",       label: "Visa",             test: /^4/,                         lengths: [13, 16, 19] },
  { network: "mastercard", label: "Mastercard",       test: /^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/, lengths: [16] },
  { network: "maestro",    label: "Maestro",          test: /^(5018|5020|5038|6304|6759|676[1-3])/, lengths: [12,13,14,15,16,17,18,19] },
  { network: "discover",   label: "Discover",         test: /^(6011|65|64[4-9])/,         lengths: [16, 19] },
];

export function digitsOf(input: string): string {
  return (input ?? "").replace(/[^0-9]/g, "");
}

export function networkOf(input: string): { network: CardNetwork; label: string } {
  const d = digitsOf(input);
  for (const r of RULES) if (r.test.test(d)) return { network: r.network, label: r.label };
  return { network: "unknown", label: "Card" };
}

/** Luhn. A typo detector — see the note at the top about what it does not prove. */
export function passesLuhn(input: string): boolean {
  const d = digitsOf(input);
  if (d.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export type CardCheck = {
  network: CardNetwork;
  label: string;
  complete: boolean;
  valid: boolean;
  /** Something to show the customer, or null while they are still typing. */
  problem: string | null;
};

/**
 * Checks as the customer types. Deliberately quiet until the number is long
 * enough to judge — telling someone their card is invalid when they have
 * entered four digits is noise, and they learn to ignore the message that
 * matters.
 */
export function checkCard(input: string): CardCheck {
  const d = digitsOf(input);
  const { network, label } = networkOf(d);
  const rule = RULES.find((r) => r.network === network);
  const lengths = rule?.lengths ?? [12, 13, 14, 15, 16, 17, 18, 19];
  const max = Math.max(...lengths);
  const complete = lengths.includes(d.length);

  if (d.length === 0) return { network, label, complete: false, valid: false, problem: null };
  if (d.length > max) {
    return { network, label, complete: false, valid: false,
      problem: `That is longer than a ${label} number.` };
  }
  if (!complete) {
    // Still typing. No complaint yet.
    return { network, label, complete: false, valid: false, problem: null };
  }
  if (!passesLuhn(d)) {
    return { network, label, complete: true, valid: false,
      problem: "Check that number — a digit looks wrong." };
  }
  return { network, label, complete: true, valid: true, problem: null };
}

/**
 * Groups digits the way the card itself is printed, so the customer can
 * check what they typed against what is in their hand. Amex and Diners
 * group differently and getting that wrong makes a correct number look
 * wrong.
 */
export function formatCardNumber(input: string): string {
  const d = digitsOf(input);
  const { network } = networkOf(d);
  // Grouped as the card is printed, so the customer can check what they
  // typed against what is in their hand. Amex is 4-6-5 and the 14-digit
  // Diners card is 4-6-4; the 16-digit one is in fours like everything
  // else, and grouping it 4-6-4 makes a correct number look wrong.
  const groups =
    network === "amex" ? [4, 6, 5]
    : network === "diners" && d.length <= 14 ? [4, 6, 4]
    : [4, 4, 4, 4, 3];

  const out: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= d.length) break;
    out.push(d.slice(i, i + g));
    i += g;
  }
  if (i < d.length) out.push(d.slice(i));
  return out.join(" ");
}

/**
 * All anyone but the tokenizer should ever see or store. Last four is enough
 * for a customer to recognise which card they used, and useless to anybody
 * else.
 */
export function lastFour(input: string): string {
  const d = digitsOf(input);
  return d.length >= 4 ? d.slice(-4) : "";
}
