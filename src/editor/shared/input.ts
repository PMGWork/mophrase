/**
 * エディタ共通の入力ユーティリティ。
 * p5 のマウス入力と PointerEvent を同一の座標系・判定ルールに揃える。
 */

// p5.js の mouseButton が「左クリック」かを判定
export function isLeftMouseButton(
  mouseButton: unknown,
  leftConst: unknown,
): boolean {
  return mouseButton === leftConst;
}

// エディタ内で扱う標準化済みポインタ入力
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

// iPad / iPadOS を判定（iPadOS の desktop UA も考慮）
function isIPadDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent;
  if (/iPad/i.test(userAgent)) return true;

  // iPadOS 13+ は desktop UA を返すことがあるため、platform とタッチ点数で補完する。
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

// ビューポート座標をキャンバスローカル座標へ変換
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

// PointerEvent をエディタ内部で扱う入力形式へ正規化
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

// 編集対象として受け付けるポインタか判定（iPad はペン優先）
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
