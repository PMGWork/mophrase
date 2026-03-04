/**
 * スケッチエディタの入力ハンドラー。
 * ポインタ/マウスイベントのリスナー管理とツールへのディスパッチを担当する。
 */

import type p5 from 'p5';
import {
  isLeftMouseButton,
  isPrimaryEditingPointer,
  toEditorPointerInput,
} from '../shared/pointerInput';
import { PointerSession } from '../shared/pointerSession';

const IGNORE_CLICK_CONTAINERS = [
  'form',
  '#sketchSuggestionContainer',
  '#sidebarContainer',
] as const;

// ツールへの入力ディスパッチインターフェース
export interface InputDispatcher {
  getP5(): p5 | null;
  dispatchPress(p: p5, x: number, y: number, shift: boolean): void;
  dispatchDrag(
    p: p5,
    x: number,
    y: number,
    alt: boolean,
    invertConstraint: boolean,
  ): void;
  dispatchRelease(): void;
}

const TOUCH_LONG_PRESS_MS = 350;

// 入力ハンドラー
export class InputHandler {
  private canvas: HTMLCanvasElement | null = null;
  private readonly pointerEventsEnabled: boolean;
  private readonly dispatcher: InputDispatcher;
  private readonly pointerSession: PointerSession;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressActive = false;
  private activePointerType: string | null = null;

  constructor(dispatcher: InputDispatcher) {
    this.dispatcher = dispatcher;
    this.pointerEventsEnabled =
      typeof window !== 'undefined' && 'PointerEvent' in window;
    this.pointerSession = new PointerSession({
      onPointerDown: this.pointerDown,
      onPointerMove: this.pointerMove,
      onPointerEnd: this.pointerEnd,
      onPointerLostCapture: this.pointerLostCapture,
    });
  }

  // ポインタイベントが利用可能か
  isPointerEnabled(): boolean {
    return this.pointerEventsEnabled;
  }

  // キャンバスにリスナーをアタッチする
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    if (this.pointerEventsEnabled) {
      canvas.style.touchAction = 'none';
      this.pointerSession.attach(canvas);
    }
  }

  // キャンバスからリスナーをデタッチする
  destroy(): void {
    this.clearLongPressState();
    this.pointerSession.detach();
    this.canvas = null;
  }

  // #region p5.js マウスフォールバック

  mousePressed(p: p5): void {
    if (this.shouldIgnoreClickByLocalPoint(p.mouseX, p.mouseY)) return;
    if (!isLeftMouseButton(p.mouseButton, p.LEFT)) return;
    this.dispatcher.dispatchPress(p, p.mouseX, p.mouseY, p.keyIsDown(p.SHIFT));
  }

  mouseDragged(p: p5): void {
    this.dispatcher.dispatchDrag(
      p,
      p.mouseX,
      p.mouseY,
      p.keyIsDown(p.ALT),
      false,
    );
  }

  mouseReleased(): void {
    this.dispatcher.dispatchRelease();
  }

  // #region ポインタイベント

  private readonly pointerDown = (event: PointerEvent): void => {
    if (this.pointerSession.hasActivePointer()) return;
    const resolved = this.resolvePointerInput(event);
    if (!resolved) return;
    const { p, input } = resolved;

    if (!isPrimaryEditingPointer(input)) return;

    if (
      shouldIgnoreClick(document.elementFromPoint(input.clientX, input.clientY))
    )
      return;

    if (!this.pointerSession.activate(input.pointerId)) return;
    this.pointerSession.preventDefaultIfCancelable(event);
    this.startLongPressTimer(input.pointerType);

    this.dispatcher.dispatchPress(p, input.x, input.y, input.shiftKey);
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.pointerSession.isActivePointer(event.pointerId)) return;
    const resolved = this.resolvePointerInput(event);
    if (!resolved) return;
    const { p, input } = resolved;

    this.pointerSession.preventDefaultIfCancelable(event);

    this.dispatcher.dispatchDrag(
      p,
      input.x,
      input.y,
      input.altKey,
      this.longPressActive,
    );
  };

  private readonly pointerEnd = (event: PointerEvent): void => {
    if (!this.pointerSession.isActivePointer(event.pointerId)) return;
    this.pointerSession.preventDefaultIfCancelable(event);
    this.finishPointerInteraction(true);
  };

  // 何らかの理由でポインタキャプチャが失われた場合の処理
  private readonly pointerLostCapture = (event: PointerEvent): void => {
    if (!this.pointerSession.isActivePointer(event.pointerId)) return;
    this.finishPointerInteraction(false);
  };

  // ポインタ操作の終了処理。
  private finishPointerInteraction(releaseCapture: boolean): void {
    this.clearLongPressState();
    const pointerId = this.pointerSession.finishActivePointer({ releaseCapture });
    if (pointerId === null) return;
    this.dispatcher.dispatchRelease();
  }

  // #region クリック判定

  // 指定したローカル座標が UI 要素の上にあるか判定し、クリックを無視すべきか返す
  private shouldIgnoreClickByLocalPoint(x: number, y: number): boolean {
    const canvas = this.canvas;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + x;
    const clientY = rect.top + y;
    return shouldIgnoreClick(document.elementFromPoint(clientX, clientY));
  }

  // PointerEvent をエディタ専用入力形式に変換し、p5 インスタンスを取得して返す。
  private resolvePointerInput(
    event: PointerEvent,
  ): { p: p5; input: ReturnType<typeof toEditorPointerInput> } | null {
    const p = this.dispatcher.getP5();
    if (!p) return null;
    const canvas = this.canvas;
    if (!canvas) return null;
    return { p, input: toEditorPointerInput(event, canvas) };
  }

  private startLongPressTimer(pointerType: string): void {
    this.clearLongPressState();
    this.activePointerType = pointerType;
    if (pointerType === 'mouse') return;

    this.longPressTimer = setTimeout(() => {
      if (this.activePointerType !== pointerType) return;
      this.longPressActive = true;
    }, TOUCH_LONG_PRESS_MS);
  }

  private clearLongPressState(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressActive = false;
    this.activePointerType = null;
  }

}

// UI要素クリック判定
function shouldIgnoreClick(target: Element | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLSelectElement ||
    IGNORE_CLICK_CONTAINERS.some((selector) => !!target?.closest(selector))
  );
}
