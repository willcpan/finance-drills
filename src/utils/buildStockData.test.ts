import { describe, it, expect } from "vitest";
import { buildStockData, derivePreviousClose, type PriceFile } from "./buildStockData";

const HEADER = "Ticker,Revenue,Stock Price,EPS,Operating Profit,Annual Dividend";

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

// price 100, eps 5, revenue 1000, op profit 200, dividend 2
const AAA = "AAA,1000,100,5,200,2";
const BBB = "BBB,2000,50,2.5,400,1";

const priceFile = (quotes: PriceFile["quotes"]): PriceFile => ({
  asOf: "2026-09-17T16:19:12.000Z",
  source: "test",
  quotes,
});

describe("buildStockData", () => {
  it("takes prices from the quote file and fundamentals from the CSV", () => {
    const { stocks, asOf } = buildStockData(
      csv(AAA),
      priceFile({ AAA: { price: 123.45, previousClose: 119.9 } })
    );

    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({
      ticker: "AAA",
      currentPrice: 123.45,
      previousClose: 119.9,
      eps: 5,
      revenue: 1000,
      operatingProfit: 200,
      dividendPerShare: 2,
    });
    expect(asOf).toBe("2026-09-17T16:19:12.000Z");
  });

  it("recomputes dividend yield against the live price, not the CSV price", () => {
    // 2 / 80 = 2.5%, where the CSV price of 100 would have said 2%.
    const { stocks } = buildStockData(
      csv(AAA),
      priceFile({ AAA: { price: 80, previousClose: 79 } })
    );
    expect(stocks[0].dividendYield).toBe(2.5);
  });

  it("carries the company name and both past closes through", () => {
    const { stocks } = buildStockData(
      csv(AAA),
      priceFile({
        AAA: {
          name: "Alpha Industries Inc.",
          price: 100,
          previousClose: 99,
          monthAgo: { price: 90, date: "2026-08-18" },
          yearAgo: { price: 50, date: "2025-09-17" },
        },
      })
    );

    expect(stocks[0].name).toBe("Alpha Industries Inc.");
    expect(stocks[0].monthAgo).toEqual({ price: 90, date: "2026-08-18" });
    expect(stocks[0].yearAgo).toEqual({ price: 50, date: "2025-09-17" });
  });

  it("falls back to the ticker when a quote carries no name", () => {
    // Every screen showing a name can then render it without a null check.
    const { stocks } = buildStockData(
      csv(AAA, BBB),
      priceFile({
        AAA: { price: 100, previousClose: 99, name: null },
        BBB: { price: 50, previousClose: 49, name: "   " },
      })
    );
    expect(stocks.map(s => s.name)).toEqual(["AAA", "BBB"]);
  });

  it("keeps a row whose history is missing or malformed, minus the history", () => {
    // A bad past close costs that company its longer-horizon questions, not
    // its place in the drill.
    const { stocks } = buildStockData(
      csv(AAA, BBB),
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

  it("leaves out a ticker with no quote and names it", () => {
    // A delisted company keeps a frozen price forever. Pairing that with an
    // invented prior close is the thing the quote file exists to stop.
    const { stocks, withoutQuote } = buildStockData(
      csv(AAA, BBB),
      priceFile({ AAA: { price: 100, previousClose: 99 } })
    );

    expect(stocks.map(s => s.ticker)).toEqual(["AAA"]);
    expect(withoutQuote).toEqual(["BBB"]);
  });

  it("treats a malformed quote as no quote", () => {
    const { stocks, withoutQuote } = buildStockData(
      csv(AAA, BBB),
      priceFile({
        AAA: { price: 100, previousClose: 0 },
        BBB: { price: Number.NaN, previousClose: 50 },
      })
    );

    expect(stocks).toHaveLength(0);
    expect(withoutQuote).toEqual(["AAA", "BBB"]);
  });

  it("keeps the first of duplicate rows so one company cannot be drawn twice as often", () => {
    // The CSV carried 80 exact duplicate rows at one point, which left those
    // companies several times more likely to come up.
    const { stocks } = buildStockData(
      csv(AAA, AAA, AAA),
      priceFile({ AAA: { price: 100, previousClose: 99 } })
    );
    expect(stocks).toHaveLength(1);
  });

  it("drops rows with cells that do not parse", () => {
    const { stocks } = buildStockData(
      csv(AAA, "CCC,,,,,", "DDD,1000,notaprice,5,200,2"),
      priceFile({
        AAA: { price: 100, previousClose: 99 },
        CCC: { price: 10, previousClose: 10 },
        DDD: { price: 10, previousClose: 10 },
      })
    );
    expect(stocks.map(s => s.ticker)).toEqual(["AAA"]);
  });

  describe("without a quote file", () => {
    it("falls back to CSV prices so a fresh clone still runs", () => {
      const { stocks, asOf } = buildStockData(csv(AAA, BBB), null);

      expect(stocks.map(s => s.ticker)).toEqual(["AAA", "BBB"]);
      expect(stocks[0].currentPrice).toBe(100);
      expect(asOf).toBeNull();
    });

    it("has no names or history to offer, so the drill is the day move only", () => {
      // The CSV carries neither, and the month and year question pools are
      // empty rather than invented.
      const { stocks } = buildStockData(csv(AAA), null);

      expect(stocks[0].name).toBe("AAA");
      expect(stocks[0].monthAgo).toBeNull();
      expect(stocks[0].yearAgo).toBeNull();
    });

    it("derives a prior close that is stable across builds and within 2%", () => {
      const first = buildStockData(csv(AAA), null).stocks[0];
      const second = buildStockData(csv(AAA), null).stocks[0];

      expect(first.previousClose).toBe(second.previousClose);
      expect(first.previousClose).toBe(derivePreviousClose("AAA", 100));
      const drift = Math.abs(first.previousClose - 100) / 100;
      expect(drift).toBeLessThanOrEqual(0.021);
    });

    it("treats an empty quote set as no quote file rather than an empty drill", () => {
      const { stocks, asOf } = buildStockData(csv(AAA), priceFile({}));
      expect(stocks).toHaveLength(1);
      expect(asOf).toBeNull();
    });
  });

  it("throws rather than returning nothing when the CSV is unparseable", () => {
    expect(() => buildStockData('Ticker,Revenue\n"unterminated', null)).toThrow();
  });

  it("strips a byte-order mark from the header", () => {
    const { stocks } = buildStockData(
      String.fromCharCode(0xfeff) + csv(AAA),
      priceFile({ AAA: { price: 100, previousClose: 99 } })
    );
    expect(stocks.map(s => s.ticker)).toEqual(["AAA"]);
  });
});
