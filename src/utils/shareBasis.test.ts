import { describe, it, expect } from "vitest";
import { reconcileShares } from "./shareBasis";

describe("reconcileShares", () => {
  it("puts EPS on today's basis after a split the annual report predates", () => {
    // Booking split 25-for-1 in April 2026. Its 2025 EPS ($165.57) and diluted
    // count (33m) are pre-split; its July cover page (751m) is not.
    const basis = reconcileShares(
      { cover: { millions: 751.38, date: "2026-07-27" }, diluted: { millions: 32.64, period: "CY2025" } },
      [{ date: "2026-04-06", ratio: 25 }],
      5404,
      165.57,
      "CY2025"
    );
    expect(basis.epsDivisor).toBe(25);
    expect(basis.dilutedMillions).toBeCloseTo(816, 0);
    expect(basis.shares?.millions).toBeCloseTo(751.38, 2);
  });

  it("leaves EPS alone once a 10-K has restated it", () => {
    // Netflix split 10-for-1 in November 2025; its 2025 10-K reports EPS on
    // the new basis, and its diluted count agrees with the cover.
    const basis = reconcileShares(
      { cover: { millions: 4230, date: "2026-07-15" }, diluted: { millions: 4330, period: "CY2025" } },
      [{ date: "2025-11-17", ratio: 10 }],
      11000,
      2.54,
      "CY2025"
    );
    expect(basis.epsDivisor).toBe(1);
    expect(basis.shares?.millions).toBe(4230);
  });

  it("ignores a spin-off's price adjustment, which changes no share count", () => {
    const basis = reconcileShares(
      { cover: { millions: 635, date: "2026-07-20" }, diluted: { millions: 650, period: "CY2025" } },
      [{ date: "2026-06-29", ratio: 0.9535 }],
      6000,
      9.2,
      "CY2025"
    );
    expect(basis.epsDivisor).toBe(1);
    expect(basis.shares?.millions).toBe(635);
  });

  it("carries a cover count forward over a split after the date it was counted", () => {
    // Amphenol's cover counted 1,233m shares in July; it split 2-for-1 in
    // September, so today's price is quoted on about 2,466m.
    const basis = reconcileShares(
      { cover: { millions: 1232.98, date: "2026-07-28" }, diluted: { millions: 1277.5, period: "CY2025" } },
      [{ date: "2026-09-03", ratio: 2 }],
      4270,
      3.34,
      "CY2025"
    );
    expect(basis.shares?.millions).toBeCloseTo(2465.96, 2);
    expect(basis.epsDivisor).toBe(2);
  });

  it("will not state a share count for a company listed in two classes", () => {
    const basis = reconcileShares(
      { cover: { millions: 5800, date: "2026-07-20" }, diluted: { millions: 12230, period: "CY2025" }, multiClass: true },
      [],
      100000,
      8.1,
      "CY2025"
    );
    expect(basis.shares).toBeNull();
    // The diluted count is still there for the panel's estimate.
    expect(basis.dilutedMillions).toBe(12230);
  });

  it("checks a cover count against net income over EPS when no diluted count was filed", () => {
    // Exxon tags no diluted weighted average; 28,844m / $6.70 is about 4,305m.
    const exxon = reconcileShares({ cover: { millions: 4111.91, date: "2026-06-30" } }, [], 28844, 6.7, "CY2025");
    expect(exxon.shares?.millions).toBe(4111.91);

    // And a loss over a loss per share counts them just as well.
    const loss = reconcileShares({ cover: { millions: 186.98, date: "2026-07-27" } }, [], -298.2, -1.62, "CY2025");
    expect(loss.shares?.millions).toBe(186.98);
  });

  it("rejects a cover count that disagrees with the diluted one", () => {
    // A cover that counted one class of several.
    const basis = reconcileShares(
      { cover: { millions: 300, date: "2026-07-20" }, diluted: { millions: 1450, period: "CY2025" } },
      [],
      5000,
      3.4,
      "CY2025"
    );
    expect(basis.shares).toBeNull();
  });
});
