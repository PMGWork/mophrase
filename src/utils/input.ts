/**
 * p5.js のマウス入力判定やヒットテストのヘルパー。
 */

// p5.jsのmouseButtonが左クリックかを判定する
export function isLeftMouseButton(
  mouseButton: unknown,
  leftConst: unknown,
): boolean {
  return mouseButton === leftConst;
}

type EditorPointerInput = {
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

function isIPadDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent;
  if (/iPad/i.test(userAgent)) return true;

  // iPadOS 13+ は desktop UA を返すことがあるため、platform とタッチ点数で補完する。
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function toCanvasPoint(
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
  if (isIPadDevice() && input.pointerType !== 'pen') {
    return false;
  }

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
