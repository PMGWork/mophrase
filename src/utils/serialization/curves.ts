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
import { round } from '../math';

// p5.Vector -> キーフレーム座標（正規化）
function serializePosition(
  vec: p5.Vector,
  bbox: SerializedBoundingBox,
): Pick<SerializedKeyframe, 'x' | 'y'> {
  const width = bbox.width;
  const height = bbox.height;
  return {
    x: round((vec.x - bbox.x) / width, 3),
    y: round((vec.y - bbox.y) / height, 3),
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
    angle: round(angle, 3),
    dist: round(dist, 3),
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
    angle: round(angle, 3),
    dist: round(dist, 3),
  };
}

// キーフレーム -> シリアライズされたキーフレーム
function serializeKeyframes(
  keyframes: Keyframe[],
  bbox: SerializedBoundingBox,
  serializedTimes: number[],
  progress: number[],
): SerializedKeyframe[] {
  const diag = Math.hypot(bbox.width, bbox.height);
  const serialized: SerializedKeyframe[] = keyframes.map((keyframe, index) => {
    const anchor = keyframe.position;
    const inHandle = keyframe.sketchIn
      ? anchor.copy().add(keyframe.sketchIn)
      : anchor;
    const outHandle = keyframe.sketchOut
      ? anchor.copy().add(keyframe.sketchOut)
      : anchor;

    return {
      ...serializePosition(anchor, bbox),
      time: round(resolveFiniteTime(serializedTimes[index], keyframe.time), 3),
      sketchIn: serializeHandle(inHandle, anchor, diag),
      sketchOut: serializeHandle(outHandle, anchor, diag),
      ...(keyframe.corner ? { corner: true } : {}),
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
      { time: resolveFiniteTime(serializedTimes[i], start.time), progress: startProgress },
      { time: resolveFiniteTime(serializedTimes[i + 1], end.time), progress: endProgress },
      true,
    );
    endKeyframe.graphIn = serializeGraphHandle(
      end.graphIn,
      { time: resolveFiniteTime(serializedTimes[i], start.time), progress: startProgress },
      { time: resolveFiniteTime(serializedTimes[i + 1], end.time), progress: endProgress },
      false,
    );
  }

  return serialized;
}

// パス -> シリアライズされたパス
export function serializePaths(paths: Path[]): SerializedPath[] {
  return paths.map((path) => {
    const curves = buildSketchCurves(path.keyframes);
    const bbox =
      curves.length > 0 ? computeBbox(curves) : computeBboxFromKeyframes(path.keyframes);
    const serializedTimes = normalizePathTimes(path.keyframes);
    const progress = computeKeyframeProgress(path.keyframes, curves);
    const keyframes = serializeKeyframes(
      path.keyframes,
      bbox,
      serializedTimes,
      progress,
    );
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
  const referenceTimes = referenceKeyframes.map((keyframe, index) =>
    Number.isFinite(keyframe.time)
      ? keyframe.time
      : index / Math.max(1, referenceKeyframes.length - 1),
  );
  const referenceStart = referenceTimes[0] ?? 0;
  const referenceEnd = referenceTimes[referenceTimes.length - 1] ?? referenceStart;
  const referenceSpan = referenceEnd - referenceStart;

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
      time:
        serialized.time !== undefined && Number.isFinite(serialized.time)
          ? denormalizeTime(serialized.time, referenceStart, referenceSpan)
          : reference.time,
      position,
      sketchIn,
      sketchOut,
    });
  }

  const deserializedCurves = buildSketchCurves(keyframes);
  const deserializedProgress = computeKeyframeProgress(
    keyframes,
    deserializedCurves,
  );

  for (let i = 0; i < keyframes.length - 1; i++) {
    const startSerialized = serializedPath.keyframes[i];
    const endSerialized = serializedPath.keyframes[i + 1];
    const start = keyframes[i];
    const end = keyframes[i + 1];
    if (!startSerialized || !endSerialized || !start || !end) continue;

    const dt = end.time - start.time;
    const v0 = deserializedProgress[i] ?? referenceProgress[i] ?? 0;
    const v1 =
      deserializedProgress[i + 1] ?? referenceProgress[i + 1] ?? v0;
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

function normalizePathTimes(keyframes: Keyframe[]): number[] {
  if (keyframes.length === 0) return [];
  const baseTimes = keyframes.map((keyframe, index) =>
    Number.isFinite(keyframe.time)
      ? keyframe.time
      : index / Math.max(1, keyframes.length - 1),
  );
  if (baseTimes.length === 1) return [0];
  const start = baseTimes[0];
  const end = baseTimes[baseTimes.length - 1];
  const span = end - start;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-9) {
    return baseTimes.map((_, index) => index / Math.max(1, baseTimes.length - 1));
  }
  return baseTimes.map((time) => (time - start) / span);
}

function denormalizeTime(
  serializedTime: number,
  referenceStart: number,
  referenceSpan: number,
): number {
  if (!Number.isFinite(serializedTime)) return referenceStart;
  if (!Number.isFinite(referenceSpan) || Math.abs(referenceSpan) < 1e-9) {
    return referenceStart;
  }
  const denormalized = referenceStart + serializedTime * referenceSpan;
  return Number.isFinite(denormalized) ? denormalized : referenceStart;
}

function resolveFiniteTime(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
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

// キーフレーム（アンカー + sketchハンドル）からバウンディングボックスを計算
function computeBboxFromKeyframes(keyframes: Keyframe[]): SerializedBoundingBox {
  if (keyframes.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includePoint = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const keyframe of keyframes) {
    const anchor = keyframe.position;
    includePoint(anchor.x, anchor.y);

    const sketchIn = keyframe.sketchIn;
    if (sketchIn) {
      includePoint(anchor.x + sketchIn.x, anchor.y + sketchIn.y);
    }

    const sketchOut = keyframe.sketchOut;
    if (sketchOut) {
      includePoint(anchor.x + sketchOut.x, anchor.y + sketchOut.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1e-6, maxX - minX),
    height: Math.max(1e-6, maxY - minY),
  };
}
