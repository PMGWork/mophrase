/**
 * スケッチエディタの入力ハンドラー。
 * ポインタ/マウスイベントのリスナー管理とツールへのディスパッチを担当する。
 */

import type p5 from 'p5';
import {
  isLeftMouseButton,
  isPrimaryEditingPointer,
  toEditorPointerInput,
} from '../shared/input';

// ポインタイベントのオプション
const POINTER_LISTENER_OPTIONS: AddEventListenerOptions = { passive: false };
const IGNORE_CLICK_CONTAINERS = [
  'form',
  '#sketchSuggestionContainer',
  '#sidebarContainer',
] as const;

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
  private readonly pointerEventsEnabled: boolean;
  private activePointerId: number | null = null;
  private readonly dispatcher: InputDispatcher;

  constructor(dispatcher: InputDispatcher) {
    this.dispatcher = dispatcher;
    this.pointerEventsEnabled =
      typeof window !== 'undefined' && 'PointerEvent' in window;
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
      this.addPointerListeners();
    }
  }

  // キャンバスからリスナーをデタッチする
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
    if (this.shouldIgnoreClickByLocalPoint(p.mouseX, p.mouseY)) return;
    if (!isLeftMouseButton(p.mouseButton, p.LEFT)) return;
    this.dispatcher.dispatchPress(p, p.mouseX, p.mouseY, p.keyIsDown(p.SHIFT));
  }

  mouseDragged(p: p5): void {
    this.dispatcher.dispatchDrag(p, p.mouseX, p.mouseY, p.keyIsDown(p.ALT));
  }

  mouseReleased(): void {
    this.dispatcher.dispatchRelease();
  }

  // #region ポインタイベント

  private readonly pointerDown = (event: PointerEvent): void => {
    if (this.activePointerId !== null) return;
    const resolved = this.resolvePointerInput(event);
    if (!resolved) return;
    const { p, input } = resolved;

    if (!isPrimaryEditingPointer(input)) return;

    if (
      shouldIgnoreClick(document.elementFromPoint(input.clientX, input.clientY))
    )
      return;

    this.activePointerId = input.pointerId;
    this.capturePointer(input.pointerId);
    this.preventDefaultIfCancelable(event);

    this.dispatcher.dispatchPress(p, input.x, input.y, input.shiftKey);
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.isActivePointer(event.pointerId)) return;
    const resolved = this.resolvePointerInput(event);
    if (!resolved) return;
    const { p, input } = resolved;

    this.preventDefaultIfCancelable(event);

    this.dispatcher.dispatchDrag(p, input.x, input.y, input.altKey);
  };

  private readonly pointerEnd = (event: PointerEvent): void => {
    if (!this.isActivePointer(event.pointerId)) return;
    this.preventDefaultIfCancelable(event);
    this.finishPointerInteraction(true);
  };

  // 何らかの理由でポインタキャプチャが失われた場合の処理
  private readonly pointerLostCapture = (event: PointerEvent): void => {
    if (!this.isActivePointer(event.pointerId)) return;
    this.finishPointerInteraction(false);
  };

  // ポインタ操作の終了処理。
  private finishPointerInteraction(releaseCapture: boolean): void {
    const pointerId = this.activePointerId;
    if (pointerId === null) return;
    this.dispatcher.dispatchRelease();
    this.activePointerId = null;
    if (releaseCapture) {
      this.releasePointerCapture(pointerId);
    }
  }

  // #region リスナー管理

  // キャンバスに対してポインタイベントリスナーを追加する
  private addPointerListeners(): void {
    if (!this.pointerEventsEnabled || !this.canvas) return;
    this.removePointerListeners();
    this.canvas.addEventListener(
      'pointerdown',
      this.pointerDown,
      POINTER_LISTENER_OPTIONS,
    );
    this.canvas.addEventListener(
      'pointermove',
      this.pointerMove,
      POINTER_LISTENER_OPTIONS,
    );
    this.canvas.addEventListener(
      'pointerup',
      this.pointerEnd,
      POINTER_LISTENER_OPTIONS,
    );
    this.canvas.addEventListener(
      'pointercancel',
      this.pointerEnd,
      POINTER_LISTENER_OPTIONS,
    );
    this.canvas.addEventListener('lostpointercapture', this.pointerLostCapture);
  }

  // キャンバスからすべてのポインタイベントリスナーを削除する
  private removePointerListeners(): void {
    if (!this.canvas) return;
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerEnd);
    this.canvas.removeEventListener('pointercancel', this.pointerEnd);
    this.canvas.removeEventListener(
      'lostpointercapture',
      this.pointerLostCapture,
    );
  }

  // #region ポインタキャプチャ

  // ポインタキャプチャを取得。例外は無視して安全に呼び出せるようにする
  private capturePointer(pointerId: number): void {
    if (!this.canvas) return;
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // ignore
    }
  }

  // ポインタキャプチャの解除。保持しているかをチェックしてから呼ぶ
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

  // 与えられたポインタ ID が現在操作中のポインタと一致するかチェック
  private isActivePointer(pointerId: number): boolean {
    return this.activePointerId === pointerId;
  }

  // イベントがキャンセル可能であれば preventDefault を呼び出すユーティリティ
  private preventDefaultIfCancelable(event: PointerEvent): void {
    if (event.cancelable) event.preventDefault();
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
