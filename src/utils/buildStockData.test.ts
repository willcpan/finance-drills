import { describe, it, expect } from "vitest";
import { buildStockData, type Company, type PriceFile, type Universe } from "./buildStockData";

const company = (overrides: Partial<Company> = {}): Company => ({
  ticker: "AAA",
  name: "Alpha Industries Inc.",
  sector: "Industrials",
  cik: 1234567,
  revenue: 1000,
  operatingProfit: 200,
  eps: 5,
  fiscalYear: "CY2025",
  ...overrides,
});

const universe = (...companies: Company[]): Universe => ({
  asOf: "2026-09-17T00:00:00.000Z",
  index: "S&P 500",
  companies,
});

const priceFile = (quotes: PriceFile["quotes"]): PriceFile => ({
  asOf: "2026-09-17T20:04:57.000Z",
  source: "test",
  quotes,
});

describe("buildStockData", () => {
  it("joins reported figures to the quote", () => {
    const { stocks, asOf } = buildStockData(
      universe(company()),
      priceFile({ AAA: { price: 123.45, previousClose: 119.9, dividend: 2 } })
    );

    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({
      ticker: "AAA",
      name: "Alpha Industries Inc.",
      sector: "Industrials",
      currentPrice: 123.45,
      previousClose: 119.9,
      eps: 5,
      revenue: 1000,
      operatingProfit: 200,
      fiscalYear: "CY2025",
      dividendPerShare: 2,
    });
    expect(asOf).toBe("2026-09-17T20:04:57.000Z");
  });

  it("computes dividend yield against the live price", () => {
    const { stocks } = buildStockData(
      universe(company()),
      priceFile({ AAA: { price: 80, previousClose: 79, dividend: 2 } })
    );
    expect(stocks[0].dividendYield).toBe(2.5);
  });

  it("treats a company that pays nothing as paying zero", () => {
    // Not a missing value: Berkshire pays no dividend, and that is a fact
    // about Berkshire.
    const { stocks } = buildStockData(
      universe(company()),
      priceFile({ AAA: { price: 100, previousClose: 99, dividend: 0 } })
    );
    expect(stocks[0].dividendPerShare).toBe(0);
    expect(stocks[0].dividendYield).toBe(0);
  });

  it("carries a figure the company never reported as NaN, not zero", () => {
    // Financials and REITs largely do not report operating income. Zero would
    // be a claim - and would put a 0% margin question into the drill.
    const { stocks } = buildStockData(
      universe(company({ operatingProfit: null, eps: null })),
      priceFile({ AAA: { price: 100, previousClose: 99 } })
    );

    expect(stocks).toHaveLength(1);
    expect(Number.isNaN(stocks[0].operatingProfit)).toBe(true);
    expect(Number.isNaN(stocks[0].eps)).toBe(true);
    expect(stocks[0].revenue).toBe(1000);
  });

  it("carries the company name and both past closes through", () => {
    const { stocks } = buildStockData(
      universe(company()),
      priceFile({
        AAA: {
          price: 100,
          previousClose: 99,
          monthAgo: { price: 90, date: "2026-08-18" },
          yearAgo: { price: 50, date: "2025-09-17" },
        },
      })
    );

    expect(stocks[0].monthAgo).toEqual({ price: 90, date: "2026-08-18" });
    expect(stocks[0].yearAgo).toEqual({ price: 50, date: "2025-09-17" });
  });

  it("prefers the index's plain name over the quote's", () => {
    const { stocks } = buildStockData(
      universe(company({ name: "Apple Inc." })),
      priceFile({ AAA: { price: 100, previousClose: 99, name: "Apple Inc. Common Stock" } })
    );
    expect(stocks[0].name).toBe("Apple Inc.");
  });

  it("falls back through the quote's name to the ticker", () => {
    const { stocks } = buildStockData(
      universe(company({ name: "" }), company({ ticker: "BBB", name: "" })),
      priceFile({
        AAA: { price: 100, previousClose: 99, name: "From The Quote" },
        BBB: { price: 50, previousClose: 49, name: null },
      })
    );
    expect(stocks.map(s => s.name)).toEqual(["From The Quote", "BBB"]);
  });

  it("leaves out an index member with no quote and names it", () => {
    // Every question prints a price, including the ones asking about earnings.
    const { stocks, withoutQuote } = buildStockData(
      universe(company(), company({ ticker: "BBB" })),
      priceFile({ AAA: { price: 100, previousClose: 99 } })
    );

    expect(stocks.map(s => s.ticker)).toEqual(["AAA"]);
    expect(withoutQuote).toEqual(["BBB"]);
  });

  it("treats a malformed quote as no quote", () => {
    const { stocks, withoutQuote } = buildStockData(
      universe(company(), company({ ticker: "BBB" })),
      priceFile({
        AAA: { price: 100, previousClose: 0 },
        BBB: { price: Number.NaN, previousClose: 50 },
      })
    );

    expect(stocks).toHaveLength(0);
    expect(withoutQuote).toEqual(["AAA", "BBB"]);
  });

  it("keeps a row whose history is missing or malformed, minus the history", () => {
    const { stocks } = buildStockData(
      universe(company(), company({ ticker: "BBB" })),
      priceFile({
        AAA: { price: 100, previousClose: 99 },
        BBB: {
          price: 50,
          previousClose: 49,
          monthAgo: { price: 0, date: "2026-08-18" },
          yearAgo: { price: 25, date: undefined as unknown as string },
        },
      })
    );

    expect(stocks).toHaveLength(2);
    expect(stocks.map(s => s.monthAgo)).toEqual([null, null]);
    expect(stocks.map(s => s.yearAgo)).toEqual([null, null]);
  });

  it("keeps the first of duplicate tickers", () => {
    // Two share classes of the same company can both sit in the index.
    const { stocks } = buildStockData(
      universe(company(), company(), company()),
      priceFile({ AAA: { price: 100, previousClose: 99 } })
    );
    expect(stocks).toHaveLength(1);
  });

  it("builds nothing rather than guessing when a file is missing", () => {
    // vite.config.ts turns this into a failed build, which is louder than a
    // drill quietly running on invented numbers.
    expect(buildStockData(null, priceFile({ AAA: { price: 1, previousClose: 1 } })).stocks).toHaveLength(0);
    expect(buildStockData(universe(company()), null).stocks).toHaveLength(0);
    expect(buildStockData(null, null).asOf).toBeNull();
  });

  describe("trailing EPS", () => {
    // A 10-K filed in February and a Q2 10-Q filed in August.
    const ttmEps = {
      value: 7.5,
      end: "2026-06-30",
      concept: "EarningsPerShareDiluted",
      annual: { value: 7.0, start: "2025-01-01", end: "2025-12-31", filed: "2026-02-10" },
      ytd: { value: 4.0, start: "2026-01-01", end: "2026-06-30", filed: "2026-08-01" },
      priorYtd: { value: 3.5, start: "2025-01-01", end: "2025-06-30", filed: "2026-08-01" },
    };
    const build = (overrides: Partial<Company>, splits: { date: string; ratio: number }[] = []) =>
      buildStockData(
        universe(company(overrides)),
        priceFile({ AAA: { price: 150, previousClose: 149, splits } })
      ).stocks[0];

    it("carries the twelve months and the day they end", () => {
      expect(build({ ttmEps }).trailingEps).toEqual({ value: 7.5, end: "2026-06-30", diluted: true });
    });

    it("puts a 10-K filed before a split on the basis of the 10-Q filed after it", () => {
      // A 2-for-1 in May: the 10-Q restated both halves, the 10-K did not.
      const split = { date: "2026-05-15", ratio: 2 };
      const halved = { ...ttmEps, ytd: { ...ttmEps.ytd, value: 2.0 }, priorYtd: { ...ttmEps.priorYtd, value: 1.75 } };
      expect(build({ ttmEps: halved }, [split]).trailingEps?.value).toBe(3.75); // 7.00/2 + 2.00 - 1.75
    });

    it("puts every part on today's basis after a split since the last filing", () => {
      expect(build({ ttmEps }, [{ date: "2026-09-01", ratio: 2 }]).trailingEps?.value).toBe(3.75);
    });

    it("ignores a spin-off's price adjustment", () => {
      expect(build({ ttmEps }, [{ date: "2026-09-01", ratio: 1.06 }]).trailingEps?.value).toBe(7.5);
    });

    it("says it is basic when no diluted figure was filed", () => {
      expect(build({ ttmEps: { ...ttmEps, concept: "EarningsPerShareBasic" } }).trailingEps?.diluted).toBe(false);
    });

    it("has none where the refresh found nothing recent", () => {
      expect(build({ ttmEps: null }).trailingEps).toBeNull();
    });

    it("falls back to the fiscal year, undated, for a file written before trailing figures", () => {
      expect(build({}).trailingEps).toEqual({ value: 5, end: null, diluted: null });
    });
  });
});
