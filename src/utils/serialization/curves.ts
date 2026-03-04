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
import {
  isGraphCorner,
  isSketchCorner,
} from '../keyframeCorner';
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
// bbox 正規化空間で角度・距離を計算し、アスペクト比の歪みを防ぐ
function serializeHandle(
  handle: p5.Vector | undefined,
  anchor: p5.Vector,
  bbox: SerializedBoundingBox,
): SerializedHandle {
  const safeHandle = handle ?? anchor;
  const dx = safeHandle.x - anchor.x;
  const dy = safeHandle.y - anchor.y;
  // bbox サイズで正規化してアスペクト比を保持
  const ndx = dx / bbox.width;
  const ndy = dy / bbox.height;
  const angle = Math.atan2(ndy, ndx) * (180 / Math.PI);
  // 正規化空間（1×1）の対角線長 √2 で割り、dist を対角線比に正規化
  const dist = Math.hypot(ndx, ndy) / Math.SQRT2;
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
  const serialized: SerializedKeyframe[] = keyframes.map((keyframe, index) => {
    const anchor = keyframe.position;
    const inHandle = keyframe.sketchIn
      ? anchor.copy().add(keyframe.sketchIn)
      : anchor;
    const outHandle = keyframe.sketchOut
      ? anchor.copy().add(keyframe.sketchOut)
      : anchor;

    const sketchCorner = isSketchCorner(keyframe);
    const graphCorner = isGraphCorner(keyframe);

    return {
      ...serializePosition(anchor, bbox),
      time: round(resolveFiniteTime(serializedTimes[index], keyframe.time), 3),
      sketchIn: serializeHandle(inHandle, anchor, bbox),
      sketchOut: serializeHandle(outHandle, anchor, bbox),
      ...(sketchCorner ? { sketchCorner: true } : {}),
      ...(graphCorner ? { graphCorner: true } : {}),
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

  // 選択範囲端の外側グラフハンドルもシリアライズする。
  // メインループは隣接セグメント間のハンドルのみ処理するため、
  // 先頭 graphIn / 末尾 graphOut は未設定のままになる。
  if (keyframes.length >= 2) {
    const first = keyframes[0];
    const second = keyframes[1];
    if (first.graphIn && !serialized[0].graphIn) {
      serialized[0].graphIn = serializeGraphHandle(
        first.graphIn,
        { time: resolveFiniteTime(serializedTimes[0], first.time), progress: progress[0] ?? 0 },
        { time: resolveFiniteTime(serializedTimes[1], second.time), progress: progress[1] ?? 0 },
        false,
      );
    }

    const lastIdx = keyframes.length - 1;
    const last = keyframes[lastIdx];
    const secondToLast = keyframes[lastIdx - 1];
    if (last.graphOut && !serialized[lastIdx].graphOut) {
      serialized[lastIdx].graphOut = serializeGraphHandle(
        last.graphOut,
        { time: resolveFiniteTime(serializedTimes[lastIdx - 1], secondToLast.time), progress: progress[lastIdx - 1] ?? 0 },
        { time: resolveFiniteTime(serializedTimes[lastIdx], last.time), progress: progress[lastIdx] ?? 0 },
        true,
      );
    }
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
      ? deserializeHandle(serialized.sketchIn, position, bbox, p)
          .copy()
          .sub(position)
      : undefined;
    const sketchOut = serialized.sketchOut
      ? deserializeHandle(serialized.sketchOut, position, bbox, p)
          .copy()
          .sub(position)
      : undefined;

    const sketchCorner = isSketchCorner(serialized);
    const graphCorner = isGraphCorner(serialized);

    keyframes.push({
      time:
        serialized.time !== undefined && Number.isFinite(serialized.time)
          ? denormalizeTime(serialized.time, referenceStart, referenceSpan)
          : reference.time,
      position,
      sketchIn,
      sketchOut,
      ...(sketchCorner ? { sketchCorner: true } : {}),
      ...(graphCorner ? { graphCorner: true } : {}),
    });
  }
  stabilizeDeserializedTimes(keyframes, referenceTimes);

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

  // 選択範囲端の外側グラフハンドルもデシリアライズする
  if (keyframes.length >= 2) {
    const firstSerialized = serializedPath.keyframes[0];
    const first = keyframes[0];
    if (firstSerialized?.graphIn && first && !first.graphIn) {
      const second = keyframes[1];
      if (second) {
        const dt = second.time - first.time;
        const v0 = deserializedProgress[0] ?? referenceProgress[0] ?? 0;
        const v1 = deserializedProgress[1] ?? referenceProgress[1] ?? v0;
        const dv = v1 - v0;
        const segDiag = Math.hypot(dt, dv);
        if (segDiag > 1e-6) {
          first.graphIn = deserializeGraphHandle(firstSerialized.graphIn, segDiag, p);
        }
      }
    }

    const lastIdx = keyframes.length - 1;
    const lastSerialized = serializedPath.keyframes[lastIdx];
    const last = keyframes[lastIdx];
    if (lastSerialized?.graphOut && last && !last.graphOut) {
      const secondToLast = keyframes[lastIdx - 1];
      if (secondToLast) {
        const dt = last.time - secondToLast.time;
        const v0 = deserializedProgress[lastIdx - 1] ?? referenceProgress[lastIdx - 1] ?? 0;
        const v1 = deserializedProgress[lastIdx] ?? referenceProgress[lastIdx] ?? v0;
        const dv = v1 - v0;
        const segDiag = Math.hypot(dt, dv);
        if (segDiag > 1e-6) {
          last.graphOut = deserializeGraphHandle(lastSerialized.graphOut, segDiag, p);
        }
      }
    }
  }

  return keyframes;
}

function stabilizeDeserializedTimes(
  keyframes: Keyframe[],
  referenceTimes: number[],
): void {
  if (keyframes.length === 0) return;

  const evenDenominator = Math.max(1, keyframes.length - 1);
  for (let i = 0; i < keyframes.length; i++) {
    const keyframe = keyframes[i];
    if (!keyframe) continue;
    const fallbackReference = referenceTimes[i];
    const fallbackTime =
      Number.isFinite(fallbackReference)
        ? (fallbackReference as number)
        : i / evenDenominator;
    if (!Number.isFinite(keyframe.time)) {
      keyframe.time = fallbackTime;
    }
  }

  for (let i = 1; i < keyframes.length; i++) {
    const previous = keyframes[i - 1];
    const current = keyframes[i];
    if (!previous || !current) continue;

    const previousTime = Number.isFinite(previous.time) ? previous.time : 0;
    const minimum = previousTime + 1e-4;
    if (!Number.isFinite(current.time) || current.time < minimum) {
      current.time = minimum;
    }
  }
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
// bbox 正規化空間から復元し、アスペクト比の歪みを防ぐ
export function deserializeHandle(
  handle: SerializedHandle,
  anchor: p5.Vector,
  bbox: SerializedBoundingBox,
  p: p5,
): p5.Vector {
  const angle = handle.angle * (Math.PI / 180);
  // serializeHandle の √2 除算の逆変換
  const normDist = handle.dist * Math.SQRT2;
  const ndx = Math.cos(angle) * normDist;
  const ndy = Math.sin(angle) * normDist;
  const x = anchor.x + ndx * bbox.width;
  const y = anchor.y + ndy * bbox.height;
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
