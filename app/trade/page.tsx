import { redirect } from "next/navigation";

// /trade showed a trading interface with no exchange, no order book and no
// database calls behind it. There is nothing to trade KPC against — it is
// pegged, which is the point — and the real "put money to work" feature is
// /invest, built on instruments with a named issuer.
//
// A redirect rather than a deletion: the path is in the wild, and landing
// somewhere useful beats a 404.
export default function TradePage() {
  redirect("/invest");
}
