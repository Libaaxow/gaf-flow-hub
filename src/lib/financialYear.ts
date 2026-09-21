import { useCallback, useEffect, useState } from 'react';

/**
 * Financial (calendar) year selection: 1 January – 31 December.
 *
 * Income-statement figures (revenue collected, expenses, net profit) are scoped
 * to the selected year, so they start from zero when a new year begins.
 * Balance-sheet figures (receivables / outstanding debt, opening balances,
 * assets and inventory) are NOT scoped — they carry forward across years.
 */

const STORAGE_KEY = 'gaf_financial_year';
const EVENT = 'gaf-financial-year-change';
export const FIRST_FINANCIAL_YEAR = 2024;

export function currentFinancialYear(): number {
  return new Date().getFullYear();
}

export function financialYearRange(year: number) {
  return {
    start: `${year}-01-01`,
    // exclusive upper bound, safe for timestamps
    endExclusive: `${year + 1}-01-01`,
    end: `${year}-12-31`,
    label: `FY ${year} (1 Jan – 31 Dec ${year})`,
  };
}

export function availableFinancialYears(): number[] {
  const current = currentFinancialYear();
  const years: number[] = [];
  for (let y = current; y >= FIRST_FINANCIAL_YEAR; y--) years.push(y);
  return years;
}

function readStored(): number {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!isNaN(parsed) && parsed >= FIRST_FINANCIAL_YEAR && parsed <= currentFinancialYear()) return parsed;
  return currentFinancialYear();
}

export function useFinancialYear() {
  const [year, setYearState] = useState<number>(() => readStored());

  useEffect(() => {
    const sync = () => setYearState(readStored());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setYear = useCallback((next: number) => {
    window.localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new Event(EVENT));
    setYearState(next);
  }, []);

  const range = financialYearRange(year);

  return {
    year,
    setYear,
    years: availableFinancialYears(),
    range,
    isCurrentYear: year === currentFinancialYear(),
  };
}

/** True when an ISO date/timestamp falls inside the given financial year. */
export function inFinancialYear(value: string | null | undefined, year: number): boolean {
  if (!value) return false;
  return String(value).slice(0, 4) === String(year);
}

/** True when an ISO date/timestamp is before the start of the given financial year. */
export function beforeFinancialYear(value: string | null | undefined, year: number): boolean {
  if (!value) return false;
  return String(value).slice(0, 4) < String(year);
}

/** Minimum acceptable gross margin on a product line (COGS protection). */
export const MIN_MARGIN_PERCENT = 35;

export function marginPercent(sellingPrice: number, costPrice: number): number | null {
  const sell = Number(sellingPrice) || 0;
  if (sell <= 0) return null;
  return ((sell - (Number(costPrice) || 0)) / sell) * 100;
}

export function isLowMargin(sellingPrice: number, costPrice: number): boolean {
  const m = marginPercent(sellingPrice, costPrice);
  if (m === null) return false;
  // A zero cost means cost has not been recorded yet — nothing to warn about.
  if ((Number(costPrice) || 0) <= 0) return false;
  return m < MIN_MARGIN_PERCENT;
}
