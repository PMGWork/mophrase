/**
 * パス・キーフレーム・ハンドルの JSON シリアライズ／デシリアライズ。
 * LLM との通信やクリップボードコピーで使用する。
 */

import type p5 from 'p5';
import type {
  Keyframe,
  Path,
  SerializedBoundingBox,
  SerializedHandle,
  SerializedKeyframe,
  SerializedPath,
} from '../../types';
import { buildSketchCurves, computeKeyframeProgress } from '../keyframes';
import { roundNormalizedValue } from '../bezier';

// p5.Vector -> キーフレーム座標（正規化）
function serializePosition(
  vec: p5.Vector,
  bbox: SerializedBoundingBox,
): Pick<SerializedKeyframe, 'x' | 'y'> {
  const width = bbox.width;
  const height = bbox.height;
  return {
    x: roundNormalizedValue((vec.x - bbox.x) / width),
    y: roundNormalizedValue((vec.y - bbox.y) / height),
  };
}

// p5.Vector -> 極座標（角度と距離）
function serializeHandle(
  handle: p5.Vector | undefined,
  anchor: p5.Vector,
  diag: number,
): SerializedHandle {
  const safeHandle = handle ?? anchor;
  const dx = safeHandle.x - anchor.x;
  const dy = safeHandle.y - anchor.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const dist = Math.hypot(dx, dy) / diag;
  return {
    angle: roundNormalizedValue(angle),
    dist: roundNormalizedValue(dist),
  };
}

// グラフハンドルを極座標で正規化
function serializeGraphHandle(
  handle: p5.Vector | undefined,
  start: { time: number; progress: number },
  end: { time: number; progress: number },
  isOut: boolean,
): SerializedHandle | null {
  const dt = end.time - start.time;
  const dv = end.progress - start.progress;
  if (Math.abs(dt) < 1e-6 || Math.abs(dv) < 1e-6) return null;

  // セグメントの対角線長（正規化用）
  const segmentDiag = Math.hypot(dt, dv);
  if (segmentDiag < 1e-6) return null;

  const defaultHandle = isOut
    ? { x: dt / 3, y: dv / 3 }
    : { x: -dt / 3, y: -dv / 3 };
  const vec = handle ?? defaultHandle;

  // 極座標に変換
  const angle = Math.atan2(vec.y, vec.x) * (180 / Math.PI);
  const dist = Math.hypot(vec.x, vec.y) / segmentDiag;

  return {
    angle: roundNormalizedValue(angle),
    dist: roundNormalizedValue(dist),
  };
}

// キーフレーム -> シリアライズされたキーフレーム
function serializeKeyframes(
  keyframes: Keyframe[],
  bbox: SerializedBoundingBox,
  progress: number[],
): SerializedKeyframe[] {
  const diag = Math.hypot(bbox.width, bbox.height);
  const serialized: SerializedKeyframe[] = keyframes.map((keyframe) => {
    const anchor = keyframe.position;
    const inHandle = keyframe.sketchIn ? anchor.copy().add(keyframe.sketchIn) : anchor;
    const outHandle = keyframe.sketchOut
      ? anchor.copy().add(keyframe.sketchOut)
      : anchor;

    return {
      ...serializePosition(anchor, bbox),
      time: roundNormalizedValue(keyframe.time),
      sketchIn: serializeHandle(inHandle, anchor, diag),
      sketchOut: serializeHandle(outHandle, anchor, diag),
    };
  });

  for (let i = 0; i < keyframes.length - 1; i++) {
    const start = keyframes[i];
    const end = keyframes[i + 1];
    const startKeyframe = serialized[i];
    const endKeyframe = serialized[i + 1];

    const startProgress = progress[i] ?? 0;
    const endProgress = progress[i + 1] ?? startProgress;

    startKeyframe.graphOut = serializeGraphHandle(
      start.graphOut,
      { time: start.time, progress: startProgress },
      { time: end.time, progress: endProgress },
      true,
    );
    endKeyframe.graphIn = serializeGraphHandle(
      end.graphIn,
      { time: start.time, progress: startProgress },
      { time: end.time, progress: endProgress },
      false,
    );
  }

  return serialized;
}

// パス -> シリアライズされたパス
export function serializePaths(paths: Path[]): SerializedPath[] {
  return paths.map((path) => {
    const curves = buildSketchCurves(path.keyframes);
    const bbox = computeBbox(curves);
    const progress = computeKeyframeProgress(path.keyframes, curves);
    const keyframes = serializeKeyframes(path.keyframes, bbox, progress);
    return { keyframes, bbox };
  });
}

// シリアライズされたパス -> キーフレーム配列（Modifier生成用）
export function deserializePathKeyframes(
  serializedPath: SerializedPath,
  referenceKeyframes: Keyframe[],
  referenceProgress: number[],
  p: p5,
): Keyframe[] {
  if (!serializedPath.keyframes || !serializedPath.bbox) return [];

  const bbox = serializedPath.bbox;
  const width = bbox.width;
  const height = bbox.height;
  const diagonal = Math.hypot(width, height);
  const count = Math.min(
    serializedPath.keyframes.length,
    referenceKeyframes.length,
  );
  if (count === 0) return [];

  const keyframes: Keyframe[] = [];
  for (let i = 0; i < count; i++) {
    const serialized = serializedPath.keyframes[i];
    const reference = referenceKeyframes[i];
    if (!serialized || !reference) continue;

    const position = p.createVector(
      bbox.x + serialized.x * width,
      bbox.y + serialized.y * height,
    );

    const sketchIn = serialized.sketchIn
      ? deserializeHandle(serialized.sketchIn, position, diagonal, p)
          .copy()
          .sub(position)
      : undefined;
    const sketchOut = serialized.sketchOut
      ? deserializeHandle(serialized.sketchOut, position, diagonal, p)
          .copy()
          .sub(position)
      : undefined;

    keyframes.push({
      time: reference.time,
      position,
      sketchIn,
      sketchOut,
    });
  }

  for (let i = 0; i < keyframes.length - 1; i++) {
    const startSerialized = serializedPath.keyframes[i];
    const endSerialized = serializedPath.keyframes[i + 1];
    const startRef = referenceKeyframes[i];
    const endRef = referenceKeyframes[i + 1];
    const start = keyframes[i];
    const end = keyframes[i + 1];
    if (!startSerialized || !endSerialized || !startRef || !endRef) continue;

    const dt = endRef.time - startRef.time;
    const v0 = referenceProgress[i] ?? 0;
    const v1 = referenceProgress[i + 1] ?? v0;
    const dv = v1 - v0;
    const segmentDiag = Math.hypot(dt, dv);

    const defaultOut = p.createVector(dt / 3, dv / 3);
    const defaultIn = p.createVector(-dt / 3, -dv / 3);

    start.graphOut =
      startSerialized.graphOut && segmentDiag > 1e-6
        ? deserializeGraphHandle(startSerialized.graphOut, segmentDiag, p)
        : defaultOut;
    end.graphIn =
      endSerialized.graphIn && segmentDiag > 1e-6
        ? deserializeGraphHandle(endSerialized.graphIn, segmentDiag, p)
        : defaultIn;
  }

  return keyframes;
}

// 極座標のハンドル -> p5.Vector
export function deserializeHandle(
  handle: SerializedHandle,
  anchor: p5.Vector,
  diag: number,
  p: p5,
): p5.Vector {
  const angle = handle.angle * (Math.PI / 180);
  const dist = handle.dist * diag;
  const x = anchor.x + Math.cos(angle) * dist;
  const y = anchor.y + Math.sin(angle) * dist;
  return p.createVector(x, y);
}

// 極座標のグラフハンドル -> p5.Vector
export function deserializeGraphHandle(
  handle: SerializedHandle,
  segmentDiag: number,
  p: p5,
): p5.Vector {
  const angle = handle.angle * (Math.PI / 180);
  const dist = handle.dist * segmentDiag;
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;
  return p.createVector(x, y);
}

// バウンディングボックスを計算
function computeBbox(curves: p5.Vector[][]): SerializedBoundingBox {
  if (!curves.length) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  curves.forEach((curve) => {
    curve.forEach((vec) => {
      if (!vec) return;
      if (vec.x < minX) minX = vec.x;
      if (vec.y < minY) minY = vec.y;
      if (vec.x > maxX) maxX = vec.x;
      if (vec.y > maxY) maxY = vec.y;
    });
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);

  return {
    x: minX,
    y: minY,
    width,
    height,
  };
}
