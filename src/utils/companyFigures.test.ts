import { describe, it, expect } from "vitest";
import { companyFigures, FIGURE_LABELS } from "./companyFigures";
import { stocks } from "./stockData";

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
    // listings, and companies that file per share class only.
    FIGURE_LABELS.forEach((label, i) => {
      const missing = stocks.filter(s => companyFigures(s)[i].value === "n/a").length;
      expect(missing / stocks.length, label).toBeLessThan(0.06);
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
});
