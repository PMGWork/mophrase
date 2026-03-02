/**
 * スケッチエディタの入力ハンドラー。
 * ポインタ/マウスイベントのリスナー管理とツールへのディスパッチを担当する。
 */

import type p5 from 'p5';
import {
  isLeftMouseButton,
  isPrimaryEditingPointer,
  toEditorPointerInput,
} from '../../utils/input';

// ツールへの入力ディスパッチインターフェース
export interface InputDispatcher {
  getP5(): p5 | null;
  dispatchPress(p: p5, x: number, y: number, shift: boolean): void;
  dispatchDrag(p: p5, x: number, y: number, alt: boolean): void;
  dispatchRelease(): void;
}

// 入力ハンドラー
export class InputHandler {
  private canvas: HTMLCanvasElement | null = null;
  private pointerEventsEnabled: boolean = false;
  private activePointerId: number | null = null;
  private dispatcher: InputDispatcher;

  constructor(dispatcher: InputDispatcher) {
    this.dispatcher = dispatcher;
    this.pointerEventsEnabled =
      typeof window !== 'undefined' && 'PointerEvent' in window;
  }

  // #region 状態アクセス

  isPointerEnabled(): boolean {
    return this.pointerEventsEnabled;
  }

  getActivePointerId(): number | null {
    return this.activePointerId;
  }

  // #region ライフサイクル

  /** キャンバスにアタッチしてリスナーを登録する */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    if (this.pointerEventsEnabled) {
      canvas.style.touchAction = 'none';
      this.addPointerListeners();
    }
  }

  /** リスナーを解除してクリーンアップする */
  destroy(): void {
    if (this.activePointerId !== null) {
      this.releasePointerCapture(this.activePointerId);
    }
    this.removePointerListeners();
    this.activePointerId = null;
    this.canvas = null;
  }

  // #region p5.js マウスフォールバック

  mousePressed(p: p5): void {
    const target = this.getClickTargetFromLocal(p.mouseX, p.mouseY);
    if (shouldIgnoreClick(target)) return;
    if (!isLeftMouseButton(p.mouseButton, p.LEFT)) return;
    this.dispatcher.dispatchPress(p, p.mouseX, p.mouseY, p.keyIsDown(p.SHIFT));
  }

  mouseDragged(p: p5): void {
    const p5Inst = this.dispatcher.getP5();
    if (!p5Inst) return;
    this.dispatcher.dispatchDrag(p, p.mouseX, p.mouseY, p.keyIsDown(p.ALT));
  }

  mouseReleased(): void {
    this.dispatcher.dispatchRelease();
  }

  // #region ポインタイベント

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDown(event);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pointerMove(event);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.pointerEnd(event);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.pointerEnd(event);
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    this.pointerLostCapture(event);
  };

  private pointerDown(event: PointerEvent): void {
    if (this.activePointerId !== null) return;
    const p = this.dispatcher.getP5();
    if (!p) return;
    const canvas = this.canvas;
    if (!canvas) return;

    const input = toEditorPointerInput(event, canvas);
    if (!isPrimaryEditingPointer(input)) return;

    const target = getClickTargetFromClient(input.clientX, input.clientY);
    if (shouldIgnoreClick(target)) return;

    this.activePointerId = input.pointerId;
    this.capturePointer(input.pointerId);
    if (event.cancelable) event.preventDefault();

    this.dispatcher.dispatchPress(p, input.x, input.y, input.shiftKey);
  }

  private pointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    const p = this.dispatcher.getP5();
    if (!p) return;
    const canvas = this.canvas;
    if (!canvas) return;

    const input = toEditorPointerInput(event, canvas);
    if (event.cancelable) event.preventDefault();

    this.dispatcher.dispatchDrag(p, input.x, input.y, input.altKey);
  }

  private pointerEnd(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    if (event.cancelable) event.preventDefault();
    const pointerId = this.activePointerId;
    this.finishPointerInteraction();
    if (pointerId !== null) {
      this.releasePointerCapture(pointerId);
    }
  }

  private pointerLostCapture(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.finishPointerInteraction();
  }

  private finishPointerInteraction(): void {
    if (this.activePointerId === null) return;
    this.dispatcher.dispatchRelease();
    this.activePointerId = null;
  }

  // #region リスナー管理

  private addPointerListeners(): void {
    if (!this.pointerEventsEnabled || !this.canvas) return;
    this.removePointerListeners();
    const options: AddEventListenerOptions = { passive: false };
    this.canvas.addEventListener('pointerdown', this.handlePointerDown, options);
    this.canvas.addEventListener('pointermove', this.handlePointerMove, options);
    this.canvas.addEventListener('pointerup', this.handlePointerUp, options);
    this.canvas.addEventListener(
      'pointercancel',
      this.handlePointerCancel,
      options,
    );
    this.canvas.addEventListener(
      'lostpointercapture',
      this.handleLostPointerCapture,
    );
  }

  private removePointerListeners(): void {
    if (!this.canvas) return;
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener(
      'lostpointercapture',
      this.handleLostPointerCapture,
    );
  }

  // #region ポインタキャプチャ

  private capturePointer(pointerId: number): void {
    if (!this.canvas) return;
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // ignore
    }
  }

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

  // #region クリック判定

  private getClickTargetFromLocal(x: number, y: number): Element | null {
    const rect = this.canvas?.getBoundingClientRect();
    const clientX = (rect?.left ?? 0) + x;
    const clientY = (rect?.top ?? 0) + y;
    return getClickTargetFromClient(clientX, clientY);
  }
}

// クリック対象の要素を取得
function getClickTargetFromClient(
  clientX: number,
  clientY: number,
): Element | null {
  return document.elementFromPoint(clientX, clientY);
}

// UI要素クリック判定
function shouldIgnoreClick(target: Element | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLSelectElement ||
    !!target?.closest('form') ||
    !!target?.closest('#sketchSuggestionContainer') ||
    !!target?.closest('#sidebarContainer')
  );
}
