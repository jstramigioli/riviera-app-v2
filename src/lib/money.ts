import { Decimal } from "@prisma/client/runtime/library";

export function toDecimal(n: number | string | Decimal): Decimal {
  return n instanceof Decimal ? n : new Decimal(n);
}

export function arsFromUsd(amountUsd: number | string, fxRate: number | string): Decimal {
  return toDecimal(amountUsd).mul(toDecimal(fxRate));
}

export function formatArs(amount: number | string | Decimal): string {
  const n = Number(toDecimal(amount).toFixed(2));
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

export function netPaymentsArs(
  payments: { amountArs: Decimal | number | string; type: string; voidedAt: Date | null }[],
): Decimal {
  let total = new Decimal(0);
  for (const p of payments) {
    if (p.voidedAt) continue;
    const amt = toDecimal(p.amountArs);
    if (p.type === "DEVOLUCION") total = total.sub(amt);
    else total = total.add(amt);
  }
  return total;
}

export function balanceArs(
  agreedPriceArs: Decimal | number | string | null | undefined,
  payments: { amountArs: Decimal | number | string; type: string; voidedAt: Date | null }[],
): Decimal {
  const price = agreedPriceArs == null ? new Decimal(0) : toDecimal(agreedPriceArs);
  return price.sub(netPaymentsArs(payments));
}
