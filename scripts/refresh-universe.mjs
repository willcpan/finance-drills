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
//              request, so the whole index costs about sixty calls rather
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
// requests a second; this makes about sixty frame requests in total. Set
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
// Seven years back, so a CAGR question can span five years of what was
// actually filed - with room for a non-calendar filer a frame behind - rather
// than a rate projected forward.
const LATEST_YEAR = new Date().getUTCFullYear() - 1;
const HISTORY_YEARS = 7;
const PERIODS = Array.from({ length: HISTORY_YEARS }, (_, i) => `CY${LATEST_YEAR - i}`);

// Share counts for the market-cap question. The cover page of every 10-K and
// 10-Q states the shares outstanding on a recent date (a dei fact, not
// us-gaap), and the SEC frames those as instants by calendar quarter. Newest
// first; the freshest count a company appears with is the one kept.
const SHARE_QUARTERS = (() => {
  const now = new Date();
  let year = now.getUTCFullYear();
  let quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  const quarters = [];
  for (let i = 0; i < 5; i++) {
    quarters.push(`CY${year}Q${quarter}I`);
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return quarters;
})();


// Revenue has no single tag - the one a filer uses depends on how it earns.
// Operating income is a single tag that financials and REITs simply do not
// report, which is an accounting fact rather than a gap to paper over: those
// companies end up without an operating margin question.
//
// Banks file their top line as RevenuesNetOfInterestExpense (Goldman, Wells
// Fargo). Without it Goldman had no revenue at all, and Wells Fargo's latest
// "revenue" was a Revenues figure from 2019, the last year it used that tag.
// Exxon files EPS as one figure for basic and diluted.
const CONCEPTS = {
  revenue: [
    ['Revenues', 'USD'],
    ['RevenueFromContractWithCustomerExcludingAssessedTax', 'USD'],
    ['RevenueFromContractWithCustomerIncludingAssessedTax', 'USD'],
    ['RevenuesNetOfInterestExpense', 'USD'],
    // Utilities (DTE).
    ['RegulatedAndUnregulatedOperatingRevenue', 'USD'],
  ],
  operatingProfit: [['OperatingIncomeLoss', 'USD']],
  eps: [
    ['EarningsPerShareDiluted', 'USD-per-shares'],
    ['EarningsPerShareBasic', 'USD-per-shares'],
    ['EarningsPerShareBasicAndDiluted', 'USD-per-shares'],
  ],
  // For the company panel only. A company that reports EPS per share class
  // and never for the whole (Airbnb) gets an EPS of net income over diluted
  // shares; one with no operating line (banks, insurers) gets a pre-tax margin.
  // Monster and Exelon stopped tagging EPS and file net income as ProfitLoss.
  netIncome: [
    ['NetIncomeLoss', 'USD'],
    ['ProfitLoss', 'USD'],
  ],
  pretaxIncome: [
    ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'USD'],
    ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'USD'],
  ],
};

// A company that moved under a new holding company files under a new CIK with
// none of its history: ExxonMobil Holdings Corp (2026) has filed 10-Qs but no
// 10-K yet. Its figures are read from the predecessor until it has its own.
// The run logs any company with no figures at all, which is how the next one
// of these will show up.
const PREDECESSOR_CIK = {
  2115436: 34088, // ExxonMobil Holdings Corp <- Exxon Mobil Corporation
};

// The latest figure has to be recent. Without this, a company that stopped
// using a tag reported its last year under it as current.
const MAX_STALE_YEARS = 1;

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

  const seen = new Set();
  const constituents = [];

  for (const row of parseRows(table)) {
    if (seen.has(row.ticker)) continue;
    seen.add(row.ticker);
    constituents.push(row);
  }

  return constituents;
}

// The listing exchange, as Google Finance names it in a quote URL
// (google.com/finance/quote/AAPL:NASDAQ). Without one that URL opens the
// Google Finance home page rather than the stock.
const GOOGLE_EXCHANGE = {
  Nyse: 'NYSE',
  Nasdaq: 'NASDAQ',
  BATS: 'BATS',
  'NYSE American': 'NYSEAMERICAN',
};

// [[Target|Shown]] -> Shown, [[Target]] -> Target; references and other
// templates dropped. For the plain-text cells: sub-industry, headquarters,
// founded.
const plainText = cell =>
  cell
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

// The table, a row at a time. Columns: symbol || security || sector ||
// sub-industry || headquarters || date added || CIK || founded.
//
// Each row is cut out on its own before any field is read. The previous parse
// was one pattern run across the whole table, expecting the name as a wiki
// link; Insulet's name is plain text, so the pattern ran on into the next row
// and gave PODD Intel's name-link, CIK and SEC figures - and dropped Intel.
//
// Cells are separated by "||", but a row sometimes starts a cell on a fresh
// line with a single "|" (Apple's founding year), so lines are split first.
const parseRows = table => {
  const rows = [];

  for (const chunk of table.split(/\n\|-/)) {
    const symbol = /\{\{(Nyse|Nasdaq|BATS|NYSE American)Symbol\|([A-Z.\-]{1,6})\}\}/.exec(chunk);
    if (!symbol) continue;

    const cells = chunk
      .split('\n')
      .filter(line => line.startsWith('|') && !line.startsWith('|-') && !line.startsWith('|}'))
      .flatMap(line => line.replace(/^\|\|?/, '').split('||'))
      .map(cell => cell.trim());
    const at = cells.findIndex(cell => cell.includes(symbol[0]));
    const [security, sector, subIndustry, headquarters, , cik, founded] = cells.slice(at + 1);

    // A row that does not read as a company is skipped, never half-filled:
    // the CIK is what every SEC figure hangs off.
    const cikNumber = /^\d{10}$/.test(cik ?? '') ? Number(cik) : null;
    // "Walt Disney Company (The)" is how the table sorts it, not its name.
    const name = security ? plainText(security).replace(/^(.*) \(The\)$/, 'The $1') : '';
    if (!cikNumber || !name || !sector) {
      console.warn(`skipping unreadable row for ${symbol[2]}`);
      continue;
    }

    rows.push({
      ticker: toQuoteSymbol(symbol[2]),
      name,
      sector: plainText(sector),
      cik: cikNumber,
      exchange: GOOGLE_EXCHANGE[symbol[1]] ?? null,
      // The article the name links to. An unlinked name (Insulet) is tried
      // as a title as it stands; if no such article exists, the company
      // simply has no description.
      wikiTitle: /\[\[([^\]|]+)/.exec(security)?.[1]?.trim() ?? name,
      subIndustry: subIndustry ? plainText(subIndustry) || null : null,
      headquarters: headquarters ? plainText(headquarters) || null : null,
      founded: founded ? plainText(founded) || null : null,
    });
  }

  return rows;
};

// A short account of what the company does: the opening of its Wikipedia
// article, cut to two sentences. Fetched once per article and carried over
// from the previous file after that - a company's lead paragraph rarely
// changes, and 500 requests a day for it would be rude.
const DESCRIPTION_SENTENCES = 2;
const DESCRIPTION_MAX_CHARS = 420;

// Abbreviations that end in a full stop without ending the sentence: "Apple
// Inc. is an American...".
const NOT_A_SENTENCE_END = /(?:\b(?:Inc|Co|Corp|Ltd|Bros|St|Jr|Sr|No|Mr|Dr|plc|U\.S|U\.K|N\.A|S\.A|L\.P)|\b[A-Z])\.$/;

const firstSentences = text => {
  const sentences = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?](?=\s+[A-Z"(])/g)) {
    const candidate = text.slice(start, match.index + 1);
    if (NOT_A_SENTENCE_END.test(candidate)) continue;
    sentences.push(candidate.trim());
    start = match.index + 1;
    if (sentences.length === DESCRIPTION_SENTENCES) break;
  }
  if (sentences.length < DESCRIPTION_SENTENCES && start < text.length) sentences.push(text.slice(start).trim());

  let out = '';
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (out && next.length > DESCRIPTION_MAX_CHARS) break;
    out = next;
  }
  return out;
};

async function fetchDescription(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const extract = (await res.json())?.extract;
    return typeof extract === 'string' && extract.length > 40 ? firstSentences(extract) : null;
  } catch {
    return null;
  }
}

// Descriptions already held, by article title, so a refresh only fetches the
// companies new to the index (or whose article moved).
const heldDescriptions = () => {
  try {
    const { companies } = JSON.parse(fs.readFileSync(OUT, 'utf-8'));
    return new Map(
      (companies ?? [])
        .filter(c => c.profile?.wikiTitle && c.profile?.description)
        .map(c => [c.profile.wikiTitle, c.profile.description])
    );
  } catch {
    return new Map();
  }
};

async function fetchDescriptions(constituents) {
  const held = heldDescriptions();
  const descriptions = new Map(held);
  const wanted = [...new Set(constituents.map(c => c.wikiTitle).filter(t => t && !held.has(t)))];

  // A few at a time; Wikipedia asks for modest, identified traffic.
  for (let i = 0; i < wanted.length; i += 4) {
    const batch = wanted.slice(i, i + 4);
    const results = await Promise.all(batch.map(fetchDescription));
    batch.forEach((title, j) => results[j] && descriptions.set(title, results[j]));
    await sleep(SEC_PACING_MS);
  }

  console.log(`descriptions: ${held.size} held, ${wanted.length} fetched`);
  return descriptions;
}

// One concept, one period, every filer that reported it.
async function fetchFrame(concept, unit, period, taxonomy = 'us-gaap') {
  const url = `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${concept}/${unit}/${period}.json`;
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
  const found = Object.fromEntries(Object.keys(CONCEPTS).map(field => [field, new Map()]));

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

const yearOf = period => Number(String(period).slice(2));

// Two concepts carrying the same year at the same value are the same figure
// under two tags - a company restating its old years under the new tag when it
// switches. Within this, the history may continue under the old tag.
const SPLICE_MATCH = 0.005;

// The company's latest reported figure, and the year before it measured under
// the same concept.
const latestPair = series => {
  const none = { current: null, prior: null, history: [] };
  if (!series || series.length === 0) return none;

  // PERIODS is newest first and the series was built in that order.
  const current = series[0];
  if (yearOf(current.period) < LATEST_YEAR - MAX_STALE_YEARS) return none;
  const prior = series.find(e => e.frame === current.frame && e.period !== current.period) ?? null;

  // Every year back from the latest, newest first and one per period, under
  // the latest year's concept. A CAGR spans the ends of this, so mixing
  // concepts would report a change of revenue tag as growth - except where the
  // company filed the same year identically under both tags, which shows the
  // two measure the same thing (AMETEK moved tags in 2022 and filed 2022 and
  // 2023 under both). There the history carries on under the older tag.
  const at = (frame, period) => series.find(e => e.frame === frame && e.period === period);
  const history = [current];
  let frame = current.frame;
  while (history.length < HISTORY_YEARS) {
    const last = history[history.length - 1];
    const wanted = `${last.period.slice(0, 2)}${yearOf(last.period) - 1}`;
    let next = at(frame, wanted);
    if (!next) {
      const bridge = series.find(
        e =>
          e.frame !== frame &&
          e.period === last.period &&
          Math.abs(e.value / last.value - 1) <= SPLICE_MATCH &&
          at(e.frame, wanted)
      );
      if (!bridge) break;
      frame = bridge.frame;
      next = at(frame, wanted);
    }
    history.push(next);
  }

  return { current, prior, history };
};

// The run of consecutive years from the latest backwards. A gap would leave a
// span the question could not honestly put a number of years on.
const consecutive = history => {
  const run = [];
  for (const entry of history) {
    const previous = run[run.length - 1];
    if (previous && yearOf(previous.period) - yearOf(entry.period) !== 1) break;
    run.push(entry);
  }
  return run;
};

// The freshest cover-page count per company, and the diluted weighted-average
// count behind each year's EPS. The two are cross-checked in the build
// (buildStockData.ts), which also knows about splits from the price feed: a
// split since the last annual report moves the cover count but not the
// annual one, and the check has to allow for it.
async function fetchShares(wanted) {
  const cover = new Map();
  for (const quarter of SHARE_QUARTERS) {
    for (const row of await fetchFrame('EntityCommonStockSharesOutstanding', 'shares', quarter, 'dei')) {
      if (!wanted.has(row.cik) || !(row.val > 0)) continue;
      const held = cover.get(row.cik);
      if (!held || row.end > held.date) cover.set(row.cik, { value: row.val, date: row.end });
    }
  }

  // Every year, not just the latest: the EPS history is checked against these
  // for splits (see splitFreeEps below).
  const dilutedByYear = new Map();
  for (const period of PERIODS) {
    for (const row of await fetchFrame('WeightedAverageNumberOfDilutedSharesOutstanding', 'shares', period)) {
      if (!wanted.has(row.cik) || !(row.val > 0)) continue;
      const years = dilutedByYear.get(row.cik) ?? new Map();
      years.set(period, row.val);
      dilutedByYear.set(row.cik, years);
    }
  }

  console.log(`shares: cover ${cover.size}  diluted ${dilutedByYear.size}`);
  return { cover, dilutedByYear };
}

// A year's EPS is restated for a split only if a filing after the split still
// presents that year. A 10-K shows three, so a five-year span can straddle a
// split nobody went back to restate, and a 10:1 split reads as EPS falling by
// 90%. The diluted share count for those same years carries the same unadjusted
// basis, which is what gives it away: a share count that jumps by a split-sized
// ratio in a year is a split (or a merger, which a CAGR should not span
// either). The history stops at the first such break, and at the first year
// with no count to check against.
const MAX_SHARE_STEP = 1.6;

const splitFreeEps = (history, years) => {
  if (!years) return [];
  const run = [];
  for (const entry of history) {
    const count = years.get(entry.period);
    if (!count) break;
    const previous = run[run.length - 1];
    if (previous) {
      const step = years.get(previous.period) / count;
      if (step > MAX_SHARE_STEP || step < 1 / MAX_SHARE_STEP) break;
    }
    run.push(entry);
  }
  // Only the CAGR questions read this. The year-on-year pair (`prior`) keeps
  // its own rules.
  return run;
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
  // As many years as the frames walk, so a CAGR can span them.
  const byPeriod = new Map();
  for (const fact of [...annual].sort((a, b) => (a.end > b.end ? -1 : 1))) {
    const period = `FY${fact.fy ?? fact.end.slice(0, 4)}`;
    if (!byPeriod.has(period)) byPeriod.set(period, { value: fact.val, period, frame: concept });
  }

  return [...byPeriod.values()].slice(0, HISTORY_YEARS);
}

// Fill whatever the frames missed, company by company.
async function fillGaps(constituents, facts) {
  let filled = 0;

  for (const company of constituents) {
    for (const [field, concepts] of Object.entries(CONCEPTS)) {
      if (facts[field].has(company.factsCik)) continue;

      for (const [concept, unit] of concepts) {
        const series = await fetchConcept(company.factsCik, concept, unit);
        if (series?.length) {
          facts[field].set(company.factsCik, series);
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

for (const c of constituents) c.factsCik = PREDECESSOR_CIK[c.cik] ?? c.cik;
const byCik = new Set(constituents.flatMap(c => [c.cik, c.factsCik]));
const facts = await fetchFundamentals(byCik);

const beforeGaps = Object.fromEntries(
  Object.entries(facts).map(([field, map]) => [field, map.size])
);
const filled = await fillGaps(constituents, facts);

const cikCounts = new Map();
for (const c of constituents) cikCounts.set(c.cik, (cikCounts.get(c.cik) ?? 0) + 1);
const multiListed = new Set([...cikCounts].filter(([, n]) => n > 1).map(([cik]) => cik));
const { cover, dilutedByYear } = await fetchShares(byCik);

// The frames miss a non-calendar filer's diluted count as they miss its other
// figures (Constellation, Take-Two, Smucker); fetch those one at a time.
let dilutedFilled = 0;
for (const c of constituents) {
  if (dilutedByYear.has(c.factsCik)) continue;
  const series = await fetchConcept(c.factsCik, 'WeightedAverageNumberOfDilutedSharesOutstanding', 'shares');
  if (!series?.length) continue;
  dilutedByYear.set(c.factsCik, new Map(series.map(e => [e.period, e.value])));
  dilutedFilled++;
}
console.log(`diluted counts filled per company: ${dilutedFilled}`);
const descriptions = await fetchDescriptions(constituents);
console.log(
  `\nframes: revenue ${beforeGaps.revenue}  operating profit ${beforeGaps.operatingProfit}  eps ${beforeGaps.eps}` +
    `\nper-company fallback filled ${filled} more`
);

// Revenue and operating profit are reported in dollars; the questions talk in
// millions, the way a filing's own summary tables do.
const toMillions = value => Math.round((value / 1e6) * 10) / 10;

const companies = constituents
  .map(c => {
    const revenue = latestPair(facts.revenue.get(c.factsCik));
    const operatingProfit = latestPair(facts.operatingProfit.get(c.factsCik));
    const eps = latestPair(facts.eps.get(c.factsCik));
    const netIncome = latestPair(facts.netIncome.get(c.factsCik));
    const pretaxIncome = latestPair(facts.pretaxIncome.get(c.factsCik));
    // A margin divides two figures from the same year, or it is not a margin.
    const sameYear = pair => (pair.current && pair.current.period === revenue.current?.period ? pair.current : null);
    const held = cover.get(c.cik) ?? cover.get(c.factsCik);
    const dilutedYears = dilutedByYear.get(c.factsCik);
    // The latest year held: CY2025 from the frames, or FY2026 from the
    // per-company fallback.
    const dilutedPeriod = dilutedYears
      ? [...dilutedYears.keys()].sort((a, b) => yearOf(b) - yearOf(a)).find(p => yearOf(p) >= LATEST_YEAR - MAX_STALE_YEARS)
      : undefined;

    return {
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      cik: c.cik,
      // Any of these may be null. A company missing one keeps its place and
      // simply loses the question types that need it - the eligibility bands
      // in the app already work that way.
      revenue: revenue.current ? toMillions(revenue.current.value) : null,
      operatingProfit: sameYear(operatingProfit) ? toMillions(operatingProfit.current.value) : null,
      // Panel-only fallbacks; see CONCEPTS.
      pretaxIncome: sameYear(pretaxIncome) ? toMillions(pretaxIncome.current.value) : null,
      netIncome: netIncome.current && netIncome.current.period === eps.current?.period
        ? toMillions(netIncome.current.value)
        : netIncome.current && !eps.current
          ? toMillions(netIncome.current.value)
          : null,
      netIncomeFiscalYear: netIncome.current?.period ?? null,
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
      // Every consecutive year back from the latest, newest first, for the
      // CAGR questions. Revenue in millions, like the figures above.
      history: {
        revenue: consecutive(revenue.history).map(e => ({ period: e.period, value: toMillions(e.value) })),
        eps: splitFreeEps(consecutive(eps.history), dilutedYears).map(e => ({
          period: e.period,
          value: e.value,
        })),
      },
      // Share counts, in millions: the cover page's (with the date counted)
      // and the diluted weighted average behind the latest EPS. Cross-checked
      // and split-adjusted in the build. A company listed twice (GOOG and
      // GOOGL) is two classes of one company, so neither price times the
      // total is quite its value.
      shareCounts: {
        cover: held ? { millions: Math.round(held.value / 1e4) / 100, date: held.date } : null,
        diluted: dilutedPeriod
          ? { millions: Math.round(dilutedYears.get(dilutedPeriod) / 1e4) / 100, period: dilutedPeriod }
          : null,
        multiClass: multiListed.has(c.cik),
      },
      // For the panel a player can open after answering: where to read more,
      // and what the company is.
      profile: {
        exchange: c.exchange ?? null,
        wikiTitle: c.wikiTitle ?? null,
        subIndustry: c.subIndustry ?? null,
        headquarters: c.headquarters ?? null,
        founded: c.founded ?? null,
        description: (c.wikiTitle && descriptions.get(c.wikiTitle)) || null,
      },
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
const spans = (field, years) => companies.filter(c => c.history[field].length > years).length;
console.log(
  `3-year spans: revenue ${spans('revenue', 3)}  eps ${spans('eps', 3)}   ` +
    `5-year: revenue ${spans('revenue', 5)}  eps ${spans('eps', 5)}`
);
console.log(
  `share counts: cover ${companies.filter(c => c.shareCounts.cover).length}  ` +
    `diluted ${companies.filter(c => c.shareCounts.diluted).length}`
);

// A company with nothing at all has usually moved CIK (see PREDECESSOR_CIK).
const empty = companies.filter(c => c.revenue === null && c.eps === null);
if (empty.length) console.warn(`no fundamentals at all: ${empty.map(c => `${c.ticker} (CIK ${c.cik})`).join(', ')}`);

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
