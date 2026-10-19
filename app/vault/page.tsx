import { redirect } from "next/navigation";

// /vault offered yield on deposits with nothing behind it. The real version
// of that promise is /savings, where the rate is bounded by what the reserve
// actually earns (023) and the money is tracked in the ledger.
export default function VaultPage() {
  redirect("/savings");
}
