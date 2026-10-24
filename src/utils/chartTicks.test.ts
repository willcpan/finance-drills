import { describe, it, expect } from "vitest";
import { niceStep, priceTicks, tickLabel } from "./chartTicks";

describe("priceTicks", () => {
  it("rules the scale at round prices inside the range", () => {
    expect(priceTicks(147.31, 342.9)).toEqual([150, 200, 250, 300]);
    expect(priceTicks(12.4, 19.8)).toEqual([14, 16, 18]);
  });

  it("keeps cents only where the range needs them", () => {
    expect(priceTicks(0.31, 0.58)).toEqual([0.35, 0.4, 0.45, 0.5, 0.55]);
    expect(tickLabel(0.4, niceStep(0.31, 0.58, 4))).toBe("$0.40");
    expect(tickLabel(1500, 500)).toBe("$1,500");
  });

  it("includes a tick that lands exactly on the high", () => {
    expect(priceTicks(100, 400)).toEqual([100, 200, 300, 400]);
  });

  it("copes with a flat line", () => {
    expect(priceTicks(50, 50)).toEqual([50]);
  });
});
