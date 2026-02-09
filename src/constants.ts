// ベジエ曲線の計算ステップ
export const BEZIER_T_STEP = 0.02;

import { colors, resolveColor } from './theme/colors';

// オブジェクト
export const OBJECT_SIZE = 50;
export const OBJECT_COLORS = [colors.object1, colors.object2, colors.object3];

export function getResolvedObjectColors(): string[] {
  return [
    resolveColor(colors.object1),
    resolveColor(colors.object2),
    resolveColor(colors.object3),
  ];
}

// ハンドルの半径
export const HANDLE_RADIUS = 12;
