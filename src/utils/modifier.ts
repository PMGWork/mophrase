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

// #region 適用

// スケッチモディファイアを適用して変形後の点列を取得
export function applySketchModifiers(
  curves: p5.Vector[][],
  keyframes: Keyframe[],
  modifiers: SketchModifier[] | undefined,
  p?: p5,
): p5.Vector[][] {
  if (!modifiers || modifiers.length === 0) return curves;

  // キーフレームごとに位置・ハンドルの累積デルタを計算
  const posDelta = zeroVecs(keyframes.length);
  const soDelta = zeroVecs(keyframes.length);
  const siDelta = zeroVecs(keyframes.length);

  for (const mod of modifiers) {
    const len = Math.min(mod.deltas.length, keyframes.length);
    for (let idx = 0; idx < len; idx++) {
      const d = mod.deltas[idx];
      accumulate(posDelta[idx], d.positionDelta, mod.strength);
      accumulate(soDelta[idx], d.sketchOutDelta, mod.strength);
      accumulate(siDelta[idx], d.sketchInDelta, mod.strength);
    }
  }

  return curves.map((curve, i) => {
    // curve[i] は keyframe[i] → keyframe[i+1] を接続
    const dp0 = posDelta[i];
    const dp3 = posDelta[i + 1];
    const so = soDelta[i];
    const si = siDelta[i + 1];

    const offsets = [
      { x: dp0.x, y: dp0.y },
      { x: dp0.x + so.x, y: dp0.y + so.y },
      { x: dp3.x + si.x, y: dp3.y + si.y },
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

// グラフモディファイアを適用して変形後の点列を取得
export function applyGraphModifiers(
  curves: p5.Vector[][],
  keyframes: Keyframe[],
  modifiers: GraphModifier[] | undefined,
  p?: p5,
): p5.Vector[][] {
  if (!modifiers || modifiers.length === 0) return curves;

  const goDelta = zeroVecs(keyframes.length);
  const giDelta = zeroVecs(keyframes.length);

  for (const mod of modifiers) {
    const len = Math.min(mod.deltas.length, keyframes.length);
    for (let idx = 0; idx < len; idx++) {
      const d = mod.deltas[idx];
      accumulate(goDelta[idx], d.graphOutDelta, mod.strength);
      accumulate(giDelta[idx], d.graphInDelta, mod.strength);
    }
  }

  return curves.map((curve, i) => {
    const go = goDelta[i];
    const gi = giDelta[i + 1];

    if (go.x === 0 && go.y === 0 && gi.x === 0 && gi.y === 0) return curve;

    return curve.map((point, j) => {
      let dx = 0;
      let dy = 0;
      if (j === 1) {
        dx = go.x;
        dy = go.y;
      } else if (j === 2) {
        dx = gi.x;
        dy = gi.y;
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
  const startCI = selectionRange?.startCurveIndex ?? 0;
  const endCI = selectionRange?.endCurveIndex ?? originalCurves.length - 1;

  // 密配列: deltas[i] が keyframes[i] に対応
  const deltas: SketchKeyframeDelta[] = keyframes.map(() => ({}));

  for (let k = startCI; k <= endCI + 1; k++) {
    if (k >= keyframes.length) break;

    const localK = k - startCI;
    const delta = deltas[k];

    // 位置デルタ
    const origAnchor = getAnchor(originalCurves, k);
    const modAnchor = getAnchor(modifiedCurves, localK);
    if (origAnchor && modAnchor) {
      const v = diffVec(modAnchor, origAnchor);
      if (v) delta.positionDelta = v;
    }

    // sketchOutデルタ（出力カーブが範囲内の場合のみ）
    if (k >= startCI && k <= endCI) {
      const localI = k - startCI;
      const v = handleDiff(originalCurves[k], modifiedCurves[localI], 0, 1);
      if (v) delta.sketchOutDelta = v;
    }

    // sketchInデルタ（入力カーブが範囲内の場合のみ）
    if (k - 1 >= startCI && k - 1 <= endCI) {
      const localI = k - 1 - startCI;
      const v = handleDiff(originalCurves[k - 1], modifiedCurves[localI], 3, 2);
      if (v) delta.sketchInDelta = v;
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
  const startCI = selectionRange?.startCurveIndex ?? 0;
  const endCI = selectionRange?.endCurveIndex ?? originalCurves.length - 1;

  // 密配列: deltas[i] が keyframes[i] に対応
  const deltas: GraphKeyframeDelta[] = keyframes.map(() => ({}));

  for (let k = startCI; k <= endCI + 1; k++) {
    if (k >= keyframes.length) break;

    const delta = deltas[k];

    // graphOutデルタ
    if (k >= startCI && k <= endCI) {
      const localI = k - startCI;
      const v = handleDiff(originalCurves[k], modifiedCurves[localI], 0, 1);
      if (v) delta.graphOutDelta = v;
    }

    // graphInデルタ
    if (k - 1 >= startCI && k - 1 <= endCI) {
      const localI = k - 1 - startCI;
      const v = handleDiff(originalCurves[k - 1], modifiedCurves[localI], 3, 2);
      if (v) delta.graphInDelta = v;
    }
  }

  return { id: crypto.randomUUID(), name, strength: 1.0, deltas };
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
  if (modifier) modifier.strength = Math.max(0, Math.min(2, strength));
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
function accumulate(
  target: { x: number; y: number },
  delta: { x: number; y: number } | undefined,
  strength: number,
): void {
  if (!delta) return;
  target.x += delta.x * strength;
  target.y += delta.y * strength;
}

// ベクトル差分（有意な差がある場合のみ返す）
function diffVec(a: p5.Vector, b: p5.Vector): { x: number; y: number } | null {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
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
function offsetPoint(point: p5.Vector, dx: number, dy: number, p?: p5): p5.Vector {
  if (p) return p.createVector(point.x + dx, point.y + dy);
  if (typeof point.copy === 'function') {
    return point.copy().add(dx, dy);
  }
  return { x: point.x + dx, y: point.y + dy } as p5.Vector;
}
