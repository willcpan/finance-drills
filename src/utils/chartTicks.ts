// Round prices to rule a chart's scale at: steps of 1, 2, 2.5 or 5 times a
// power of ten, so the labels read $150, $200, $250 rather than $147.31.
const STEPS = [1, 2, 2.5, 5];

// How many multiples of `step` fall between low and high.
const fits = (low: number, high: number, step: number): number =>
  Math.floor(high / step + 1e-9) - Math.ceil(low / step - 1e-9) + 1;

// The round step that rules closest to `count` lines inside the range. Picked
// by the lines it actually draws, since where a range starts decides whether
// a $50 step gives two lines or four.
export const niceStep = (low: number, high: number, count: number): number => {
  const power = 10 ** Math.floor(Math.log10((high - low) / count));
  const candidates = [power / 10, power, power * 10].flatMap(p => STEPS.map(s => s * p));
  return candidates.reduce((best, step) =>
    Math.abs(fits(low, high, step) - count) < Math.abs(fits(low, high, best) - count) ? step : best
  );
};

// About `count` round values between low and high inclusive, lowest first.
export const priceTicks = (low: number, high: number, count = 4): number[] => {
  if (!(high > low)) return Number.isFinite(low) ? [low] : [];
  const step = niceStep(low, high, count);
  const ticks: number[] = [];
  // Rounded to the step's own precision, or 0.1 + 0.2 shows up as a label.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let v = Math.ceil(low / step) * step; v <= high + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(decimals)));
  }
  return ticks;
};

// A scale label: whole dollars once the step is a dollar or more.
export const tickLabel = (value: number, step: number): string =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: step < 1 ? 2 : 0,
    maximumFractionDigits: step < 1 ? 2 : 0,
  })}`;
