/**
 * 数値計算の共通ユーティリティ。
 */

// 値を [min, max] に収める
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// 小数点以下の桁数を指定して丸める
export function round(value: number, digits = 0): number {
  const safeDigits = Number.isFinite(digits)
    ? Math.max(0, Math.trunc(digits))
    : 0;
  const factor = 10 ** Math.min(safeDigits, 15);
  return Math.round(value * factor) / factor;
}

// 有限値ならそのまま、そうでなければ fallback を返す
export function toFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

// 有限な数値かどうかをチェック
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
