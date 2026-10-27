import { describe, it, expect } from "vitest";
import { companyFigures, FIGURE_LABELS } from "./companyFigures";
import { stocks, type StockData } from "./stockData";

// Runs against the real index the build injected, like questionGenerator.test.
describe("companyFigures", () => {
  it("gives every company the same rows in the same order", () => {
    // The panel used to drop a row whenever a figure was missing, so no two
    // companies read alike.
    for (const stock of stocks) {
      const figures = companyFigures(stock);
      expect(figures.map(f => f.label)).toEqual([...FIGURE_LABELS]);
      for (const figure of figures) {
        expect(figure.value.length).toBeGreaterThan(0);
        expect(figure.value).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });

  it("says why whenever a figure is missing or estimated", () => {
    for (const stock of stocks) {
      for (const figure of companyFigures(stock)) {
        if (figure.value === "n/a" || figure.value === "n/m" || figure.value.startsWith("≈")) {
          expect(figure.note?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  it("fills nearly every row for nearly every company", () => {
    // Today no row is missing for more than about 4% of the index: recent
    // listings, and companies that file per share class only. EV/NOPAT is
    // the exception: banks, insurers and REITs file no operating line, and
    // some companies tag their borrowings in ways the refresh does not read.
    // Until the first refresh that collects debt and cash, it is empty.
    const collected = stocks.some(s => s.debt || s.cash);
    FIGURE_LABELS.forEach((label, i) => {
      if (label === "EV/NOPAT" && !collected) return;
      const missing = stocks.filter(s => companyFigures(s)[i].value === "n/a").length;
      expect(missing / stocks.length, label).toBeLessThan(label === "EV/NOPAT" ? 0.4 : 0.06);
    });
  });

  it("values Booking on its post-split shares", () => {
    // 25-for-1 in April 2026, after its last 10-K. Unadjusted, its $165.57 EPS
    // against a $158 price read as a P/E of 1.
    const booking = stocks.find(s => s.ticker === "BKNG");
    if (!booking) return;
    const pe = Number(companyFigures(booking)[1].value.replace(/[^\d.]/g, ""));
    expect(pe).toBeGreaterThan(5);
  });

  it("finds Exxon's figures under its predecessor's CIK", () => {
    // ExxonMobil Holdings Corp (2026) has filed no 10-K under its new CIK.
    const exxon = stocks.find(s => s.ticker === "XOM");
    if (!exxon) return;
    expect(exxon.revenue).toBeGreaterThan(100000);
    expect(exxon.eps).toBeGreaterThan(0);
  });

  describe("the P/E note", () => {
    // Gallagher, roughly: GAAP EPS about half the "adjusted" figure it
    // headlines, the gap being amortization of what it has acquired.
    const broker = (overrides: Partial<StockData> = {}): StockData => ({
      ...stocks[0],
      currentPrice: 268,
      trailingEps: { value: 6.03, end: "2026-06-30", diluted: true },
      fiscalYear: "CY2025",
      netIncome: 1494,
      intangibleAmortization: 1100,
      ...overrides,
    });
    const note = (s: StockData) => companyFigures(s).find(f => f.label === "P/E")?.note;

    it("says it is GAAP and whose twelve months", () => {
      expect(note(broker({ intangibleAmortization: Number.NaN }))).toBe("GAAP, TTM to 30 Jun 2026, $6.03 EPS");
    });

    it("names the amortization when it is a large share of earnings", () => {
      expect(note(broker())).toBe(
        'GAAP, TTM to 30 Jun 2026, $6.03 EPS; after $1.1bn of intangibles amortization in 2025, which "adjusted" EPS adds back'
      );
    });

    it("leaves out amortization too small to move the multiple", () => {
      expect(note(broker({ intangibleAmortization: 200 }))).not.toMatch(/amortization/);
    });
  });

  describe("the EV/NOPAT row", () => {
    // A $50bn industrial: 400m shares at $125, $9bn of debt, $3bn of cash,
    // $4bn of operating profit taxed at 20%.
    const industrial = (overrides: Partial<StockData> = {}): StockData => ({
      ...stocks[0],
      currentPrice: 125,
      shares: { millions: 400, date: "2026-07-31" },
      debt: { millions: 9000, date: "2026-06-30" },
      cash: { millions: 3000, date: "2026-06-30" },
      operatingProfit: 4000,
      pretaxIncome: 3500,
      incomeTax: 700,
      fiscalYear: "CY2025",
      ...overrides,
    });
    const row = (s: StockData) => companyFigures(s).find(f => f.label === "EV/NOPAT")!;

    it("sets enterprise value against operating profit after tax", () => {
      // EV 50 + 9 - 3 = $56bn; NOPAT 4,000 x 0.8 = $3.2bn; 17.5x.
      expect(row(industrial())).toEqual({
        label: "EV/NOPAT",
        value: "17.5x",
        note: "EV $56.0bn = cap $50.0bn + $6.0bn net debt; NOPAT $3.2bn at 20.0% tax",
      });
    });

    it("says net cash when cash exceeds debt", () => {
      expect(row(industrial({ cash: { millions: 12000, date: "2026-06-30" } })).note).toMatch(/- \$3.0bn net cash/);
    });

    it("says why when it cannot be had", () => {
      expect(row(industrial({ operatingProfit: Number.NaN })).note).toBe("no operating line filed");
      expect(row(industrial({ debt: null })).note).toBe("debt or cash not filed under a known tag");
      expect(row(industrial({ incomeTax: 2000 })).note).toBe("tax rate of 57.1% in 2025");
      expect(row(industrial({ shares: null })).note).toBe("share count filed per class only");
    });
  });
});
