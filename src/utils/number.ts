/**
 * 数値計算の共通ユーティリティ。
 */

// 値を [min, max] に収める
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
