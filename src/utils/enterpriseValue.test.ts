import { describe, it, expect } from "vitest";
import { enterpriseValueOf, evToNopatOf, nopatOf, taxRateOf, stocks, type StockData } from "./stockData";

// Pinned on a fixture because the index data carries no debt or cash until
// the first refresh after these were added.
const company = (overrides: Partial<StockData> = {}): StockData => ({
  ...stocks[0],
  currentPrice: 125,
  shares: { millions: 400, date: "2026-07-31" },
  debt: { millions: 9000, date: "2026-06-30" },
  cash: { millions: 3000, date: "2026-06-30" },
  operatingProfit: 4000,
  pretaxIncome: 3500,
  incomeTax: 700,
  ...overrides,
});

describe("enterprise value and NOPAT", () => {
  it("taxes operating profit at the effective rate", () => {
    expect(taxRateOf(company())).toBe(20);
    expect(nopatOf(company())).toBe(3200);
  });

  it("adds debt and takes off cash", () => {
    expect(enterpriseValueOf(company())).toBe(56);
    expect(evToNopatOf(company())).toBeCloseTo(17.5, 5);
  });

  it("is NaN, never zero, when a part is missing", () => {
    // A missing debt figure could be no debt or an unread tag; EV cannot say.
    expect(enterpriseValueOf(company({ debt: null }))).toBeNaN();
    expect(enterpriseValueOf(company({ shares: null }))).toBeNaN();
    expect(taxRateOf(company({ incomeTax: Number.NaN }))).toBeNaN();
    // A refund on a loss is not a rate.
    expect(taxRateOf(company({ pretaxIncome: -500, incomeTax: -100 }))).toBeNaN();
    expect(nopatOf(company({ incomeTax: Number.NaN }))).toBeNaN();
  });
});
