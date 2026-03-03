/**
 * エディタ共通の PointerEvent セッション管理。
 * activePointerId と pointer capture、リスナー登録/解除を一元化する。
 */

const POINTER_LISTENER_OPTIONS: AddEventListenerOptions = { passive: false };

// PointerSession が受け取るイベントコールバック群
type PointerSessionHandlers = {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerEnd: (event: PointerEvent) => void;
  onPointerLostCapture: (event: PointerEvent) => void;
};

// 単一ポインタ操作を追跡するセッション
export class PointerSession {
  private canvas: HTMLCanvasElement | null = null;
  private activePointerId: number | null = null;
  private readonly handlers: PointerSessionHandlers;

  // 呼び出し側で定義したハンドラを保持
  constructor(handlers: PointerSessionHandlers) {
    this.handlers = handlers;
  }

  // セッション対象のキャンバスへリスナーを登録
  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    this.canvas = canvas;
    canvas.addEventListener(
      'pointerdown',
      this.handlers.onPointerDown,
      POINTER_LISTENER_OPTIONS,
    );
    canvas.addEventListener(
      'pointermove',
      this.handlers.onPointerMove,
      POINTER_LISTENER_OPTIONS,
    );
    canvas.addEventListener(
      'pointerup',
      this.handlers.onPointerEnd,
      POINTER_LISTENER_OPTIONS,
    );
    canvas.addEventListener(
      'pointercancel',
      this.handlers.onPointerEnd,
      POINTER_LISTENER_OPTIONS,
    );
    canvas.addEventListener(
      'lostpointercapture',
      this.handlers.onPointerLostCapture,
    );
  }

  // リスナー解除とセッション終了
  detach(): void {
    // 操作中ポインタが残っていれば capture を明示的に解放
    if (this.activePointerId !== null) {
      this.releasePointerCapture(this.activePointerId);
    }

    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.handlers.onPointerDown);
      canvas.removeEventListener('pointermove', this.handlers.onPointerMove);
      canvas.removeEventListener('pointerup', this.handlers.onPointerEnd);
      canvas.removeEventListener('pointercancel', this.handlers.onPointerEnd);
      canvas.removeEventListener(
        'lostpointercapture',
        this.handlers.onPointerLostCapture,
      );
    }

    this.canvas = null;
    this.activePointerId = null;
  }

  // セッション開始
  activate(pointerId: number): boolean {
    if (this.activePointerId !== null) return false;
    this.activePointerId = pointerId;
    this.capturePointer(pointerId);
    return true;
  }

  // セッション終了
  finishActivePointer(options: { releaseCapture: boolean }): number | null {
    const pointerId = this.activePointerId;
    if (pointerId === null) return null;
    this.activePointerId = null;
    if (options.releaseCapture) {
      this.releasePointerCapture(pointerId);
    }
    return pointerId;
  }

  // lostpointercapture 等で capture 解放済みの場合に使う
  clearActivePointer(): void {
    this.activePointerId = null;
  }

  // 何らかのポインタ操作が進行中か
  hasActivePointer(): boolean {
    return this.activePointerId !== null;
  }

  // 指定 ID が現在の操作対象ポインタか
  isActivePointer(pointerId: number): boolean {
    return this.activePointerId === pointerId;
  }

  // cancelable なイベントのみ preventDefault する安全ヘルパー
  preventDefaultIfCancelable(event: PointerEvent): void {
    if (event.cancelable) event.preventDefault();
  }

  // setPointerCapture を安全に実行
  private capturePointer(pointerId: number): void {
    if (!this.canvas) return;
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // ignore
    }
  }

  // releasePointerCapture を安全に実行
  private releasePointerCapture(pointerId: number): void {
    if (!this.canvas) return;
    try {
      if (this.canvas.hasPointerCapture(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
  }
}
