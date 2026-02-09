// p5.jsのmouseButtonの型
type MouseButtonState = {
  left?: boolean;
  center?: boolean;
  right?: boolean;
};

// p5.jsのmouseButtonがMouseButtonStateかを判定する
function isMouseButtonState(value: unknown): value is MouseButtonState {
  return typeof value === 'object' && value !== null && 'left' in value;
}

// p5.jsのmouseButtonが左クリックかを判定する
export function isLeftMouseButton(
  mouseButton: unknown,
  leftConst: unknown,
): boolean {
  if (isMouseButtonState(mouseButton)) {
    return Boolean(mouseButton.left);
  }

  return mouseButton === leftConst;
}

// 座標が矩形領域内にあるかを判定
export function isInRect(
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  return x >= left && x <= left + width && y >= top && y <= top + height;
}
