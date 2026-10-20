import { describe, it, expect } from 'vitest';
import { trailingEps } from './trailing-eps.mjs';

// Facts as companyconcept returns them: every filing repeats the periods it
// presents, so a 10-Q carries last year's months beside this year's.
const fact = (start, end, val, form, accn, filed) => ({ start, end, val, form, accn, filed, fp: form === '10-K' ? 'FY' : 'Q' });

// A calendar-year filer in October: a 10-K for 2025, and 10-Qs since.
const calendar = [
  fact('2023-01-01', '2023-12-31', 5.0, '10-K', 'k25', '2026-02-10'),
  fact('2024-01-01', '2024-12-31', 6.0, '10-K', 'k25', '2026-02-10'),
  fact('2025-01-01', '2025-12-31', 7.0, '10-K', 'k25', '2026-02-10'),
  // Q1: three months is also the year to date.
  fact('2026-01-01', '2026-03-31', 1.9, '10-Q', 'q1', '2026-05-01'),
  fact('2025-01-01', '2025-03-31', 1.7, '10-Q', 'q1', '2026-05-01'),
  // Q2: the quarter and the half, this year and last.
  fact('2026-04-01', '2026-06-30', 2.1, '10-Q', 'q2', '2026-08-01'),
  fact('2026-01-01', '2026-06-30', 4.0, '10-Q', 'q2', '2026-08-01'),
  fact('2025-04-01', '2025-06-30', 1.8, '10-Q', 'q2', '2026-08-01'),
  fact('2025-01-01', '2025-06-30', 3.5, '10-Q', 'q2', '2026-08-01'),
];

describe('trailingEps', () => {
  it('adds the year to date and takes off the same months a year earlier', () => {
    const ttm = trailingEps(calendar, '2026-10-20');
    expect(ttm.value).toBe(7.5); // 7.00 + 4.00 - 3.50
    expect(ttm.end).toBe('2026-06-30');
    expect(ttm.annual).toMatchObject({ value: 7.0, end: '2025-12-31', filed: '2026-02-10' });
    expect(ttm.ytd).toMatchObject({ value: 4.0, start: '2026-01-01', filed: '2026-08-01' });
    expect(ttm.priorYtd).toMatchObject({ value: 3.5, start: '2025-01-01' });
  });

  it('is the fiscal year itself until a 10-Q follows it', () => {
    const ttm = trailingEps(calendar.filter(f => f.form === '10-K'), '2026-03-01');
    expect(ttm.value).toBe(7.0);
    expect(ttm.end).toBe('2025-12-31');
    expect(ttm.ytd).toBeNull();
  });

  it('starts from the newest 10-K, however the frames would have filed it', () => {
    // Microsoft's year ends in June; its FY2026 10-K was in the data but the
    // calendar frames left the P/E on FY2025.
    const june = [
      fact('2024-07-01', '2025-06-30', 13.64, '10-K', 'k25', '2025-07-30'),
      fact('2025-07-01', '2026-06-30', 15.0, '10-K', 'k26', '2026-07-29'),
      fact('2024-07-01', '2025-06-30', 13.64, '10-K', 'k26', '2026-07-29'),
    ];
    expect(trailingEps(june, '2026-10-20')).toMatchObject({ value: 15.0, end: '2026-06-30' });
  });

  it('lines up a 52/53-week year by its dates, not by the calendar', () => {
    const weeks = [
      fact('2024-06-30', '2025-06-28', 3.0, '10-K', 'k', '2025-08-20'),
      fact('2025-06-29', '2025-09-27', 0.9, '10-Q', 'q', '2025-11-01'),
      fact('2024-06-30', '2024-09-28', 0.7, '10-Q', 'q', '2025-11-01'),
    ];
    expect(trailingEps(weeks, '2025-12-01')).toMatchObject({ value: 3.2, end: '2025-09-27' });
  });

  it('keeps the latest statement of a restated year', () => {
    const restated = [...calendar, fact('2025-01-01', '2025-12-31', 6.8, '10-K', 'k25a', '2026-03-15')];
    expect(trailingEps(restated, '2026-10-20').value).toBe(7.3); // 6.80 + 4.00 - 3.50
  });

  it('will not mix a year to date with a comparative from another filing', () => {
    // The Q2 10-Q lost its comparative; Q1's must not stand in for it.
    const noComparative = calendar.filter(f => !(f.accn === 'q2' && f.start === '2025-01-01'));
    const ttm = trailingEps(noComparative, '2026-10-20');
    expect(ttm.end).toBe('2025-12-31');
    expect(ttm.value).toBe(7.0);
  });

  it('carries a loss through the sum', () => {
    const turning = [
      fact('2025-01-01', '2025-12-31', -1.0, '10-K', 'k', '2026-02-10'),
      fact('2026-01-01', '2026-06-30', 0.5, '10-Q', 'q', '2026-08-01'),
      fact('2025-01-01', '2025-06-30', -0.8, '10-Q', 'q', '2026-08-01'),
    ];
    expect(trailingEps(turning, '2026-10-20').value).toBe(0.3);
  });

  it('gives nothing for a company that has stopped filing', () => {
    expect(trailingEps(calendar.filter(f => f.form === '10-K'), '2027-03-01')).toBeNull();
    expect(trailingEps([], '2026-10-20')).toBeNull();
    expect(trailingEps(null, '2026-10-20')).toBeNull();
  });
});
