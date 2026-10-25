/** All money is handled as integer cents. The model returns plain numbers; code converts and does every sum. */

export function toCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** Percentage of an amount in cents, rounded half up to the cent. rate is a percent, e.g. 8 for 8%. */
export function percentOf(cents: number, ratePercent: number): number {
  return Math.round((cents * ratePercent) / 100);
}

/** Quantity times unit price, both possibly fractional, rounded to the cent. */
export function lineAmount(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
