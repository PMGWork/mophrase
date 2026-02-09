import type p5 from 'p5';
import type {
  Path,
  SerializedAnchorPoint,
  SerializedBoundingBox,
  SerializedHandlePoint,
  SerializedPath,
  SerializedSegment,
} from '../types';
import { roundNormalizedValue } from './math';

// #region シリアライズ
// p5.Vector -> アンカーポイント（正規化）
export function createSerializedAnchor(
  vec: p5.Vector,
  bbox: SerializedBoundingBox,
): SerializedAnchorPoint {
  const width = bbox.width;
  const height = bbox.height;
  return {
    x: roundNormalizedValue((vec.x - bbox.x) / width),
    y: roundNormalizedValue((vec.y - bbox.y) / height),
  };
}

// p5.Vector -> 極座標（角度と距離）
export function toSerializedHandle(
  handle: p5.Vector | undefined,
  anchor: p5.Vector,
  diag: number,
): SerializedHandlePoint {
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

// p5.Vector[][] -> アンカーポイントとセグメント
export function serializeAnchorsAndSegments(
  curves: p5.Vector[][],
  bbox: SerializedBoundingBox,
): Omit<SerializedPath, 'bbox'> {
  const anchors: SerializedAnchorPoint[] = [];
  const anchorIndexMap = new Map<string, number>();
  const segments: SerializedSegment[] = [];
  const width = bbox.width;
  const height = bbox.height;
  const diag = Math.hypot(width, height);

  // 座標をキーにしてアンカーの重複を避ける
  const getAnchorKey = (vec: p5.Vector): string => {
    const nx = roundNormalizedValue((vec.x - bbox.x) / width);
    const ny = roundNormalizedValue((vec.y - bbox.y) / height);
    return `${nx}:${ny}`;
  };

  // アンカーを取得または作成
  const getOrCreateAnchor = (
    vec: p5.Vector,
  ): { index: number; anchor: SerializedAnchorPoint } => {
    const key = getAnchorKey(vec);
    let index = anchorIndexMap.get(key);
    if (index === undefined) {
      const anchor = createSerializedAnchor(vec, bbox);
      anchors.push(anchor);
      index = anchors.length - 1;
      anchorIndexMap.set(key, index);
    }
    return { index, anchor: anchors[index] };
  };

  // 各曲線を処理
  curves.forEach((curve) => {
    const [p0, p1, p2, p3] = curve;

    const start = getOrCreateAnchor(p0);
    const end = getOrCreateAnchor(p3);

    start.anchor.out = toSerializedHandle(p1, p0, diag);
    end.anchor.in = toSerializedHandle(p2, p3, diag);

    segments.push({ startIndex: start.index, endIndex: end.index });
  });

  return { anchors, segments };
}

// p5.js 描画パス -> シリアライズされたパス
export function serializePaths(paths: Path[]): SerializedPath[] {
  return paths.map((path) => {
    const bbox = calculateBoundingBox(path.curves);
    const { anchors, segments } = serializeAnchorsAndSegments(
      path.curves,
      bbox,
    );
    return {
      anchors,
      segments,
      bbox,
    };
  });
}

// #region デシリアライズ
// シリアライズされたパス -> p5.js 描画パス
export function deserializePaths(
  serializedPaths: SerializedPath[],
  paths: Path[],
  p: p5,
): Path[] {
  return serializedPaths.map((serializedPath, index) => ({
    points: paths[index].points,
    times: paths[index].times,
    curves: deserializeCurves(
      serializedPath.bbox
        ? serializedPath
        : {
            ...serializedPath,
            bbox: calculateBoundingBox(paths[index].curves),
          },
      p,
    ),
    timeCurve: paths[index].timeCurve,
    fitError: paths[index].fitError,
  }));
}

// シリアライズされたパス -> p5.Vector[][]
export function deserializeCurves(
  serializedPath: SerializedPath,
  p: p5,
): p5.Vector[][] {
  if (
    !serializedPath.anchors ||
    !serializedPath.segments ||
    !serializedPath.bbox
  )
    return [];
  const bbox = serializedPath.bbox;
  const width = bbox.width;
  const height = bbox.height;
  const diag = Math.hypot(width, height);
  return serializedPath.segments
    .map((segment) => {
      const startAnchor = serializedPath.anchors[segment.startIndex];
      const endAnchor = serializedPath.anchors[segment.endIndex];
      if (!startAnchor || !endAnchor) return null;

      const start = p.createVector(
        bbox.x + startAnchor.x * width,
        bbox.y + startAnchor.y * height,
      );
      const end = p.createVector(
        bbox.x + endAnchor.x * width,
        bbox.y + endAnchor.y * height,
      );
      const handleOut = startAnchor.out;
      const handleIn = endAnchor.in;

      return [
        start,
        handleOut
          ? polarHandleToVector(handleOut, start, diag, p)
          : start.copy(),
        handleIn ? polarHandleToVector(handleIn, end, diag, p) : end.copy(),
        end,
      ];
    })
    .filter((curve): curve is p5.Vector[] => curve !== null);
}

// 極座標のハンドル -> p5.Vector
function polarHandleToVector(
  handle: SerializedHandlePoint,
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

// #region ユーティリティ
// バウンディングボックスを計算
function calculateBoundingBox(curves: p5.Vector[][]): SerializedBoundingBox {
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
