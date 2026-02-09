import type p5 from 'p5';
import type {
  Keyframe,
  Modifier,
  Path,
  ProjectData,
  ProjectSettings,
  SerializedKeyframe,
  SerializedPath,
  SerializedHandle,
  SerializedProjectPath,
} from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { buildSketchCurves, computeKeyframeProgress } from '../keyframes';
import { serializePaths } from './curves';


// #region ヘルパー関数

// 型ガード関数
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 有限な数値かどうかをチェック
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// シリアライズされたハンドルかどうかをチェック
function isSerializedHandle(value: unknown): value is SerializedHandle {
  return (
    isRecord(value) && isFiniteNumber(value.angle) && isFiniteNumber(value.dist)
  );
}

// オプショナルなシリアライズされたハンドルかどうかをチェック
function isOptionalSerializedHandle(value: unknown): boolean {
  return value === undefined || value === null || isSerializedHandle(value);
}

// シリアライズされたキーフレームかどうかをチェック
function isSerializedKeyframe(value: unknown): value is SerializedKeyframe {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    (value.time === undefined || isFiniteNumber(value.time)) &&
    isOptionalSerializedHandle(value.sketchIn) &&
    isOptionalSerializedHandle(value.sketchOut) &&
    isOptionalSerializedHandle(value.graphIn) &&
    isOptionalSerializedHandle(value.graphOut)
  );
}

// シリアライズされたパスかどうかをチェック
function isSerializedPath(value: unknown): value is SerializedPath {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.keyframes) || value.keyframes.length < 2) return false;
  if (!value.keyframes.every(isSerializedKeyframe)) return false;
  if (!isRecord(value.bbox)) return false;
  return (
    isFiniteNumber(value.bbox.x) &&
    isFiniteNumber(value.bbox.y) &&
    isFiniteNumber(value.bbox.width) &&
    isFiniteNumber(value.bbox.height) &&
    Math.abs(value.bbox.width) > 1e-6 &&
    Math.abs(value.bbox.height) > 1e-6
  );
}

// #region シリアライズ

// モディファイアをパース
function parseModifier(value: unknown): Modifier | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.offsets)) return null;

  const offsets: ({ dx: number; dy: number } | null)[][] = [];
  for (const curve of value.offsets) {
    if (!Array.isArray(curve)) return null;

    const offsetCurve: ({ dx: number; dy: number } | null)[] = [];
    for (const point of curve) {
      if (point === null) {
        offsetCurve.push(null);
        continue;
      }
      if (
        !isRecord(point) ||
        !isFiniteNumber(point.dx) ||
        !isFiniteNumber(point.dy)
      ) {
        return null;
      }
      offsetCurve.push({ dx: point.dx, dy: point.dy });
    }
    offsets.push(offsetCurve);
  }

  return {
    id:
      typeof value.id === 'string' && value.id.trim() !== ''
        ? value.id
        : crypto.randomUUID(),
    name: typeof value.name === 'string' ? value.name : 'modifier',
    strength: isFiniteNumber(value.strength) ? value.strength : 1,
    offsets,
  };
}

// モディファイアの配列をサニタイズ
function sanitizeModifiers(value: unknown): Modifier[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const modifiers = value
    .map((modifier) => parseModifier(modifier))
    .filter((modifier): modifier is Modifier => modifier !== null);
  return modifiers.length > 0 ? modifiers : undefined;
}

// unknown -> SerializedProjectPath
function toSerializedProjectPath(value: unknown): SerializedProjectPath {
  if (!isRecord(value) || !isSerializedPath(value)) {
    throw new Error('Invalid project format: paths are malformed.');
  }
  const obj = value;

  return {
    keyframes: value.keyframes,
    bbox: value.bbox,
    id: typeof obj.id === 'string' ? obj.id : '',
    startTime: isFiniteNumber(obj.startTime) ? obj.startTime : 0,
    duration: isFiniteNumber(obj.duration) && obj.duration > 0 ? obj.duration : 1,
    sketchModifiers: sanitizeModifiers(obj.sketchModifiers),
    graphModifiers: sanitizeModifiers(obj.graphModifiers),
  };
}

//#region デシリアライズ

// 極座標のハンドル -> p5.Vector
function deserializeHandle(
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
function deserializeGraphHandle(
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

// シリアライズされたパス群 -> Path[]
export function deserializePaths(
  serializedPaths: SerializedProjectPath[],
  p: p5,
): Path[] {
  return serializedPaths.map((serializedPath) => {
    const serializedKeyframes = serializedPath.keyframes;
    const bboxX = serializedPath.bbox.x;
    const bboxY = serializedPath.bbox.y;
    const width = serializedPath.bbox.width;
    const height = serializedPath.bbox.height;

    const keyframes: Keyframe[] = serializedKeyframes.map((keyframe, index) => {
      const fallbackTime = index / Math.max(1, serializedKeyframes.length - 1);
      const rawTime = isFiniteNumber(keyframe.time) ? keyframe.time : fallbackTime;
      const time = Math.max(0, Math.min(1, rawTime));

      return {
        time,
        position: p.createVector(
          bboxX + keyframe.x * width,
          bboxY + keyframe.y * height,
        ),
      };
    });

    // time は単調増加になるよう補正
    for (let i = 1; i < keyframes.length; i++) {
      if (keyframes[i].time < keyframes[i - 1].time) {
        keyframes[i].time = keyframes[i - 1].time;
      }
    }

    const diagonal = Math.hypot(width, height);
    for (let i = 0; i < keyframes.length - 1; i++) {
      const startSerialized = serializedKeyframes[i];
      const endSerialized = serializedKeyframes[i + 1];
      const startKeyframe = keyframes[i];
      const endKeyframe = keyframes[i + 1];

      if (startSerialized.sketchOut && diagonal > 1e-6) {
        const outHandle = deserializeHandle(
          startSerialized.sketchOut,
          startKeyframe.position,
          diagonal,
          p,
        );
        startKeyframe.sketchOut = outHandle.sub(startKeyframe.position);
      }

      if (endSerialized.sketchIn && diagonal > 1e-6) {
        const inHandle = deserializeHandle(
          endSerialized.sketchIn,
          endKeyframe.position,
          diagonal,
          p,
        );
        endKeyframe.sketchIn = inHandle.sub(endKeyframe.position);
      }
    }

    const curves = buildSketchCurves(keyframes);
    const progress = computeKeyframeProgress(keyframes, curves);

    for (let i = 0; i < keyframes.length - 1; i++) {
      const startSerialized = serializedKeyframes[i];
      const endSerialized = serializedKeyframes[i + 1];
      const startKeyframe = keyframes[i];
      const endKeyframe = keyframes[i + 1];

      const t0 = startKeyframe.time;
      const t1 = endKeyframe.time;
      const v0 = progress[i] ?? 0;
      const v1 = progress[i + 1] ?? v0;
      const segmentDiag = Math.hypot(t1 - t0, v1 - v0);
      if (segmentDiag <= 1e-6) continue;

      if (startSerialized.graphOut) {
        startKeyframe.graphOut = deserializeGraphHandle(
          startSerialized.graphOut,
          segmentDiag,
          p,
        );
      }

      if (endSerialized.graphIn) {
        endKeyframe.graphIn = deserializeGraphHandle(
          endSerialized.graphIn,
          segmentDiag,
          p,
        );
      }
    }

    const duration =
      isFiniteNumber(serializedPath.duration) && serializedPath.duration > 0
        ? serializedPath.duration
        : 1;
    const startTime =
      isFiniteNumber(serializedPath.startTime) && serializedPath.startTime >= 0
        ? serializedPath.startTime
        : 0;

    return {
      id:
        typeof serializedPath.id === 'string' && serializedPath.id.trim() !== ''
          ? serializedPath.id
          : crypto.randomUUID(),
      keyframes,
      startTime,
      duration,
      sketchModifiers: serializedPath.sketchModifiers,
      graphModifiers: serializedPath.graphModifiers,
    };
  });
}

// プロジェクトをシリアライズ
export function serializeProject(
  paths: Path[],
  settings: ProjectSettings,
): ProjectData {
  const serializedPaths = serializePaths(paths).map((serializedPath, index) => {
    const path = paths[index];
    const duration =
      isFiniteNumber(path.duration) && path.duration > 0 ? path.duration : 1;
    const startTime =
      isFiniteNumber(path.startTime) && path.startTime >= 0 ? path.startTime : 0;

    return {
      ...serializedPath,
      id: path.id,
      startTime,
      duration,
      sketchModifiers: sanitizeModifiers(path.sketchModifiers),
      graphModifiers: sanitizeModifiers(path.graphModifiers),
    };
  });

  return {
    settings,
    paths: serializedPaths,
  };
}

// プロジェクトをデシリアライズ
export function deserializeProject(data: unknown): {
  settings: ProjectSettings;
  paths: SerializedProjectPath[];
} {
  if (!isRecord(data)) throw new Error('Invalid project format: root object is required.');
  if (!Array.isArray(data.paths)) throw new Error('Invalid project format: paths must be an array.');

  const rawSettings = isRecord(data.settings) ? data.settings : undefined;
  const settings: ProjectSettings = {
    playbackDuration:
      isFiniteNumber(rawSettings?.playbackDuration)
        ? rawSettings.playbackDuration
        : DEFAULT_PROJECT_SETTINGS.playbackDuration,
    playbackFrameRate:
      isFiniteNumber(rawSettings?.playbackFrameRate)
        ? rawSettings.playbackFrameRate
        : DEFAULT_PROJECT_SETTINGS.playbackFrameRate,
  };

  const paths = data.paths.map((path) => toSerializedProjectPath(path));

  return { settings, paths };
}
