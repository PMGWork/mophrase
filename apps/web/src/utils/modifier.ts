/**
 * モディファイアの作成・適用・更新・削除。
 * LLM提案による空間・時間の差分をキーフレーム単位で管理し、強度で制御する。
 */

import type p5 from 'p5';
import type {
  GraphKeyframeDelta,
  GraphModifier,
  Keyframe,
  SelectionRange,
  SketchKeyframeDelta,
  SketchModifier,
} from '../types';
import {
  buildSketchCurves,
  computeKeyframeProgress,
  splitKeyframeSegment,
} from './keyframes';
import { isGraphCorner } from './keyframeCorner';
import { clamp } from './math';

const MIN_TIME_STEP = 1e-4;
const DELTA_EPSILON = 1e-9;
const MIN_DURATION_SCALE = 0.1;
const MAX_DURATION_SCALE = 10;

// #region 適用

// スケッチモディファイアを適用
export function applySketchModifiers(
  curves: p5.Vector[][],
  keyframes: Keyframe[],
  modifiers: SketchModifier[] | undefined,
  p?: p5,
): p5.Vector[][] {
  if (!modifiers || modifiers.length === 0) return curves;

  // キーフレームごとに位置・ハンドルの累積デルタを計算
  const posDelta = zeroVecs(keyframes.length);
  const outDelta = zeroVecs(keyframes.length);
  const inDelta = zeroVecs(keyframes.length);

  for (const modifier of modifiers) {
    const len = Math.min(modifier.deltas.length, keyframes.length);
    for (let idx = 0; idx < len; idx++) {
      const deltas = modifier.deltas[idx];
      accumulateDelta(posDelta[idx], deltas.posDelta, modifier.strength);
      accumulateDelta(outDelta[idx], deltas.outDelta, modifier.strength);
      accumulateDelta(inDelta[idx], deltas.inDelta, modifier.strength);
    }
  }

  // 各カーブにデルタを適用
  return curves.map((curve, i) => {
    const dp0 = posDelta[i];
    const dp3 = posDelta[i + 1];
    const out = outDelta[i];
    const inn = inDelta[i + 1];

    const offsets = [
      { x: dp0.x, y: dp0.y },
      { x: dp0.x + out.x, y: dp0.y + out.y },
      { x: dp3.x + inn.x, y: dp3.y + inn.y },
      { x: dp3.x, y: dp3.y },
    ];

    if (offsets.every((o) => o.x === 0 && o.y === 0)) return curve;

    return curve.map((point, j) => {
      const o = offsets[j];
      if (o.x === 0 && o.y === 0) return point;
      return offsetPoint(point, o.x, o.y, p);
    });
  });
}

// グラフモディファイアを適用
export function applyGraphModifiers(
  curves: p5.Vector[][],
  keyframes: Keyframe[],
  modifiers: GraphModifier[] | undefined,
  p?: p5,
): p5.Vector[][] {
  if (!modifiers || modifiers.length === 0) return curves;

  // キーフレームごとにハンドルの累積デルタを計算
  const outDelta = zeroVecs(keyframes.length);
  const inDelta = zeroVecs(keyframes.length);

  for (const mod of modifiers) {
    const len = Math.min(mod.deltas.length, keyframes.length);
    for (let idx = 0; idx < len; idx++) {
      const d = mod.deltas[idx];
      accumulateDelta(outDelta[idx], d.outDelta, mod.strength);
      accumulateDelta(inDelta[idx], d.inDelta, mod.strength);
    }
  }

  // 各カーブにデルタを適用
  return curves.map((curve, i) => {
    const out = outDelta[i];
    const inn = inDelta[i + 1];

    if (out.x === 0 && out.y === 0 && inn.x === 0 && inn.y === 0) return curve;

    return curve.map((point, j) => {
      let dx = 0;
      let dy = 0;
      if (j === 1) {
        dx = out.x;
        dy = out.y;
      } else if (j === 2) {
        dx = inn.x;
        dy = inn.y;
      }
      if (dx === 0 && dy === 0) return point;
      return offsetPoint(point, dx, dy, p);
    });
  });
}

// GraphModifier を加味した実効時刻（0-1, 単調増加）を解決
export function resolveEffectiveTimes(
  keyframes: Keyframe[],
  modifiers: GraphModifier[] | undefined,
): number[] {
  if (keyframes.length === 0) return [];
  if (keyframes.length === 1) return [0];

  const { baseTimes, rawTimes, hasTimeDelta } = resolveRawTimes(
    keyframes,
    modifiers,
  );

  if (!hasTimeDelta) return baseTimes;
  const span = rawTimes[rawTimes.length - 1] - rawTimes[0];
  let normalized: number[];
  if (!Number.isFinite(span) || span < MIN_TIME_STEP) {
    normalized = evenTimes(rawTimes.length);
  } else {
    normalized = rawTimes.map((time) => (time - rawTimes[0]) / span);
  }

  if (MIN_TIME_STEP * (normalized.length - 1) >= 1) {
    return evenTimes(normalized.length);
  }

  normalized[0] = 0;
  normalized[normalized.length - 1] = 1;
  for (let i = 1; i < normalized.length; i++) {
    normalized[i] = clamp(normalized[i], 0, 1);
    const minimum = normalized[i - 1] + MIN_TIME_STEP;
    if (normalized[i] < minimum) normalized[i] = minimum;
  }

  normalized[normalized.length - 1] = 1;
  for (let i = normalized.length - 2; i >= 0; i--) {
    const maximum = normalized[i + 1] - MIN_TIME_STEP;
    if (normalized[i] > maximum) normalized[i] = maximum;
  }

  normalized[0] = 0;
  normalized[normalized.length - 1] = 1;
  return normalized;
}

// GraphModifier を加味した全体時間スケール（path.duration 乗算用）を解決
export function resolveEffectiveDurationScale(
  keyframes: Keyframe[],
  modifiers: GraphModifier[] | undefined,
): number {
  if (keyframes.length < 2) return 1;

  const { baseTimes, rawTimes, hasTimeDelta } = resolveRawTimes(
    keyframes,
    modifiers,
  );
  if (!hasTimeDelta) return 1;

  const baseSpan = baseTimes[baseTimes.length - 1] - baseTimes[0];
  const rawSpan = rawTimes[rawTimes.length - 1] - rawTimes[0];

  if (!Number.isFinite(baseSpan) || Math.abs(baseSpan) < MIN_TIME_STEP) {
    return 1;
  }
  if (!Number.isFinite(rawSpan) || rawSpan <= 0) return 1;

  const scale = rawSpan / baseSpan;
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return clamp(scale, MIN_DURATION_SCALE, MAX_DURATION_SCALE);
}

// #region 作成

// LLMの出力からスケッチモディファイアを作成
export function createSketchModifier(
  keyframes: Keyframe[],
  modifiedKeyframes: Keyframe[],
  name: string,
  selectionRange?: SelectionRange,
): SketchModifier {
  const focusedIndex = selectionRange?.anchorKeyframeIndex;

  // 単一アンカー選択時は、そのアンカーのみ差分化する
  if (focusedIndex !== undefined) {
    const deltas: SketchKeyframeDelta[] = keyframes.map(() => ({}));
    const index = Math.max(0, Math.min(keyframes.length - 1, focusedIndex));
    const original = keyframes[index];
    const modified = modifiedKeyframes[0];

    if (original && modified) {
      const delta = deltas[index];
      const pos = diffVec2(modified.position, original.position);
      if (pos) delta.posDelta = pos;

      const inDelta = diffVec2(modified.sketchIn, original.sketchIn, {
        treatUndefinedAsZero: true,
      });
      if (inDelta) delta.inDelta = inDelta;

      const outDelta = diffVec2(modified.sketchOut, original.sketchOut, {
        treatUndefinedAsZero: true,
      });
      if (outDelta) delta.outDelta = outDelta;
    }

    return { id: globalThis.crypto.randomUUID(), name, strength: 1.0, deltas };
  }

  const startIndex = selectionRange?.startCurveIndex ?? 0;
  const endIndex =
    selectionRange?.endCurveIndex ?? Math.max(0, keyframes.length - 2);

  // 密配列: deltas[i] が keyframes[i] に対応
  const deltas: SketchKeyframeDelta[] = keyframes.map(() => ({}));

  // 各キーフレームに対してデルタを計算
  for (let i = startIndex; i <= endIndex + 1; i++) {
    if (i >= keyframes.length) break;

    const localIndex = i - startIndex;
    if (localIndex < 0 || localIndex >= modifiedKeyframes.length) continue;
    const original = keyframes[i];
    const modified = modifiedKeyframes[localIndex];
    if (!original || !modified) continue;
    const delta = deltas[i];

    // positionデルタ
    const pos = diffVec2(modified.position, original.position);
    if (pos) delta.posDelta = pos;

    // outデルタ（外側ハンドルを含む）
    if (i < keyframes.length - 1) {
      const v = diffVec2(modified.sketchOut, original.sketchOut, {
        treatUndefinedAsZero: true,
      });
      if (v) delta.outDelta = v;
    }

    // inデルタ（外側ハンドルを含む）
    if (i > 0) {
      const v = diffVec2(modified.sketchIn, original.sketchIn, {
        treatUndefinedAsZero: true,
      });
      if (v) delta.inDelta = v;
    }
  }

  return { id: globalThis.crypto.randomUUID(), name, strength: 1.0, deltas };
}

// LLMの出力からグラフモディファイアを作成
export function createGraphModifier(
  keyframes: Keyframe[],
  progress: number[],
  modifiedKeyframes: Keyframe[],
  modifiedProgress: number[],
  name: string,
  selectionRange?: SelectionRange,
): GraphModifier {
  const focusedIndex = selectionRange?.anchorKeyframeIndex;

  // 単一アンカー選択時は、そのアンカーの入出グラフハンドルのみ差分化する
  if (focusedIndex !== undefined) {
    const deltas: GraphKeyframeDelta[] = keyframes.map(() => ({}));
    const index = Math.max(0, Math.min(keyframes.length - 1, focusedIndex));
    const delta = deltas[index];
    const original = keyframes[index];
    const modified = modifiedKeyframes[0];

    const outDelta = diffGraphOutHandle(
      keyframes,
      progress,
      index,
      modifiedKeyframes,
      modifiedProgress,
      0,
    );
    if (outDelta) delta.outDelta = outDelta;

    const inDelta = diffGraphInHandle(
      keyframes,
      progress,
      index,
      modifiedKeyframes,
      modifiedProgress,
      0,
    );
    if (inDelta) delta.inDelta = inDelta;

    if (original && modified) {
      const timeDelta = diffScalar(modified.time, original.time);
      if (timeDelta !== undefined) delta.timeDelta = timeDelta;
    }

    return { id: globalThis.crypto.randomUUID(), name, strength: 1.0, deltas };
  }

  const maxCurveIndex = Math.max(0, keyframes.length - 2);
  const startIndex = Math.max(
    0,
    Math.min(maxCurveIndex, selectionRange?.startCurveIndex ?? 0),
  );
  const endIndex = Math.max(
    startIndex,
    Math.min(maxCurveIndex, selectionRange?.endCurveIndex ?? maxCurveIndex),
  );
  const isScopedRange = !!selectionRange;
  const rangeAlignedModifiedKeyframes = isScopedRange
    ? alignRangeStartTime(keyframes, modifiedKeyframes, startIndex)
    : modifiedKeyframes;
  const adjustedModifiedKeyframes = expandTrailingModifiedTimes(
    keyframes,
    rangeAlignedModifiedKeyframes,
    startIndex,
    endIndex,
  );
  const adjustedModifiedCurves = buildSketchCurves(adjustedModifiedKeyframes);
  const adjustedModifiedProgress = computeKeyframeProgress(
    adjustedModifiedKeyframes,
    adjustedModifiedCurves,
  );

  // 密配列: deltas[i] が keyframes[i] に対応
  const deltas: GraphKeyframeDelta[] = keyframes.map(() => ({}));

  // 各キーフレームに対してデルタを計算
  for (let i = startIndex; i <= endIndex + 1; i++) {
    if (i >= keyframes.length) break;

    const localIndex = i - startIndex;
    if (localIndex < 0 || localIndex >= adjustedModifiedKeyframes.length)
      continue;
    const delta = deltas[i];
    const rangeBoundaryStart = startIndex;
    const rangeBoundaryEnd = endIndex + 1;
    const shouldWriteOut =
      i < keyframes.length - 1 && (!isScopedRange || i !== rangeBoundaryEnd);
    const shouldWriteIn = i > 0 && (!isScopedRange || i !== rangeBoundaryStart);
    const shouldWriteTimeDelta = !isScopedRange || i !== rangeBoundaryStart;

    // outデルタ（外側ハンドルを含む）
    if (shouldWriteOut) {
      const v = diffGraphOutHandle(
        keyframes,
        progress,
        i,
        adjustedModifiedKeyframes,
        adjustedModifiedProgress,
        localIndex,
      );
      if (v) delta.outDelta = v;
    }

    // inデルタ（外側ハンドルを含む）
    if (shouldWriteIn) {
      const v = diffGraphInHandle(
        keyframes,
        progress,
        i,
        adjustedModifiedKeyframes,
        adjustedModifiedProgress,
        localIndex,
      );
      if (v) delta.inDelta = v;
    }

    if (shouldWriteTimeDelta) {
      const original = keyframes[i];
      const modified = adjustedModifiedKeyframes[localIndex];
      const timeDelta = diffScalar(modified?.time, original?.time);
      if (timeDelta !== undefined) delta.timeDelta = timeDelta;
    }
  }

  return { id: globalThis.crypto.randomUUID(), name, strength: 1.0, deltas };
}

// #region 分割

// パス分割に合わせて SketchModifier の deltas を挿入
export function splitSketchModifierDeltas(
  modifiers: SketchModifier[] | undefined,
  keyframes: Keyframe[],
  segmentIndex: number,
  t: number,
): void {
  if (!modifiers || modifiers.length === 0) return;

  const clampedT = clamp(Number.isFinite(t) ? t : 0.5, 0, 1);
  const insertIndex = segmentIndex + 1;
  const endIndex = insertIndex + 1;
  const baseSplit = splitKeyframeSegment(keyframes, segmentIndex, clampedT);

  // 各モディファイアに対してデルタを挿入・更新
  for (const modifier of modifiers) {
    // デルタ配列を現在の長さに揃える
    fitDenseDeltas(modifier.deltas, keyframes.length, () => ({}));

    // モディファイア適応後の分割結果を計算
    const modified = computeSketchModified(keyframes, modifier);
    const modifiedSplit = splitKeyframeSegment(
      modified,
      segmentIndex,
      clampedT,
    );

    // 新しいデルタを挿入して配列を拡張
    modifier.deltas.splice(insertIndex, 0, {});
    fitDenseDeltas(modifier.deltas, baseSplit.length, () => ({}));

    const startDelta = modifier.deltas[segmentIndex] ?? {};
    const insertedDelta = modifier.deltas[insertIndex] ?? {};
    const endDelta = modifier.deltas[endIndex] ?? {};

    // 開始点: 出力ハンドルのみ更新
    startDelta.outDelta = diffVec2(
      modifiedSplit[segmentIndex]?.sketchOut,
      baseSplit[segmentIndex]?.sketchOut,
      { treatUndefinedAsZero: true },
    );

    // 挿入点: 位置と両ハンドルを更新
    insertedDelta.posDelta = diffVec2(
      modifiedSplit[insertIndex]?.position,
      baseSplit[insertIndex]?.position,
    );
    insertedDelta.inDelta = diffVec2(
      modifiedSplit[insertIndex]?.sketchIn,
      baseSplit[insertIndex]?.sketchIn,
      { treatUndefinedAsZero: true },
    );
    insertedDelta.outDelta = diffVec2(
      modifiedSplit[insertIndex]?.sketchOut,
      baseSplit[insertIndex]?.sketchOut,
      { treatUndefinedAsZero: true },
    );

    // 終点: 入力ハンドルのみ更新
    endDelta.inDelta = diffVec2(
      modifiedSplit[endIndex]?.sketchIn,
      baseSplit[endIndex]?.sketchIn,
      { treatUndefinedAsZero: true },
    );

    // 更新を反映
    modifier.deltas[segmentIndex] = startDelta;
    modifier.deltas[insertIndex] = insertedDelta;
    modifier.deltas[endIndex] = endDelta;
  }
}

// パス分割に合わせて GraphModifier の deltas を挿入
export function splitGraphModifierDeltas(
  modifiers: GraphModifier[] | undefined,
  keyframes: Keyframe[],
  segmentIndex: number,
  t: number,
): void {
  if (!modifiers || modifiers.length === 0) return;

  const clampedT = clamp(Number.isFinite(t) ? t : 0.5, 0, 1);
  const insertIndex = segmentIndex + 1;
  const endIndex = insertIndex + 1;
  const baseSplit = splitKeyframeSegment(keyframes, segmentIndex, clampedT);

  for (const modifier of modifiers) {
    // デルタ配列を現在の長さに揃える
    fitDenseDeltas(modifier.deltas, keyframes.length, () => ({}));

    // モディファイア適応後の分割結果を計算
    const modified = computeGraphModified(keyframes, modifier);
    const modifiedSplit = splitKeyframeSegment(
      modified,
      segmentIndex,
      clampedT,
    );

    // 新しいデルタを挿入して配列を拡張
    modifier.deltas.splice(insertIndex, 0, {});
    fitDenseDeltas(modifier.deltas, baseSplit.length, () => ({}));

    const startDelta = modifier.deltas[segmentIndex] ?? {};
    const insertedDelta = modifier.deltas[insertIndex] ?? {};
    const endDelta = modifier.deltas[endIndex] ?? {};

    // 開始点: 出力ハンドルのみ更新
    startDelta.outDelta = diffVec2(
      modifiedSplit[segmentIndex]?.graphOut,
      baseSplit[segmentIndex]?.graphOut,
      { treatUndefinedAsZero: true },
    );

    // 挿入点: 両ハンドルを更新
    insertedDelta.inDelta = diffVec2(
      modifiedSplit[insertIndex]?.graphIn,
      baseSplit[insertIndex]?.graphIn,
      { treatUndefinedAsZero: true },
    );
    insertedDelta.outDelta = diffVec2(
      modifiedSplit[insertIndex]?.graphOut,
      baseSplit[insertIndex]?.graphOut,
      { treatUndefinedAsZero: true },
    );
    insertedDelta.timeDelta = diffScalar(
      modifiedSplit[insertIndex]?.time,
      baseSplit[insertIndex]?.time,
    );

    // 終点: 入力ハンドルのみ更新
    endDelta.inDelta = diffVec2(
      modifiedSplit[endIndex]?.graphIn,
      baseSplit[endIndex]?.graphIn,
      { treatUndefinedAsZero: true },
    );

    // 更新を反映
    modifier.deltas[segmentIndex] = startDelta;
    modifier.deltas[insertIndex] = insertedDelta;
    modifier.deltas[endIndex] = endDelta;
  }
}

// #region 更新・削除

// モディファイアの影響度を更新
export function updateModifierStrength(
  modifiers: { id: string; strength: number }[] | undefined,
  modifierId: string,
  strength: number,
): void {
  if (!modifiers) return;
  const modifier = modifiers.find((m) => m.id === modifierId);
  if (modifier) modifier.strength = clamp(strength, 0, 2);
}

// モディファイアを削除
export function removeModifier<T extends { id: string }>(
  modifiers: T[] | undefined,
  modifierId: string,
): T[] {
  if (!modifiers) return [];
  return modifiers.filter((m) => m.id !== modifierId);
}

// #region ヘルパー

// ゼロ初期化された { x, y } 配列を作成
function zeroVecs(length: number): { x: number; y: number }[] {
  return Array.from({ length }, () => ({ x: 0, y: 0 }));
}

// デルタを累積加算
function accumulateDelta(
  target: { x: number; y: number },
  delta: { x: number; y: number } | undefined,
  strength: number,
): void {
  if (!delta) return;
  target.x += delta.x * strength;
  target.y += delta.y * strength;
}

// strength=1 として SketchModifier を適用したキーフレーム配列を生成
function computeSketchModified(
  keyframes: Keyframe[],
  modifier: SketchModifier,
): Keyframe[] {
  return keyframes.map((keyframe, idx) => {
    const delta = modifier.deltas[idx];
    return {
      ...keyframe,
      position: addPositionDelta(keyframe.position, delta?.posDelta),
      sketchIn: addHandleDelta(
        keyframe.sketchIn,
        delta?.inDelta,
        keyframe.position,
      ),
      sketchOut: addHandleDelta(
        keyframe.sketchOut,
        delta?.outDelta,
        keyframe.position,
      ),
      graphIn: keyframe.graphIn?.copy(),
      graphOut: keyframe.graphOut?.copy(),
    };
  });
}

// strength=1 として GraphModifier を適用したキーフレーム配列を生成
function computeGraphModified(
  keyframes: Keyframe[],
  modifier: GraphModifier,
): Keyframe[] {
  return keyframes.map((keyframe, idx) => {
    const delta = modifier.deltas[idx];
    return {
      ...keyframe,
      position: keyframe.position.copy(),
      sketchIn: keyframe.sketchIn?.copy(),
      sketchOut: keyframe.sketchOut?.copy(),
      graphIn: addHandleDelta(
        keyframe.graphIn,
        delta?.inDelta,
        keyframe.position,
      ),
      graphOut: addHandleDelta(
        keyframe.graphOut,
        delta?.outDelta,
        keyframe.position,
      ),
      time: addTimeDelta(keyframe.time, delta?.timeDelta),
    };
  });
}

// 密配列の長さを指定値に合わせる
function fitDenseDeltas<T extends object>(
  deltas: T[],
  targetLength: number,
  createDelta: () => T,
): void {
  while (deltas.length < targetLength) deltas.push(createDelta());
  if (deltas.length > targetLength) deltas.length = targetLength;
}

// position に delta を加算した新ベクトルを作成
function addPositionDelta(
  position: p5.Vector,
  delta: { x: number; y: number } | undefined,
): p5.Vector {
  if (!delta) return position.copy();
  return position.copy().add(delta.x, delta.y);
}

// handle に delta を加算して正規化
function addHandleDelta(
  handle: p5.Vector | undefined,
  delta: { x: number; y: number } | undefined,
  template: p5.Vector,
): p5.Vector | undefined {
  const x = (handle?.x ?? 0) + (delta?.x ?? 0);
  const y = (handle?.y ?? 0) + (delta?.y ?? 0);
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return undefined;
  const base = handle ?? template;
  return base.copy().set(x, y);
}

// 2ベクトル差分
function diffVec2(
  a: p5.Vector | undefined,
  b: p5.Vector | undefined,
  options?: { treatUndefinedAsZero?: boolean },
): { x: number; y: number } | undefined {
  const treatUndefinedAsZero = options?.treatUndefinedAsZero ?? false;
  if (!treatUndefinedAsZero && (!a || !b)) return undefined;
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return undefined;
  return { x: dx, y: dy };
}

function diffGraphOutHandle(
  keyframes: Keyframe[],
  progress: number[],
  index: number,
  modifiedKeyframes: Keyframe[],
  modifiedProgress: number[],
  modifiedIndex: number,
): { x: number; y: number } | undefined {
  const original = keyframes[index];
  const modified = modifiedKeyframes[modifiedIndex];
  if (!original || !modified) return undefined;
  if (!original.graphOut && !modified.graphOut) return undefined;

  const originalOut = resolveGraphOutHandle(keyframes, progress, index);
  const modifiedOut = resolveGraphOutHandle(
    modifiedKeyframes,
    modifiedProgress,
    modifiedIndex,
  );
  if (!originalOut || !modifiedOut) return undefined;
  return diffVec2(modifiedOut, originalOut);
}

function diffGraphInHandle(
  keyframes: Keyframe[],
  progress: number[],
  index: number,
  modifiedKeyframes: Keyframe[],
  modifiedProgress: number[],
  modifiedIndex: number,
): { x: number; y: number } | undefined {
  const original = keyframes[index];
  const modified = modifiedKeyframes[modifiedIndex];
  if (!original || !modified) return undefined;
  if (!original.graphIn && !modified.graphIn) return undefined;

  const originalIn = resolveGraphInHandle(keyframes, progress, index);
  const modifiedIn = resolveGraphInHandle(
    modifiedKeyframes,
    modifiedProgress,
    modifiedIndex,
  );
  if (!originalIn || !modifiedIn) return undefined;
  return diffVec2(modifiedIn, originalIn);
}

function diffScalar(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  if (typeof a !== 'number' || typeof b !== 'number') return undefined;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const delta = a - b;
  if (Math.abs(delta) < DELTA_EPSILON) return undefined;
  return delta;
}

function addTimeDelta(time: number, delta: number | undefined): number {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return time;
  const next = time + delta;
  return Number.isFinite(next) ? next : time;
}

function evenTimes(length: number): number[] {
  if (length <= 1) return [0];
  return Array.from({ length }, (_, index) => index / (length - 1));
}

function resolveRawTimes(
  keyframes: Keyframe[],
  modifiers: GraphModifier[] | undefined,
): { baseTimes: number[]; rawTimes: number[]; hasTimeDelta: boolean } {
  const baseTimes = keyframes.map((keyframe, index) =>
    Number.isFinite(keyframe.time)
      ? keyframe.time
      : index / Math.max(1, keyframes.length - 1),
  );
  const rawTimes = [...baseTimes];
  let hasTimeDelta = false;

  if (modifiers && modifiers.length > 0) {
    for (const modifier of modifiers) {
      const len = Math.min(modifier.deltas.length, keyframes.length);
      const beforeModifierTimes = [...rawTimes];
      let lastSignificantIndex = -1;

      for (let idx = 0; idx < len; idx++) {
        const delta = modifier.deltas[idx]?.timeDelta;
        if (typeof delta !== 'number' || !Number.isFinite(delta)) continue;
        const weighted = delta * modifier.strength;
        if (Math.abs(weighted) < DELTA_EPSILON) continue;
        rawTimes[idx] += weighted;
        hasTimeDelta = true;
        lastSignificantIndex = idx;
      }

      // 最後に編集された時刻オフセットを末尾まで伝播させる。
      // これにより「一部区間を伸ばしたら後続を圧縮せず、全体長を増やす」挙動にする。
      if (lastSignificantIndex >= 0 && lastSignificantIndex < len - 1) {
        const tailWeighted =
          rawTimes[lastSignificantIndex] -
          beforeModifierTimes[lastSignificantIndex];
        if (Math.abs(tailWeighted) >= DELTA_EPSILON) {
          for (let idx = lastSignificantIndex + 1; idx < len; idx++) {
            rawTimes[idx] += tailWeighted;
          }
          hasTimeDelta = true;
        }
      }
    }
  }

  if (!hasTimeDelta) {
    return { baseTimes, rawTimes: baseTimes, hasTimeDelta };
  }

  for (let i = 1; i < rawTimes.length; i++) {
    const minimum = rawTimes[i - 1] + MIN_TIME_STEP;
    if (!Number.isFinite(rawTimes[i]) || rawTimes[i] < minimum) {
      rawTimes[i] = minimum;
    }
  }

  return { baseTimes, rawTimes, hasTimeDelta };
}

function alignRangeStartTime(
  keyframes: Keyframe[],
  modifiedKeyframes: Keyframe[],
  startIndex: number,
): Keyframe[] {
  if (modifiedKeyframes.length === 0) return modifiedKeyframes;
  const originalStartTime = keyframes[startIndex]?.time;
  if (
    typeof originalStartTime !== 'number' ||
    !Number.isFinite(originalStartTime)
  ) {
    return modifiedKeyframes.map(cloneGraphComparableKeyframe);
  }

  return modifiedKeyframes.map((keyframe, localIndex) => {
    const aligned = cloneGraphComparableKeyframe(keyframe);
    if (localIndex === 0) {
      aligned.time = originalStartTime;
    }
    return aligned;
  });
}

function expandTrailingModifiedTimes(
  keyframes: Keyframe[],
  modifiedKeyframes: Keyframe[],
  startIndex: number,
  endIndex: number,
): Keyframe[] {
  if (modifiedKeyframes.length === 0) return modifiedKeyframes;
  const expanded = modifiedKeyframes.map(cloneGraphComparableKeyframe);
  const maxGlobalIndex = Math.min(endIndex + 1, keyframes.length - 1);
  const maxLocalIndex = Math.min(
    expanded.length - 1,
    Math.max(0, maxGlobalIndex - startIndex),
  );

  let lastSignificantLocalIndex = -1;
  let lastSignificantDelta = 0;
  for (let localIndex = 0; localIndex <= maxLocalIndex; localIndex++) {
    const globalIndex = startIndex + localIndex;
    const original = keyframes[globalIndex];
    const modified = expanded[localIndex];
    const delta = diffScalar(modified?.time, original?.time);
    if (delta === undefined) continue;
    lastSignificantLocalIndex = localIndex;
    lastSignificantDelta = delta;
  }

  if (
    lastSignificantLocalIndex < 0 ||
    lastSignificantLocalIndex >= maxLocalIndex
  ) {
    return expanded;
  }

  const boundaryStart = expanded[lastSignificantLocalIndex];
  const boundaryEnd = expanded[lastSignificantLocalIndex + 1];
  const oldDt = (boundaryEnd?.time ?? 0) - (boundaryStart?.time ?? 0);

  for (
    let localIndex = lastSignificantLocalIndex + 1;
    localIndex <= maxLocalIndex;
    localIndex++
  ) {
    const keyframe = expanded[localIndex];
    if (!keyframe) continue;
    keyframe.time = addTimeDelta(keyframe.time, lastSignificantDelta);
  }

  const newBoundaryStart = expanded[lastSignificantLocalIndex];
  const newBoundaryEnd = expanded[lastSignificantLocalIndex + 1];
  const newDt = (newBoundaryEnd?.time ?? 0) - (newBoundaryStart?.time ?? 0);
  if (!Number.isFinite(oldDt) || Math.abs(oldDt) < DELTA_EPSILON) {
    return expanded;
  }

  const ratio = newDt / oldDt;
  if (!Number.isFinite(ratio) || ratio <= 0) return expanded;

  if (newBoundaryStart?.graphOut) {
    newBoundaryStart.graphOut.x *= ratio;
    syncOppositeGraphHandleForSmoothKeyframe(newBoundaryStart, 'GRAPH_OUT');
  }
  if (newBoundaryEnd?.graphIn) {
    newBoundaryEnd.graphIn.x *= ratio;
    syncOppositeGraphHandleForSmoothKeyframe(newBoundaryEnd, 'GRAPH_IN');
  }

  return expanded;
}

function cloneGraphComparableKeyframe(keyframe: Keyframe): Keyframe {
  return {
    ...keyframe,
    position: keyframe.position.copy(),
    sketchIn: keyframe.sketchIn?.copy(),
    sketchOut: keyframe.sketchOut?.copy(),
    graphIn: keyframe.graphIn?.copy(),
    graphOut: keyframe.graphOut?.copy(),
  };
}

function syncOppositeGraphHandleForSmoothKeyframe(
  keyframe: Keyframe,
  changedType: 'GRAPH_OUT' | 'GRAPH_IN',
): void {
  if (isGraphCorner(keyframe)) return;

  const changed =
    changedType === 'GRAPH_OUT' ? keyframe.graphOut : keyframe.graphIn;
  if (!changed || changed.magSq() <= DELTA_EPSILON) return;

  if (changedType === 'GRAPH_OUT') {
    const magnitude = keyframe.graphIn?.mag() ?? changed.mag();
    keyframe.graphIn = changed.copy().normalize().mult(-magnitude);
    return;
  }

  const magnitude = keyframe.graphOut?.mag() ?? changed.mag();
  keyframe.graphOut = changed.copy().normalize().mult(-magnitude);
}

// graphOut を実効ベクトルとして取得（未指定時はデフォルトを返す）
function resolveGraphOutHandle(
  keyframes: Keyframe[],
  progress: number[],
  index: number,
): p5.Vector | undefined {
  const current = keyframes[index];
  if (!current) return undefined;
  if (current.graphOut) return current.graphOut;
  const next = keyframes[index + 1];
  if (!next) return undefined;
  const v0 = progress[index] ?? 0;
  const v1 = progress[index + 1] ?? v0;
  return current.position
    .copy()
    .set((next.time - current.time) / 3, (v1 - v0) / 3);
}

// graphIn を実効ベクトルとして取得（未指定時はデフォルトを返す）
function resolveGraphInHandle(
  keyframes: Keyframe[],
  progress: number[],
  index: number,
): p5.Vector | undefined {
  const current = keyframes[index];
  if (!current) return undefined;
  if (current.graphIn) return current.graphIn;
  const previous = keyframes[index - 1];
  if (!previous) return undefined;
  const v0 = progress[index - 1] ?? 0;
  const v1 = progress[index] ?? v0;
  return current.position
    .copy()
    .set(-(current.time - previous.time) / 3, -(v1 - v0) / 3);
}

// ポイントにオフセットを適用
function offsetPoint(
  point: p5.Vector,
  dx: number,
  dy: number,
  p?: p5,
): p5.Vector {
  if (p) return p.createVector(point.x + dx, point.y + dy);
  if (typeof point.copy === 'function') {
    return point.copy().add(dx, dy);
  }
  return { x: point.x + dx, y: point.y + dy } as p5.Vector;
}
