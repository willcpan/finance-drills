// Rebuild data/universe.json: who is in the S&P 500, and what they earned.
//
// This replaces the hand-maintained Stockdata.csv. That file was a sector walk
// typed out in April 2025, which meant its membership drifted (seven names had
// been acquired or taken private by the time anyone noticed) and its
// fundamentals froze at that date - it had Apple earning $6.08 a share long
// after the figure was $7.46.
//
// Two sources, both free and keyless:
//
//   Wikipedia  the constituent table, which carries each company's CIK - the
//              key that opens the SEC.
//   SEC XBRL   the `frames` API returns one concept for every filer in one
//              request, so the whole index costs about eight calls rather
//              than 500 multi-megabyte company files.
//
// Prices and dividends are not here; they move daily and belong to
// refresh-prices.mjs, which reads the ticker list this writes.
//
//   node scripts/refresh-universe.mjs [--dry-run]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'universe.json');

const DRY_RUN = process.argv.includes('--dry-run');

// The SEC asks that automated traffic declare itself and stay under 10
// requests a second; this makes about two dozen requests in total. Set
// SEC_CONTACT to an email so the declaration carries a real contact, which is
// what their policy asks for.
//
// One quirk worth knowing before editing this line: the SEC blocks any
// User-Agent containing the literal substring "github", answering 403 with
// "Your Request Originates from an Undeclared Automated Tool". Advertising the
// repository URL here - the obvious, polite thing to do - is what trips it.
// Emails, URLs and parentheses are all fine otherwise.
const SEC_CONTACT = process.env.SEC_CONTACT?.trim();

if (SEC_CONTACT && /github/i.test(SEC_CONTACT)) {
  console.warn('SEC_CONTACT contains "github", which the SEC rejects - ignoring it');
}

const UA = {
  'User-Agent':
    SEC_CONTACT && !/github/i.test(SEC_CONTACT)
      ? `finance-drills/1.0 (${SEC_CONTACT})`
      : 'finance-drills/1.0',
};
const SEC_PACING_MS = 200;

// The index is 500 companies in about 503 listings (a few have two share
// classes). Well under this means the page moved or the parse broke, and
// overwriting a good file with a broken list is worse than doing nothing.
const MIN_CONSTITUENTS = 450;

// Newest first: a company reports its own fiscal year whenever it ends, so the
// most recent frame it appears in is the freshest annual figure available.
const PERIODS = ['CY2025', 'CY2024', 'CY2023'];

// Revenue has no single tag - the one a filer uses depends on how it earns.
// Operating income is a single tag that financials and REITs simply do not
// report, which is an accounting fact rather than a gap to paper over: those
// companies end up without an operating margin question.
const CONCEPTS = {
  revenue: [
    ['Revenues', 'USD'],
    ['RevenueFromContractWithCustomerExcludingAssessedTax', 'USD'],
    ['RevenueFromContractWithCustomerIncludingAssessedTax', 'USD'],
  ],
  operatingProfit: [['OperatingIncomeLoss', 'USD']],
  eps: [
    ['EarningsPerShareDiluted', 'USD-per-shares'],
    ['EarningsPerShareBasic', 'USD-per-shares'],
  ],
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Wikipedia writes class shares as BRK.B; every quote endpoint wants BRK-B.
const toQuoteSymbol = symbol => symbol.replace(/\./g, '-');

async function fetchConstituents() {
  const url =
    'https://en.wikipedia.org/w/api.php?action=parse' +
    '&page=List_of_S%26P_500_companies&prop=wikitext&format=json';

  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Wikipedia returned HTTP ${res.status}`);

  const wikitext = (await res.json())?.parse?.wikitext?.['*'] ?? '';

  // The page holds two tables - current constituents, then a log of additions
  // and removals. Only the first is the index.
  const start = wikitext.indexOf('id="constituents"');
  const end = wikitext.indexOf('id="changes"');
  if (start < 0) throw new Error('constituents table not found');
  const table = wikitext.slice(start, end > start ? end : undefined);

  // Each row: a {{NyseSymbol|TICKER}} template, the company as a wiki link,
  // then four columns along, a ten-digit CIK.
  const rows = [
    ...table.matchAll(
      /\{\{(?:Nyse|Nasdaq|BATS|NYSE American)Symbol\|([A-Z.\-]{1,6})\}\}[\s\S]*?\|\|\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\][\s\S]*?\|\|\s*([A-Za-z \-&,.']+?)\s*\n[\s\S]*?\|\|\s*(\d{10})/g
    ),
  ];

  const seen = new Set();
  const constituents = [];

  for (const [, symbol, name, sector, cik] of rows) {
    const ticker = toQuoteSymbol(symbol);
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    constituents.push({ ticker, name: name.trim(), sector: sector.trim(), cik: Number(cik) });
  }

  return constituents;
}

// One concept, one period, every filer that reported it.
async function fetchFrame(concept, unit, period) {
  const url = `https://data.sec.gov/api/xbrl/frames/us-gaap/${concept}/${unit}/${period}.json`;
  const res = await fetch(url, { headers: UA });
  await sleep(SEC_PACING_MS);

  // A concept nobody filed in a period 404s, which is ordinary: not every tag
  // is used every year.
  if (res.status === 404) return [];

  // Anything else is the request being refused, not an absent fact. Swallowing
  // it would write a universe with every fundamental null, which is how this
  // went unnoticed the first time.
  if (!res.ok) {
    throw new Error(
      `SEC returned HTTP ${res.status} for ${concept} ${period}` +
        (res.status === 403 ? ' (check the User-Agent - see the note above)' : '')
    );
  }

  const json = await res.json();
  return json?.data ?? [];
}

// Walk the periods newest first, keeping every year a company reported rather
// than only its latest. Growth questions need two ends to compare, and the
// pair has to be measured the same way: a company that switched revenue tags
// between years would otherwise show growth that is an accounting change.
async function fetchFundamentals(wanted) {
  const found = { revenue: new Map(), operatingProfit: new Map(), eps: new Map() };

  const record = (field, cik, entry) => {
    const series = found[field].get(cik) ?? [];
    // Periods arrive newest first, so a period already held is the fresher one.
    if (series.some(e => e.period === entry.period && e.frame === entry.frame)) return;
    series.push(entry);
    found[field].set(cik, series);
  };

  for (const period of PERIODS) {
    for (const [field, concepts] of Object.entries(CONCEPTS)) {
      for (const [concept, unit] of concepts) {
        for (const row of await fetchFrame(concept, unit, period)) {
          if (!wanted.has(row.cik) || !Number.isFinite(row.val)) continue;
          record(field, row.cik, { value: row.val, period, frame: concept });
        }
      }
    }
  }

  return found;
}

// The company's latest reported figure, and the year before it measured under
// the same concept.
const latestPair = series => {
  if (!series || series.length === 0) return { current: null, prior: null };

  // PERIODS is newest first and the series was built in that order.
  const current = series[0];
  const prior = series.find(e => e.frame === current.frame && e.period !== current.period) ?? null;
  return { current, prior };
};

// The frames API is organised by calendar year, so a company whose fiscal year
// ends in February or September can be absent from every frame - Visa, Hershey
// and Constellation Brands all are. For the handful left over it is cheaper to
// ask per company: companyconcept returns one tag's full history in a small
// file, and there are only ever a few dozen of these.
async function fetchConcept(cik, concept, unit) {
  const padded = String(cik).padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${padded}/us-gaap/${concept}.json`;
  const res = await fetch(url, { headers: UA });
  await sleep(SEC_PACING_MS);

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SEC returned HTTP ${res.status} for ${concept} of CIK ${cik}`);

  const facts = (await res.json())?.units?.[unit] ?? [];

  // Annual figures only: a full-year filing, covering something close to a
  // year. Without the duration check a quarter would pass for a year.
  const annual = facts.filter(f => {
    if (f.form !== '10-K' || f.fp !== 'FY' || !Number.isFinite(f.val)) return false;
    if (!f.start) return true; // per-share figures are often instantaneous
    const days = (Date.parse(f.end) - Date.parse(f.start)) / 86400000;
    return days >= 350 && days <= 380;
  });

  if (annual.length === 0) return null;

  // Newest first, one entry per fiscal year: a figure is often restated in a
  // later filing, and the most recent statement of a year is the one to keep.
  // Two years is all a growth question needs.
  const byPeriod = new Map();
  for (const fact of [...annual].sort((a, b) => (a.end > b.end ? -1 : 1))) {
    const period = `FY${fact.fy ?? fact.end.slice(0, 4)}`;
    if (!byPeriod.has(period)) byPeriod.set(period, { value: fact.val, period, frame: concept });
  }

  return [...byPeriod.values()].slice(0, 2);
}

// Fill whatever the frames missed, company by company.
async function fillGaps(constituents, facts) {
  let filled = 0;

  for (const company of constituents) {
    for (const [field, concepts] of Object.entries(CONCEPTS)) {
      if (facts[field].has(company.cik)) continue;

      for (const [concept, unit] of concepts) {
        const series = await fetchConcept(company.cik, concept, unit);
        if (series?.length) {
          facts[field].set(company.cik, series);
          filled++;
          break;
        }
      }
    }
  }

  return filled;
}

const constituents = await fetchConstituents();
console.log(`constituents: ${constituents.length}`);

if (constituents.length < MIN_CONSTITUENTS) {
  console.error(
    `\nonly ${constituents.length} constituents parsed (expected ${MIN_CONSTITUENTS}+) - ` +
      `leaving ${path.relative(ROOT, OUT)} untouched`
  );
  process.exit(1);
}

const byCik = new Set(constituents.map(c => c.cik));
const facts = await fetchFundamentals(byCik);

const beforeGaps = Object.fromEntries(
  Object.entries(facts).map(([field, map]) => [field, map.size])
);
const filled = await fillGaps(constituents, facts);
console.log(
  `\nframes: revenue ${beforeGaps.revenue}  operating profit ${beforeGaps.operatingProfit}  eps ${beforeGaps.eps}` +
    `\nper-company fallback filled ${filled} more`
);

// Revenue and operating profit are reported in dollars; the questions talk in
// millions, the way a filing's own summary tables do.
const toMillions = value => Math.round((value / 1e6) * 10) / 10;

const companies = constituents
  .map(c => {
    const revenue = latestPair(facts.revenue.get(c.cik));
    const operatingProfit = latestPair(facts.operatingProfit.get(c.cik));
    const eps = latestPair(facts.eps.get(c.cik));

    return {
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      cik: c.cik,
      // Any of these may be null. A company missing one keeps its place and
      // simply loses the question types that need it - the eligibility bands
      // in the app already work that way.
      revenue: revenue.current ? toMillions(revenue.current.value) : null,
      operatingProfit: operatingProfit.current ? toMillions(operatingProfit.current.value) : null,
      eps: eps.current ? eps.current.value : null,
      // The year before, measured under the same concept, so that a growth
      // question compares like with like rather than reporting an accounting
      // change as growth.
      prior: {
        revenue: revenue.prior ? toMillions(revenue.prior.value) : null,
        eps: eps.prior ? eps.prior.value : null,
        revenueFiscalYear: revenue.prior?.period ?? null,
        epsFiscalYear: eps.prior?.period ?? null,
      },
      // The fiscal year each figure came from, so the drill can say how old
      // its fundamentals are instead of implying they are current.
      fiscalYear: eps.current?.period ?? revenue.current?.period ?? null,
    };
  })
  .sort((a, b) => a.ticker.localeCompare(b.ticker));

const count = field => companies.filter(c => c[field] !== null).length;
console.log(
  `\nfundamentals: revenue ${count('revenue')}  operating profit ${count('operatingProfit')}  eps ${count('eps')}`
);
console.log(
  `complete (all three): ${companies.filter(c => c.revenue !== null && c.operatingProfit !== null && c.eps !== null).length}`
);

// Growth questions need both ends, so these are the pools they draw from.
const pairs = field =>
  companies.filter(c => c[field] !== null && c.prior[field] !== null).length;
console.log(`year-on-year pairs: revenue ${pairs("revenue")}  eps ${pairs("eps")}`);

// Prices alone make a drill of six question types; the valuation, margin and
// dividend questions need these. If the join collapses, the file that is
// already committed is better than the one this run would write.
const withEps = count('eps');
if (withEps < companies.length * 0.8) {
  console.error(
    `\nonly ${withEps}/${companies.length} companies have EPS - leaving ${path.relative(ROOT, OUT)} untouched`
  );
  process.exit(1);
}

const payload = {
  asOf: new Date().toISOString(),
  index: 'S&P 500',
  sources: {
    constituents: 'Wikipedia: List of S&P 500 companies',
    fundamentals: 'SEC XBRL frames API (us-gaap)',
  },
  companies,
};

if (DRY_RUN) {
  console.log(`\n--dry-run: would write ${companies.length} companies`);
  process.exit(0);
}

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
