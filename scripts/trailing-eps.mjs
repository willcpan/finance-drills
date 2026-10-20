// Trailing-twelve-month EPS from a company's own filings.
//
// A P/E on the last annual report alone goes stale as the year goes on: by
// October a calendar-year company's 10-K is ten months old, and two 10-Qs
// since have said what it earned in the first half. The trailing figure is the
// last fiscal year, plus the year to date, less the same months a year
// earlier:
//
//   TTM = FY + YTD - prior-year YTD
//
// Every term is a figure the company filed, so the result is still a filed
// fact rather than an estimate. The two year-to-date figures come from the
// same 10-Q - each one presents the prior year's months beside this year's -
// so they are measured identically and on one share basis. No quarter has to
// be backed out of an annual total, which XBRL rarely tags on its own.
//
// Summing per-share figures across periods is how a trailing EPS is
// conventionally built; it is not exactly net income over one share count,
// but it is the number a screen calls "EPS (TTM)".
//
// Pure, so it can be tested against fixtures: it takes the facts of one
// companyconcept response (`units["USD/shares"]`) and returns null or the
// figure with the parts it was built from.

const DAY = 86400000;
const days = (from, to) => (Date.parse(to) - Date.parse(from)) / DAY;
const duration = fact => (fact.start ? days(fact.start, fact.end) : NaN);

// A 52/53-week year runs 364 or 371 days.
const isAnnual = fact => fact.form === '10-K' && duration(fact) >= 350 && duration(fact) <= 380;
// One, two or three quarters.
const isYearToDate = fact => fact.form === '10-Q' && duration(fact) >= 80 && duration(fact) <= 290;

// Fiscal years and quarters end on a weekday rule as often as a month end, so
// dates that should line up can be a few days apart.
const SLACK_DAYS = 10;

// Older than this and the company has stopped filing, or moved CIK.
export const MAX_AGE_DAYS = 400;

const round2 = value => Math.round(value * 100) / 100;

// The latest-filed version of each period: a later filing that restates one
// supersedes it.
const latestBy = (facts, key) => {
  const held = new Map();
  for (const fact of facts) {
    const k = key(fact);
    const prev = held.get(k);
    if (!prev || fact.filed > prev.filed) held.set(k, fact);
  }
  return [...held.values()];
};

const part = fact => ({ value: fact.val, start: fact.start, end: fact.end, filed: fact.filed });

export function trailingEps(facts, today = new Date().toISOString().slice(0, 10)) {
  const usable = (facts ?? []).filter(
    f => Number.isFinite(f.val) && typeof f.end === 'string' && typeof f.filed === 'string'
  );

  const annuals = latestBy(usable.filter(isAnnual), f => `${f.start}/${f.end}`).sort((a, b) =>
    a.end < b.end ? 1 : -1
  );
  const annual = annuals[0];
  if (!annual) return null;

  // The fiscal year that began after the last 10-K, as far as the newest
  // 10-Q has got through it.
  const ytd = latestBy(
    usable.filter(f => isYearToDate(f) && f.end > annual.end && Math.abs(days(annual.end, f.start) - 1) <= SLACK_DAYS),
    f => `${f.start}/${f.end}`
  ).sort((a, b) => (a.end < b.end ? 1 : -1))[0];

  // The same months a year earlier, from the same filing, starting where the
  // annual figure starts.
  const prior = ytd
    ? usable.find(
        f =>
          f.accn === ytd.accn &&
          f.end !== ytd.end &&
          Math.abs(days(f.end, ytd.end) - 365) <= SLACK_DAYS &&
          Math.abs(duration(f) - duration(ytd)) <= SLACK_DAYS &&
          Math.abs(days(annual.start, f.start)) <= SLACK_DAYS
      )
    : undefined;

  // A 10-Q with no comparative to subtract cannot extend the year, so the
  // figure is the fiscal year on its own - still twelve months, and labelled
  // with the months it covers.
  const extended = ytd && prior;
  const end = extended ? ytd.end : annual.end;
  if (days(end, today) > MAX_AGE_DAYS) return null;

  return {
    value: extended ? round2(annual.val + ytd.val - prior.val) : annual.val,
    // The twelve months covered.
    end,
    annual: part(annual),
    ytd: extended ? part(ytd) : null,
    priorYtd: extended ? part(prior) : null,
  };
}
