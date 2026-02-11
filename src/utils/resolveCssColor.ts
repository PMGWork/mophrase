/**
 * CSS カスタムプロパティ（var(--xxx)）を実際のカラー値に解決する。
 * fallback 値と SSR 環境にも対応。
 */

import type { Colors } from '../config';

const CSS_VAR_PATTERN = /^var\(\s*(--[^,\s)]+)\s*(?:,\s*([^)]+))?\s*\)$/;

// 単一の CSS カスタムプロパティを解決
export const resolveCssColor = (value: string): string => {
  if (typeof window === 'undefined') return value;
  if (!value.includes('var(')) return value;

  const match = value.match(CSS_VAR_PATTERN);
  if (!match) return value;

  const variableName = match[1];
  const fallback = match[2]?.trim();
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();

  if (resolved) return resolved;
  if (fallback) return fallback;
  return value;
};

// 複数の CSS カスタムプロパティを解決
export const resolveCssColorList = (values: readonly string[]): string[] =>
  values.map((value) => resolveCssColor(value));

// Colors オブジェクト内の CSS カスタムプロパティを解決
export const resolveCssColors = (colors: Colors): Colors => ({
  handle: resolveCssColor(colors.handle),
  curve: resolveCssColor(colors.curve),
  sketch: resolveCssColor(colors.sketch),
  border: resolveCssColor(colors.border),
  background: resolveCssColor(colors.background),
  marquee: resolveCssColor(colors.marquee),
  selection: resolveCssColor(colors.selection),
});
