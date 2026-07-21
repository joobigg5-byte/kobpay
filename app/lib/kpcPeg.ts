export const KPC_PEG_USD = 1.00;

export function formatKpcAsUsd(kpcAmount: number): string {
  const usd = kpcAmount * KPC_PEG_USD;
  return usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fiatToKpc(amountFiat: number, fiatCurrency: string, exchangeRateToUsd?: number): number {
  if (fiatCurrency === 'USD') {
    return amountFiat;
  }
  if (!exchangeRateToUsd) {
    throw new Error(
      `No exchange rate provided for ${fiatCurrency}->USD. ` +
      `Wire this to a real FX rate provider before accepting non-USD deposits.`
    );
  }
  return amountFiat * exchangeRateToUsd;
}