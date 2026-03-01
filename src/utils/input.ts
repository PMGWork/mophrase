/**
 * p5.js のマウス入力判定やヒットテストのヘルパー。
 */

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

export type EditorPointerInput = {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  altKey: boolean;
  shiftKey: boolean;
  button: number;
  buttons: number;
  isPrimary: boolean;
};

export function toCanvasPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function toEditorPointerInput(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
): EditorPointerInput {
  const point = toCanvasPoint(event, canvas);
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    x: point.x,
    y: point.y,
    clientX: event.clientX,
    clientY: event.clientY,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    button: event.button,
    buttons: event.buttons,
    isPrimary: event.isPrimary,
  };
}

export function isPrimaryEditingPointer(input: EditorPointerInput): boolean {
  if (input.pointerType === 'mouse') {
    return input.button === 0 || (input.buttons & 1) === 1;
  }

  return input.isPrimary;
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
