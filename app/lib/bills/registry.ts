import { type BillProvider } from './types'
import { reloadly } from './providers/reloadly'
import { hubtel } from './providers/hubtel'
import { flutterwave } from './providers/flutterwave'

const PROVIDERS: Record<string, BillProvider> = {
  reloadly,
  hubtel,
  flutterwave,
}

export function provider(id: string): BillProvider {
  const p = PROVIDERS[id]
  if (!p) throw new Error(`No adapter for provider "${id}"`)
  return p
}

export function providerIds(): string[] {
  return Object.keys(PROVIDERS)
}
