import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuth } from "@/app/lib/supabaseServer";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

// ============================================================================
// WHAT THIS ROUTE USED TO GET WRONG
//
// Three things, in rising order of cost.
//
//   1. currency was the literal "GHS", twice. With NG_BANK live in
//      payout_rails, a Nigerian bank payout was described to Paystack as
//      Ghanaian cedis — rejected outright at recipient creation.
//
//   2. bank_code was whatever the page sent. 047 renamed the rail
//      identifiers (the old frontend constant said "MTN", the table says
//      "GH_MTN") and the page was updated while this route was not, so every
//      mobile money payout since has been sending Paystack an identifier it
//      has never heard of. It failed as a 502 carrying Paystack's message,
//      which reads like Paystack being down rather than us talking nonsense.
//      KobPay's name for a rail and the provider's name for it are two
//      namespaces; payout_rails.adapter_code holds the provider's.
//
//   3. The amount was never converted. KPC is pegged 1:1 to USD, and
//      Math.round(amount * 100) was handed to Paystack as subunits of the
//      recipient's currency. 100 KPC — a hundred dollars — was paid out as
//      GHS 100, about six. Every completed Ghanaian withdrawal underpaid by
//      roughly the cedi rate. fx_rate() has existed since 007 and refuses a
//      stale rate rather than guessing; it is now the only thing that prices
//      a payout.
//
// WHAT IS STILL MISSING, DELIBERATELY
//
// Nothing here debits the customer's KPC. There is no trigger on withdrawals
// and no function anywhere posts a cash-out to ledger_entries, so a paid
// withdrawal leaves the balance untouched and the same money can be withdrawn
// again. assert_withdrawable() below stops an overdraw against the recorded
// balance and respects card-top-up holds, but it cannot stop a repeat,
// because the balance it reads never moves.
//
// That gap is not fixed here on purpose: which accounts a cash-out moves
// between, which entry_type it posts, and what reverses when Paystack later
// marks the transfer failed are ledger decisions, not route decisions. Until
// they are made and written as a migration, this route should not be pointed
// at a live Paystack account.
// ============================================================================

type Rail = {
  code: string;
  country_name: string;
  label: string;
  kind: "mobile_money" | "bank" | "cash_agent";
  currency: string;
  adapter: string;
  adapter_code: string | null;
  destination_regex: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { accessToken, railCode, destination } = body;
    const amountKpc = Number(body.amountKpc);
    const bankCode: string | undefined = body.bankCode;

    if (!accessToken || !railCode || !destination) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }
    if (!Number.isFinite(amountKpc) || amountKpc <= 0) {
      return NextResponse.json({ error: "Enter an amount greater than zero" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const userId = authData.user.id;

    // ------------------------------------------------------------------
    // Is this amount actually theirs to take?
    //
    // The old check was `accounts.balance < amount`, which ignores holds.
    // 057 puts a hold on a card top-up until the chargeback window closes;
    // reading the raw balance let somebody top up by card, cash out
    // immediately and then dispute the card payment. assert_withdrawable()
    // is the function written for this and it raises with a message meant
    // to be read by the customer.
    // ------------------------------------------------------------------
    const { error: availError } = await supabaseAdmin.rpc("assert_withdrawable", {
      p_user: userId,
      p_amount: amountKpc,
    });
    if (availError) {
      return NextResponse.json({ error: availError.message }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // Which rail, and in what currency?
    //
    // Read before pricing because the rail is what names the currency, and
    // the gate below wants the amount already in that currency. Service role
    // reads past RLS, which is why this is a server route and not the
    // browser. Nothing from the request body reaches Paystack as policy —
    // only the destination the customer typed.
    // ------------------------------------------------------------------
    const { data: railRow, error: railError } = await supabaseAdmin
      .from("payout_rails")
      .select("code, country_name, label, kind, currency, adapter, adapter_code, destination_regex")
      .eq("code", railCode)
      .maybeSingle();

    if (railError || !railRow) {
      return NextResponse.json({ error: "We do not pay out that way yet" }, { status: 400 });
    }
    const rail = railRow as Rail;

    // Price it. USD is the peg and has no rate; everything else goes through
    // fx_rate(), which raises when the rate is missing or older than
    // fx_max_age_minutes. Refusing beats paying at a guess.
    let rate = 1;
    if (rail.currency !== "USD") {
      const { data: rateData, error: rateError } = await supabaseAdmin.rpc("fx_rate", {
        p_currency: rail.currency,
      });
      if (rateError || rateData == null) {
        return NextResponse.json(
          {
            error:
              rateError?.message ||
              `We cannot price a ${rail.currency} payout right now. Please try again shortly.`,
          },
          { status: 503 },
        );
      }
      rate = Number(rateData);
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json(
          { error: `We cannot price a ${rail.currency} payout right now. Please try again shortly.` },
          { status: 503 },
        );
      }
    }

    // Round once, here, and let everything downstream read this number. Two
    // roundings in two places is how a ledger stops matching a bank.
    const amountFiat = Math.round(amountKpc * rate * 100) / 100;

    // ------------------------------------------------------------------
    // The gate. 047 calls it the single source of truth for what is
    // payable, and until now the only caller was the page — which is to say
    // the client. Status, suspension and the rail's own minimum and maximum
    // are enforced here, in the rail's currency, where its limits are
    // written.
    // ------------------------------------------------------------------
    const { error: gateError } = await supabaseAdmin.rpc("assert_rail_payable", {
      p_code: rail.code,
      p_amount: amountFiat,
    });
    if (gateError) {
      return NextResponse.json({ error: gateError.message }, { status: 400 });
    }

    if (rail.adapter !== "paystack") {
      // An honest refusal. A manual rail is settled by a person and an
      // mpesa rail needs Daraja; sending either to Paystack would fail in a
      // way that looks like Paystack's fault.
      return NextResponse.json(
        { error: `${rail.label} in ${rail.country_name} is not settled automatically yet.` },
        { status: 400 },
      );
    }

    // Check the destination before spending a payout attempt on something
    // that was never going to work. The pattern comes from the rail's row,
    // so a new market brings its own number format. A bad pattern in the
    // table must not block a real payout.
    const cleaned = String(destination).replace(/\s/g, "");
    if (rail.destination_regex) {
      let valid = true;
      try {
        valid = new RegExp(rail.destination_regex).test(cleaned);
      } catch {
        valid = true;
      }
      if (!valid) {
        return NextResponse.json(
          { error: `That does not look like a ${rail.label} destination. Please check it.` },
          { status: 400 },
        );
      }
    }

    // What Paystack calls this rail. For mobile money the provider code is
    // policy and comes from the rail; for a bank it is the customer's own
    // bank, which only they know.
    let paystackBankCode: string;
    if (rail.kind === "mobile_money") {
      if (!rail.adapter_code) {
        console.error(`payout_rails.${rail.code} has no adapter_code; refusing to guess one`);
        return NextResponse.json(
          { error: `${rail.label} payouts are not switched on yet. Please choose another way to be paid.` },
          { status: 503 },
        );
      }
      paystackBankCode = rail.adapter_code;
    } else {
      if (!bankCode) {
        return NextResponse.json({ error: "Enter your bank code" }, { status: 400 });
      }
      paystackBankCode = String(bankCode);
    }

    const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: rail.kind === "mobile_money" ? "mobile_money" : "nuban",
        name: authData.user.phone || "KobPay User",
        account_number: cleaned,
        bank_code: paystackBankCode,
        currency: rail.currency,
      }),
    });
    const recipientData = await recipientRes.json();

    if (!recipientData.status) {
      return NextResponse.json(
        { error: recipientData.message || "Failed to create payout recipient" },
        { status: 502 },
      );
    }

    const recipientCode = recipientData.data.recipient_code;

    const transferRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        // Subunits of rail.currency. Every currency Paystack settles is
        // two-decimal; a zero-decimal one would need this to change, which
        // is why the currency is named right here next to it.
        amount: Math.round(amountFiat * 100),
        currency: rail.currency,
        recipient: recipientCode,
        reason: "KobPay KPC cash-out",
      }),
    });
    const transferData = await transferRes.json();

    if (!transferData.status) {
      return NextResponse.json(
        { error: transferData.message || "Failed to initiate transfer" },
        { status: 502 },
      );
    }

    // Record what actually happened, not what we wish had. The old row said
    // USD at a rate of 1.0 while Paystack had been handed cedis, so the
    // books and the bank disagreed on every single payout.
    const { error: withdrawalError } = await supabaseAdmin.from("withdrawals").insert({
      user_id: userId,
      amount_kpc: amountKpc,
      amount_fiat: amountFiat,
      fiat_currency: rail.currency,
      exchange_rate: rate,
      payment_method: "paystack",
      external_reference: transferData.data.transfer_code,
      status: "pending",
    });

    if (withdrawalError) throw withdrawalError;

    return NextResponse.json({
      success: true,
      transferCode: transferData.data.transfer_code,
      amountKpc,
      amountFiat,
      currency: rail.currency,
    });
  } catch (error) {
    console.error("Withdrawal initialization error:", error);
    return NextResponse.json({ error: "Failed to initialize withdrawal" }, { status: 500 });
  }
}
