// p5.jsのmouseButtonの型
export type MouseButtonState = {
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
