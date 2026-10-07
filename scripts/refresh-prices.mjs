// Refresh data/prices.json from Yahoo's chart endpoint, for whoever is in
// data/universe.json.
//
// Revenue, operating profit and EPS come from the SEC in refresh-universe.mjs;
// they move once a quarter. Prices move every day, which is why they are
// refreshed separately and why the daily commit touches only this file.
//
// One call per ticker returns five years of daily bars, carrying the company name,
// the closes a month, a year, three and five years back, and the dividends paid
// over the last year - so the longer-horizon and dividend questions cost no extra requests.
//
// The output is committed. The site stays static: no runtime fetch, no CORS
// negotiation, no third-party script in the page.
//
//   node scripts/refresh-prices.mjs [--dry-run]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNIVERSE = path.join(ROOT, 'data', 'universe.json');
const OUT = path.join(ROOT, 'data', 'prices.json');

const DRY_RUN = process.argv.includes('--dry-run');

// Politeness and patience. The index is ~500 tickers; at 4 in flight this
// finishes in about 25 seconds, which is well inside any CI budget.
const CONCURRENCY = 4;
const PACING_MS = 120;
const ATTEMPTS = 2;

// A 404 is Yahoo saying the symbol is gone (acquired, taken private, renamed),
// not that the request failed. Retrying it wastes time and looks like abuse.
const PERMANENT = new Set([404]);

// Below this, assume the endpoint is having a bad day rather than that a fifth
// of the index delisted overnight, and leave the committed file alone.
const MIN_COVERAGE = 0.9;

// How far back the longer-horizon questions look. The last bar on or before
// the target date is used, so these are "about a month" and "about a year".
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;

// The price CAGR questions look three and five years back. A 5-year range
// returns those bars in the same call, so they cost no extra requests.
const THREE_YEAR_DAYS = 3 * 365 + 1;
const FIVE_YEAR_DAYS = 5 * 365 + 1;

// A range can stop a day or two short of its nominal length on some listings.
// A bar this close to the target still fairly answers "five years ago".
const MAX_SHORTFALL_DAYS = 15;

// Yahoo's `close` is split-adjusted (NVDA's 2021 bars read about $33, not the
// $330 printed then); `adjclose` additionally folds in dividends. So the two
// drift apart by the dividends paid since, not by a split. Over a month or a
// year that is a few percent at most, and a gap past this means something is
// wrong with the bar.
const MAX_ADJUSTMENT_GAP = 0.25;

// Over three and five years the dividend drift alone can pass that gap, so the
// long horizons are checked differently: at every split Yahoo reports inside
// the span, the closes either side must not jump by more than this. A 10:1
// split left unadjusted would show as a 90% overnight fall.
const MAX_SPLIT_JUMP = 0.3;

// The index membership is refresh-universe.mjs's job; this script prices
// whoever is in it.
const readTickers = () => {
  if (!fs.existsSync(UNIVERSE)) {
    console.error(`${path.relative(ROOT, UNIVERSE)} is missing - run refresh-universe.mjs first`);
    process.exit(1);
  }

  const { companies } = JSON.parse(fs.readFileSync(UNIVERSE, 'utf-8'));
  return [...new Set((companies ?? []).map(c => c.ticker).filter(Boolean))].sort();
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const round2 = value => Math.round(value * 100) / 100;

const dayOf = seconds => new Date(seconds * 1000).toISOString().slice(0, 10);

const shiftDay = (isoDay, days) =>
  new Date(Date.parse(`${isoDay}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

const daysBetween = (fromDay, toDay) =>
  Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86400000);

const splitFree = bar => Math.abs(bar.close / bar.adjusted - 1) <= MAX_ADJUSTMENT_GAP;

// The last bar on or before `cutoffDay`, unless its close and adjusted close
// have drifted apart further than a month or a year of dividends explains.
const closeOnOrBefore = (bars, cutoffDay) => {
  const bar = barOnOrBefore(bars, cutoffDay);
  return bar && splitFree(bar) ? bar : null;
};

const barOnOrBefore = (bars, cutoffDay) => {
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].day <= cutoffDay) return bars[i];
  }
  return null;
};

// A close from years back, used for a CAGR. It has to sit near the target date
// - a listing younger than the span has no such bar - and no split between it
// and today may show up as a jump, which would mean the series was not
// adjusted for it.
const longCloseOnOrBefore = (bars, splits, cutoffDay) => {
  const bar = barOnOrBefore(bars, cutoffDay);
  if (!bar || daysBetween(bar.day, cutoffDay) > MAX_SHORTFALL_DAYS) return null;

  for (const split of splits) {
    if (split.day <= bar.day) continue;
    const after = bars.findIndex(b => b.day >= split.day);
    if (after <= 0) continue;
    const jump = bars[after].close / bars[after - 1].close - 1;
    if (Math.abs(jump) > MAX_SPLIT_JUMP) return null;
  }
  return bar;
};

async function fetchQuote(ticker) {
  // events=div brings the dividends paid over the range back in the same
  // response. The SEC tags dividends inconsistently - barely a quarter of the
  // index files CommonStockDividendsPerShareDeclared - so the trailing twelve
  // months are summed from what was actually paid instead. events=split lists
  // the splits, which the long-horizon closes are checked against.
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?interval=1d&range=5y&includeAdjustedClose=true&events=div,split`;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; finance-drills refresh)' },
      });

      if (!res.ok) {
        if (PERMANENT.has(res.status) || attempt === ATTEMPTS) {
          return { ticker, ok: false, reason: `HTTP ${res.status}` };
        }
        await sleep(500 * attempt);
        continue;
      }

      const result = (await res.json())?.chart?.result?.[0];
      const meta = result?.meta;
      const price = meta?.regularMarketPrice;

      // Every question is priced in dollars and the UI prints a '$'. A CHF or
      // GBp listing would silently mix units into the same drill, so a foreign
      // quote is dropped rather than converted.
      if (meta?.currency !== 'USD') {
        return { ticker, ok: false, reason: `currency ${meta?.currency ?? '?'}` };
      }
      if (!(Number.isFinite(price) && price > 0)) {
        return { ticker, ok: false, reason: 'no price' };
      }

      const stamps = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];

      const bars = stamps
        .map((stamp, i) => ({
          day: dayOf(stamp),
          close: closes[i],
          // With no adjclose in the response, treat the close as adjusted, so
          // the gap check passes rather than discarding the bar.
          adjusted: Number.isFinite(adjusted[i]) ? adjusted[i] : closes[i],
        }))
        .filter(bar => Number.isFinite(bar.close) && bar.close > 0 && Number.isFinite(bar.adjusted));

      if (bars.length < 2) {
        return { ticker, ok: false, reason: 'no history' };
      }

      // US equities trade 13:30-20:00 UTC, so the UTC date of a quote is its
      // trading day and any earlier date is a previous session. The previous
      // close is read off the series rather than from meta.chartPreviousClose,
      // which holds the close before the requested range started - five years
      // ago, not yesterday.
      const today = dayOf(meta?.regularMarketTime ?? Date.now() / 1000);
      const previous = closeOnOrBefore(bars, shiftDay(today, 1));
      if (!previous) {
        return { ticker, ok: false, reason: 'no previous close' };
      }

      const monthAgo = closeOnOrBefore(bars, shiftDay(today, MONTH_DAYS));
      const yearAgo = closeOnOrBefore(bars, shiftDay(today, YEAR_DAYS));

      const splits = Object.values(result?.events?.splits ?? {})
        .filter(s => Number.isFinite(s.date))
        .map(s => ({ day: dayOf(s.date) }));
      const threeYearsAgo = longCloseOnOrBefore(bars, splits, shiftDay(today, THREE_YEAR_DAYS));
      const fiveYearsAgo = longCloseOnOrBefore(bars, splits, shiftDay(today, FIVE_YEAR_DAYS));

      const past = bar => (bar ? { price: round2(bar.close), date: bar.day } : null);

      // The last twelve months of payments is the trailing dividend - the
      // response carries five years of them. A company that pays none sums to
      // zero, which is the right answer for it rather than a gap.
      const yearBack = shiftDay(today, YEAR_DAYS);
      const payments = Object.values(result?.events?.dividends ?? {}).filter(
        d => Number.isFinite(d.date) && dayOf(d.date) > yearBack
      );
      const dividend = payments.reduce((sum, d) => sum + (Number.isFinite(d.amount) ? d.amount : 0), 0);

      return {
        ticker,
        ok: true,
        name: meta?.longName ?? meta?.shortName ?? null,
        price: round2(price),
        previousClose: round2(previous.close),
        monthAgo: past(monthAgo),
        yearAgo: past(yearAgo),
        threeYearsAgo: past(threeYearsAgo),
        fiveYearsAgo: past(fiveYearsAgo),
        dividend: Math.round(dividend * 1000) / 1000,
        payments: payments.length,
        asOf: meta?.regularMarketTime,
      };
    } catch (err) {
      if (attempt === ATTEMPTS) {
        return { ticker, ok: false, reason: String(err.message).slice(0, 60) };
      }
      await sleep(500 * attempt);
    }
  }
}

// Fixed-size worker pool: keeps a steady few requests in flight instead of
// opening 180 sockets at once.
async function mapPool(items, limit, worker) {
  const results = [];
  let next = 0;

  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
      await sleep(PACING_MS);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const tickers = readTickers();
console.log(`refreshing ${tickers.length} tickers`);

const started = Date.now();
const results = await mapPool(tickers, CONCURRENCY, fetchQuote);
const elapsed = (Date.now() - started) / 1000;

const good = results.filter(r => r.ok);
const bad = results.filter(r => !r.ok);
const coverage = good.length / tickers.length;

console.log(
  `got ${good.length}/${tickers.length} in ${elapsed.toFixed(1)}s ` +
    `(${(coverage * 100).toFixed(1)}% coverage)`
);

if (bad.length) {
  console.log('\nno quote:');
  for (const r of bad) console.log(`  ${r.ticker.padEnd(6)} ${r.reason}`);
}

// Names and history are optional per ticker, so report them separately: a
// question type quietly losing its pool is worth noticing here.
const report = (label, has, note = 'missing') => {
  const without = good.filter(r => !has(r)).map(r => r.ticker);
  console.log(
    `  ${label} ${String(good.length - without.length).padStart(3)}/${good.length}` +
      (without.length ? `   ${note}: ${without.length}` : '')
  );
};

console.log('\nof those:');
report('name      ', r => r.name);
report('month-ago ', r => r.monthAgo);
report('year-ago  ', r => r.yearAgo);
report('3y-ago    ', r => r.threeYearsAgo);
report('5y-ago    ', r => r.fiveYearsAgo);
// Not a gap: a company that pays nothing is correctly recorded as zero.
report('pays a dividend', r => r.dividend > 0, 'pay none');

if (coverage < MIN_COVERAGE) {
  console.error(
    `\ncoverage below ${(MIN_COVERAGE * 100).toFixed(0)}% - leaving ${path.relative(ROOT, OUT)} untouched`
  );
  process.exit(1);
}

// Latest market timestamp seen, so the UI can date the prices from the data
// rather than from whenever the workflow happened to run.
const latest = good.reduce((max, r) => (r.asOf > max ? r.asOf : max), 0);

const payload = {
  asOf: latest ? new Date(latest * 1000).toISOString() : new Date().toISOString(),
  source: 'Yahoo Finance (v8 chart)',
  quotes: Object.fromEntries(
    good
      .slice()
      .sort((a, b) => a.ticker.localeCompare(b.ticker))
      .map(r => [
        r.ticker,
        {
          name: r.name,
          price: r.price,
          previousClose: r.previousClose,
          monthAgo: r.monthAgo,
          yearAgo: r.yearAgo,
          threeYearsAgo: r.threeYearsAgo,
          fiveYearsAgo: r.fiveYearsAgo,
          dividend: r.dividend,
        },
      ])
  ),
};

if (DRY_RUN) {
  console.log(
    `\n--dry-run: would write ${Object.keys(payload.quotes).length} quotes, asOf ${payload.asOf}`
  );
  process.exit(0);
}

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nwrote ${path.relative(ROOT, OUT)}  asOf ${payload.asOf}`);
