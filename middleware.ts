import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ONE DEPLOYMENT, SEVERAL FRONT DOORS.
//
// agents.kobpay.app and app.kobpay.app are the same Next app. All this does
// is decide which page the ROOT of each host lands on:
//
//   agents.kobpay.app/   ->  /agent   (the till)
//   app.kobpay.app/      ->  /        (the customer app, unchanged)
//
// Everything else is left alone, so agents.kobpay.app/wallet still works and
// an agent can reach their own wallet without changing address.
//
// This is a routing decision, not a security one. /agent is gated by
// my_agent(), and agent_cash_in and redeem_cash_code both refuse a non-agent
// in the database. Landing on the till does not make anyone an agent.
//
// The matcher deliberately skips _next, api and anything with a file
// extension — rewriting those breaks assets and routes for no benefit.

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname } = req.nextUrl;

  if (pathname === "/" && (host === "agents.kobpay.app" || host.startsWith("agents."))) {
    const url = req.nextUrl.clone();
    url.pathname = "/agent";
    return NextResponse.rewrite(url);
  }

  // app.kobpay.app opens the wallet, not the marketing page. Somebody typing
  // the app subdomain wants their money, not a hero and a coin video — the
  // landing page belongs on kobpay.app and www.
  if (pathname === "/" && (host === "app.kobpay.app" || host.startsWith("app."))) {
    const url = req.nextUrl.clone();
    url.pathname = "/wallet";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
