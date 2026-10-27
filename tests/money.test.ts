import { describe, expect, it } from "vitest";
import { arsFromUsd, balanceArs, netPaymentsArs } from "../src/lib/money";

describe("money", () => {
  it("converts USD with manual FX", () => {
    expect(Number(arsFromUsd(100, 1400))).toBe(140000);
  });

  it("computes net and balance with refunds", () => {
    const payments = [
      { amountArs: 100000, type: "SENIA", voidedAt: null },
      { amountArs: 50000, type: "PARCIAL", voidedAt: null },
      { amountArs: 20000, type: "DEVOLUCION", voidedAt: null },
      { amountArs: 999, type: "PARCIAL", voidedAt: new Date() },
    ];
    expect(Number(netPaymentsArs(payments))).toBe(130000);
    expect(Number(balanceArs(200000, payments))).toBe(70000);
  });
});
