// Putting a company's per-share figures and share counts on one basis - the
// one today's price is quoted on.
//
// The SEC figures for a year are on the share basis of the filing that last
// reported them. After a split, the next 10-Q's cover page shows the new
// share count, but the annual EPS and diluted share count stay on the old
// basis until a later 10-K restates them. Booking split 25-for-1 in April
// 2026: its cover showed 751m shares against a diluted count of 33m, and its
// EPS of $165.57 against a $158 share price would have read as a P/E of 1.
//
// Yahoo's split list is the clue, but not the proof: it also carries spin-off
// price adjustments (Honeywell 1.061), which change no share count. So only a
// split-sized ratio counts, and only when the share counts confirm it.

export interface Split {
  date: string; // YYYY-MM-DD
  ratio: number; // new shares per old
}

export interface ShareCounts {
  cover?: { millions: number; date: string } | null;
  diluted?: { millions: number; period: string } | null;
  multiClass?: boolean;
}

export interface ShareBasis {
  // Divide the filed EPS figures by this to put them on today's basis.
  epsDivisor: number;
  // Diluted weighted-average shares on today's basis, in millions; NaN if none.
  dilutedMillions: number;
  // The cover-page count on today's basis, if it passes its cross-check. This
  // is the count a market-cap question may state as fact.
  shares: { millions: number; date: string } | null;
}

// A split, or a reverse split, rather than a spin-off's price adjustment.
const SPLIT_SIZED = 1.5;
// Two share counts this close describe the same shares: a buyback or an issue
// moves them apart by a few percent. Further apart, the cover counted one
// class of several, or the two are on different bases.
export const MAX_SHARE_GAP = 0.2;
// A 10-K filed after a split restates the year for it. One is filed within
// about three months of the year end, so a split later than this after the
// year end cannot have been reflected in it.
const FILING_LAG_DAYS = 100;

const close = (a: number, b: number): boolean => Math.abs(a / b - 1) <= MAX_SHARE_GAP;

const yearEnd = (period: string | null): string | null => {
  const year = period ? Number(period.slice(2)) : NaN;
  return Number.isFinite(year) ? `${year}-12-31` : null;
};

const daysAfter = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 86400000;

const product = (splits: Split[]): number => splits.reduce((p, s) => p * s.ratio, 1);

const splitSized = (splits: Split[] | null | undefined): Split[] =>
  (splits ?? []).filter(
    s => Number.isFinite(s.ratio) && s.ratio > 0 && (s.ratio >= SPLIT_SIZED || s.ratio <= 1 / SPLIT_SIZED)
  );

// One filed per-share figure, and the day the filing carrying it went in.
export interface FiledPart {
  value: number;
  filed: string; // YYYY-MM-DD
}

// Trailing EPS onto today's basis. Its parts can sit on two: a 10-K filed
// before a split keeps the old one, while a 10-Q filed after it restates both
// its year-to-date figures. A filing is on the basis of the day it went in, so
// each part is divided by whatever split came after its own filing. That needs
// no share count to confirm it, because the two year-to-date figures always
// come from one 10-Q and so always share a basis.
export const trailingOnBasis = (
  annual: FiledPart,
  ytd: { current: FiledPart; prior: FiledPart } | null,
  splits: Split[] | null | undefined
): number => {
  const real = splitSized(splits);
  const after = (filed: string) => product(real.filter(s => s.date > filed));
  const sinceYearEnd = ytd ? (ytd.current.value - ytd.prior.value) / after(ytd.current.filed) : 0;
  return annual.value / after(annual.filed) + sinceYearEnd;
};

export const reconcileShares = (
  counts: ShareCounts | null | undefined,
  splits: Split[] | null | undefined,
  // For a company with no diluted count to check against (Exxon): its net
  // income over EPS implies one.
  netIncomeMillions: number,
  eps: number,
  fiscalYear: string | null
): ShareBasis => {
  const real = splitSized(splits);

  const cover = counts?.cover && counts.cover.millions > 0 ? counts.cover : null;
  // The cover count as of today: a split after the date it was counted
  // multiplies it.
  const coverNow = cover ? cover.millions * product(real.filter(s => s.date > cover.date)) : NaN;

  const diluted = counts?.diluted && counts.diluted.millions > 0 ? counts.diluted.millions : NaN;
  const end = yearEnd(fiscalYear ?? counts?.diluted?.period ?? null);
  const since = end ? real.filter(s => s.date > end) : [];
  const ratio = product(since);

  let epsDivisor = 1;
  if (ratio !== 1) {
    if (Number.isFinite(diluted) && Number.isFinite(coverNow)) {
      // The counts decide: on the old basis the diluted count sits a split
      // away from today's cover count; restated, it sits beside it.
      if (close(coverNow, diluted * ratio) && !close(coverNow, diluted)) epsDivisor = ratio;
    } else if (end && since.every(s => daysAfter(end, s.date) > FILING_LAG_DAYS)) {
      // Nothing to check against: assume a split well after the year end has
      // not been restated yet, which it cannot have been.
      epsDivisor = ratio;
    }
  }

  const dilutedMillions = Number.isFinite(diluted) ? diluted * epsDivisor : NaN;

  // The cover count is stated as fact only once it agrees with the diluted
  // count, or failing one, with net income over EPS.
  // A loss over a loss per share counts the shares just as well.
  const implied =
    netIncomeMillions !== 0 && eps !== 0 && Math.sign(netIncomeMillions) === Math.sign(eps)
      ? netIncomeMillions / (eps / epsDivisor)
      : NaN;
  const check = Number.isFinite(dilutedMillions) ? dilutedMillions : implied;
  const shares =
    cover && !counts?.multiClass && Number.isFinite(check) && close(coverNow, check)
      ? { millions: Math.round(coverNow * 100) / 100, date: cover.date }
      : null;

  return { epsDivisor, dilutedMillions, shares };
};
