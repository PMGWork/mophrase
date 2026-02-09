import type p5 from 'p5';
import type {
  Keyframe,
  Path,
  SerializedBoundingBox,
  SerializedHandle,
  SerializedKeyframe,
  SerializedPath,
  Vector,
} from '../../types';
import { buildSketchCurves, computeKeyframeProgress } from '../keyframes';
import { roundNormalizedValue } from '../math';

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
  handle: Vector | undefined,
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
  const serialized: SerializedKeyframe[] = keyframes.map((keyframe) => ({
    ...serializePosition(keyframe.position, bbox),
    time: roundNormalizedValue(keyframe.time),
  }));

  const diag = Math.hypot(bbox.width, bbox.height);

  for (let i = 0; i < keyframes.length - 1; i++) {
    const start = keyframes[i];
    const end = keyframes[i + 1];
    const startKeyframe = serialized[i];
    const endKeyframe = serialized[i + 1];
    const startPos = start.position;
    const endPos = end.position;

    const outHandle = start.sketchOut
      ? startPos.copy().add(start.sketchOut)
      : startPos;
    const inHandle = end.sketchIn ? endPos.copy().add(end.sketchIn) : endPos;

    startKeyframe.sketchOut = serializeHandle(outHandle, startPos, diag);
    endKeyframe.sketchIn = serializeHandle(inHandle, endPos, diag);

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

// シリアライズされたパス -> p5.Vector[][]
export function deserializeCurves(
  serializedPath: SerializedPath,
  p: p5,
): p5.Vector[][] {
  if (!serializedPath.keyframes || !serializedPath.bbox) return [];

  // バウンディングボックス
  const bbox = serializedPath.bbox;
  const width = bbox.width;
  const height = bbox.height;
  const diagonal = Math.hypot(width, height);

  // 連続するキーフレーム間を接続してカーブを生成
  const curves: p5.Vector[][] = [];
  for (let i = 0; i < serializedPath.keyframes.length - 1; i++) {
    const startKeyframe = serializedPath.keyframes[i];
    const endKeyframe = serializedPath.keyframes[i + 1];
    if (!startKeyframe || !endKeyframe) continue;

    const start = p.createVector(
      bbox.x + startKeyframe.x * width,
      bbox.y + startKeyframe.y * height,
    );
    const end = p.createVector(
      bbox.x + endKeyframe.x * width,
      bbox.y + endKeyframe.y * height,
    );
    const handleOut = startKeyframe.sketchOut;
    const handleIn = endKeyframe.sketchIn;

    curves.push([
      start,
      handleOut
        ? deserializeHandle(handleOut, start, diagonal, p)
        : start.copy(),
      handleIn ? deserializeHandle(handleIn, end, diagonal, p) : end.copy(),
      end,
    ]);
  }

  return curves;
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

// シリアライズされたキーフレームから時間カーブをデシリアライズ
export function deserializeGraphCurves(
  serializedKeyframes: SerializedKeyframe[],
  keyframes: Keyframe[],
  progress: number[],
  p: p5,
): p5.Vector[][] {
  if (serializedKeyframes.length < 2 || keyframes.length < 2) return [];

  const result: p5.Vector[][] = [];

  for (let i = 0; i < serializedKeyframes.length - 1; i++) {
    const startSerialized = serializedKeyframes[i];
    const endSerialized = serializedKeyframes[i + 1];
    const startKf = keyframes[i];
    const endKf = keyframes[i + 1];
    if (!startKf || !endKf) continue;

    const t0 = startKf.time;
    const t1 = endKf.time;
    const v0 = progress[i] ?? 0;
    const v1 = progress[i + 1] ?? v0;
    const dt = t1 - t0;
    const dv = v1 - v0;

    const p0 = p.createVector(t0, v0);
    const p3 = p.createVector(t1, v1);

    // セグメントの対角線長
    const segmentDiag = Math.hypot(dt, dv);

    // デフォルトハンドル
    const defaultOut = p.createVector(dt / 3, dv / 3);
    const defaultIn = p.createVector(-dt / 3, -dv / 3);

    // LLM からのハンドルを極座標からデシリアライズ
    let outVec = defaultOut;
    if (startSerialized.graphOut && segmentDiag > 1e-6) {
      outVec = deserializeGraphHandle(startSerialized.graphOut, segmentDiag, p);
    }

    let inVec = defaultIn;
    if (endSerialized.graphIn && segmentDiag > 1e-6) {
      inVec = deserializeGraphHandle(endSerialized.graphIn, segmentDiag, p);
    }

    const p1 = p0.copy().add(outVec);
    const p2 = p3.copy().add(inVec);
    result.push([p0, p1, p2, p3]);
  }

  return result;
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
