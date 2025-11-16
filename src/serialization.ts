import type p5 from 'p5';
import type {
  SerializedAnchorPoint,
  SerializedHandlePoint,
  SerializedPath,
  SerializedSegment,
  Path,
} from './types';
import { roundCoordinate } from './mathUtils';

// #region シリアライズ
// p5.Vector -> アンカーポイント
export function createSerializedAnchor(vec: p5.Vector): SerializedAnchorPoint {
  return {
    x: roundCoordinate(vec.x),
    y: roundCoordinate(vec.y),
  };
}

// p5.Vector -> 極座標（角度と距離）
export function toSerializedHandle(handle: p5.Vector | undefined, anchor: p5.Vector): SerializedHandlePoint {
  const safeHandle = handle ?? anchor;
  const dx = safeHandle.x - anchor.x;
  const dy = safeHandle.y - anchor.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const dist = Math.hypot(dx, dy);
  return {
    angle: roundCoordinate(angle),
    dist: roundCoordinate(dist),
  };
}

// p5.Vector[][] -> アンカーポイントとセグメント
export function serializeAnchorsAndSegments(curves: p5.Vector[][]): Omit<SerializedPath, 'points'> {
  const anchors: SerializedAnchorPoint[] = [];
  const anchorIndexMap = new Map<string, number>();
  const segments: SerializedSegment[] = [];

  // 座標をキーにしてアンカーの重複を避ける
  const getAnchorKey = (vec: p5.Vector): string => `${roundCoordinate(vec.x)}:${roundCoordinate(vec.y)}`;

  // アンカーを取得または作成
  const getOrCreateAnchor = (vec: p5.Vector): { index: number; anchor: SerializedAnchorPoint } => {
    const key = getAnchorKey(vec);
    let index = anchorIndexMap.get(key);
    if (index === undefined) {
      const anchor = createSerializedAnchor(vec);
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

    start.anchor.out = toSerializedHandle(p1, p0);
    end.anchor.in = toSerializedHandle(p2, p3);

    segments.push({ startIndex: start.index, endIndex: end.index });
  });

  return { anchors, segments };
}

// p5.js 描画パス -> シリアライズされたパス
export function serializePaths(paths: Path[]): SerializedPath[] {
  return paths.map((path) => {
    const { anchors, segments } = serializeAnchorsAndSegments(path.curves);
    return {
      anchors,
      segments,
    };
  });
}

// #region デシリアライズ
// シリアライズされたパス -> p5.js 描画パス
export function deserializePaths(serializedPaths: SerializedPath[], paths: Path[], p: p5): Path[] {
  return serializedPaths.map((serializedPath, index) => ({
    points: paths[index].points,
    curves: deserializeCurves(serializedPath, p),
    fitError: paths[index].fitError,
  }));
}

// シリアライズされたパス -> p5.Vector[][]
export function deserializeCurves(serializedPath: SerializedPath, p: p5): p5.Vector[][] {
  if (!serializedPath.anchors || !serializedPath.segments) return [];
  return serializedPath.segments
    .map((segment) => {
      const startAnchor = serializedPath.anchors[segment.startIndex];
      const endAnchor = serializedPath.anchors[segment.endIndex];
      if (!startAnchor || !endAnchor) return [];

      const start = p.createVector(startAnchor.x, startAnchor.y);
      const end = p.createVector(endAnchor.x, endAnchor.y);
      const handleOut = startAnchor.out;
      const handleIn = endAnchor.in;

      return [
        start,
        handleOut ? polarHandleToVector(handleOut, start, p) : start.copy(),
        handleIn ? polarHandleToVector(handleIn, end, p) : end.copy(),
        end,
      ];
    })
    .filter((curve) => curve.length === 4);
}

// 極座標のハンドル -> p5.Vector
function polarHandleToVector(handle: SerializedHandlePoint, anchor: p5.Vector, p: p5): p5.Vector {
  const angle = (handle.angle ?? 0) * (Math.PI / 180);
  const dist = handle.dist ?? 0;
  const x = anchor.x + Math.cos(angle) * dist;
  const y = anchor.y + Math.sin(angle) * dist;
  return p.createVector(x, y);
}
