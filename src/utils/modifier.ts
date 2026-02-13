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
import { splitKeyframeSegment } from './keyframes';
import { clamp } from './number';

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

// #region 作成

// LLMの出力からスケッチモディファイアを作成
export function createSketchModifier(
  keyframes: Keyframe[],
  originalCurves: p5.Vector[][],
  modifiedCurves: p5.Vector[][],
  name: string,
  selectionRange?: SelectionRange,
): SketchModifier {
  const startIndex = selectionRange?.startCurveIndex ?? 0;
  const endIndex = selectionRange?.endCurveIndex ?? originalCurves.length - 1;

  // 密配列: deltas[i] が keyframes[i] に対応
  const deltas: SketchKeyframeDelta[] = keyframes.map(() => ({}));

  // 各キーフレームに対してデルタを計算
  for (let i = startIndex; i <= endIndex + 1; i++) {
    if (i >= keyframes.length) break;

    const localIndex = i - startIndex;
    const delta = deltas[i];

    // positionデルタ
    const originalAnchor = getAnchor(originalCurves, i);
    const modifiedAnchor = getAnchor(modifiedCurves, localIndex);
    if (originalAnchor && modifiedAnchor) {
      const v = diffVec2(modifiedAnchor, originalAnchor);
      if (v) delta.posDelta = v;
    }

    // outデルタ（出力カーブが範囲内の場合のみ）
    if (i <= endIndex) {
      const v = handleDiff(originalCurves[i], modifiedCurves[localIndex], 0, 1);
      if (v) delta.outDelta = v;
    }

    // inデルタ（入力カーブが範囲内の場合のみ）
    if (i > startIndex) {
      const localIndex = i - 1 - startIndex;
      const v = handleDiff(
        originalCurves[i - 1],
        modifiedCurves[localIndex],
        3,
        2,
      );
      if (v) delta.inDelta = v;
    }
  }

  return { id: crypto.randomUUID(), name, strength: 1.0, deltas };
}

// LLMの出力からグラフモディファイアを作成
export function createGraphModifier(
  keyframes: Keyframe[],
  originalCurves: p5.Vector[][],
  modifiedCurves: p5.Vector[][],
  name: string,
  selectionRange?: SelectionRange,
): GraphModifier {
  const startIndex = selectionRange?.startCurveIndex ?? 0;
  const endIndex = selectionRange?.endCurveIndex ?? originalCurves.length - 1;

  // 密配列: deltas[i] が keyframes[i] に対応
  const deltas: GraphKeyframeDelta[] = keyframes.map(() => ({}));

  // 各キーフレームに対してデルタを計算
  for (let i = startIndex; i <= endIndex + 1; i++) {
    if (i >= keyframes.length) break;

    const delta = deltas[i];

    // outデルタ（出力カーブが範囲内の場合のみ）
    if (i <= endIndex) {
      const localIndex = i - startIndex;
      const v = handleDiff(originalCurves[i], modifiedCurves[localIndex], 0, 1);
      if (v) delta.outDelta = v;
    }

    // inデルタ（入力カーブが範囲内の場合のみ）
    if (i > startIndex) {
      const localIndex = i - 1 - startIndex;
      const v = handleDiff(
        originalCurves[i - 1],
        modifiedCurves[localIndex],
        3,
        2,
      );
      if (v) delta.inDelta = v;
    }
  }

  return { id: crypto.randomUUID(), name, strength: 1.0, deltas };
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

// キーフレームインデックスからアンカーポイントを取得
function getAnchor(
  curves: p5.Vector[][],
  keyframeIndex: number,
): p5.Vector | null {
  if (keyframeIndex < curves.length) return curves[keyframeIndex]?.[0] ?? null;
  if (keyframeIndex > 0) return curves[keyframeIndex - 1]?.[3] ?? null;
  return null;
}

// ハンドルベクトルの差分を計算（anchorIdx, handleIdx はカーブ内でのインデックス）
function handleDiff(
  origCurve: p5.Vector[] | undefined,
  modCurve: p5.Vector[] | undefined,
  anchorIdx: number,
  handleIdx: number,
): { x: number; y: number } | null {
  if (!origCurve || !modCurve) return null;
  const oA = origCurve[anchorIdx];
  const oH = origCurve[handleIdx];
  const mA = modCurve[anchorIdx];
  const mH = modCurve[handleIdx];
  if (!oA || !oH || !mA || !mH) return null;
  const dx = mH.x - mA.x - (oH.x - oA.x);
  const dy = mH.y - mA.y - (oH.y - oA.y);
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  return { x: dx, y: dy };
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
