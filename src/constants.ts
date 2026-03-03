// ベジエ曲線の計算ステップ
export const BEZIER_T_STEP = 0.02;

// オブジェクト
export const OBJECT_SIZE = 50;
const OBJECT_SIZE_BASE_CANVAS_HEIGHT = 720;
const OBJECT_SIZE_MIN = 30;
const OBJECT_SIZE_MAX = 90;

// キャンバスの高さに応じてオブジェクトのサイズを調整する関数
export const resolveObjectSizeFromCanvasHeight = (
  canvasHeight: number,
): number => {
  if (canvasHeight <= 0) return OBJECT_SIZE;

  const scaled = (canvasHeight / OBJECT_SIZE_BASE_CANVAS_HEIGHT) * OBJECT_SIZE;
  return Math.max(OBJECT_SIZE_MIN, Math.min(OBJECT_SIZE_MAX, scaled));
};

// オブジェクトの色（CSS変数）
export const OBJECT_COLORS = [
  'var(--color-object-1)',
  'var(--color-object-2)',
  'var(--color-object-3)',
];

// ハンドルの半径
export const HANDLE_RADIUS = 12;
