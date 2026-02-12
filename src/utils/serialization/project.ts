/**
 * プロジェクト全体の保存と復元。
 * パス・モディファイア・設定を含む ProjectData を JSON 形式で入出力する。
 */

import type p5 from 'p5';
import type {
  GraphKeyframeDelta,
  GraphModifier,
  Keyframe,
  Path,
  ProjectData,
  ProjectSettings,
  SerializedKeyframe,
  SerializedPath,
  SerializedProjectPath,
  SketchKeyframeDelta,
  SketchModifier,
} from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { buildSketchCurves, computeKeyframeProgress } from '../keyframes';
import {
  deserializeGraphHandle,
  deserializeHandle,
  serializePaths,
} from './curves';

// #region エクスポート関数

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
      isFiniteNumber(path.startTime) && path.startTime >= 0
        ? path.startTime
        : 0;

    return {
      ...serializedPath,
      id: path.id,
      startTime,
      duration,
      sketchModifiers: sanitizeSketchModifiers(path.sketchModifiers),
      graphModifiers: sanitizeGraphModifiers(path.graphModifiers),
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
  if (!isRecord(data))
    throw new Error('Invalid project format: root object is required.');
  if (!Array.isArray(data.paths))
    throw new Error('Invalid project format: paths must be an array.');

  const rawSettings = isRecord(data.settings) ? data.settings : undefined;
  const settings: ProjectSettings = {
    playbackDuration: isFiniteNumber(rawSettings?.playbackDuration)
      ? rawSettings.playbackDuration
      : DEFAULT_PROJECT_SETTINGS.playbackDuration,
    playbackFrameRate: isFiniteNumber(rawSettings?.playbackFrameRate)
      ? rawSettings.playbackFrameRate
      : DEFAULT_PROJECT_SETTINGS.playbackFrameRate,
  };

  const paths = data.paths.map((path) => toSerializedProjectPath(path));

  return { settings, paths };
}

// #region プライベート関数

type ModifierMeta = {
  id: string;
  name: string;
  strength: number;
};

type DeltaMapper<TDelta> = (
  raw: Record<string, unknown>,
  delta: TDelta,
) => void;

// unknown -> SketchModifier | null（新フォーマット対応）
function parseSketchModifier(
  value: unknown,
  numKeyframes: number,
): SketchModifier | null {
  if (!isRecord(value)) return null;
  const meta = parseModifierMeta(value);

  // 新フォーマット（deltas）
  if (Array.isArray(value.deltas)) {
    return {
      ...meta,
      deltas: parseModifierDeltas({
        rawDeltas: value.deltas,
        numKeyframes,
        mapDelta: mapSketchDelta,
      }),
    };
  }
  return null;
}

// unknown -> GraphModifier | null（新フォーマット対応）
function parseGraphModifier(
  value: unknown,
  numKeyframes: number,
): GraphModifier | null {
  if (!isRecord(value)) return null;
  const meta = parseModifierMeta(value);

  // 新フォーマット（deltas）
  if (Array.isArray(value.deltas)) {
    return {
      ...meta,
      deltas: parseModifierDeltas({
        rawDeltas: value.deltas,
        numKeyframes,
        mapDelta: mapGraphDelta,
      }),
    };
  }
  return null;
}

// シリアライズ用: SketchModifier[] をサニタイズ
function sanitizeSketchModifiers(
  modifiers: SketchModifier[] | undefined,
): SketchModifier[] | undefined {
  return sanitizeModifierList(modifiers, sanitizeSketchDelta);
}

// シリアライズ用: GraphModifier[] をサニタイズ
function sanitizeGraphModifiers(
  modifiers: GraphModifier[] | undefined,
): GraphModifier[] | undefined {
  return sanitizeModifierList(modifiers, sanitizeGraphDelta);
}

// モディファイア共通メタ情報の取得
function parseModifierMeta(value: Record<string, unknown>): ModifierMeta {
  return {
    id:
      typeof value.id === 'string' && value.id.trim() !== ''
        ? value.id
        : crypto.randomUUID(),
    name: typeof value.name === 'string' ? value.name : 'modifier',
    strength: isFiniteNumber(value.strength) ? value.strength : 1,
  };
}

// 新フォーマットの deltas（密配列）を共通パース
function parseModifierDeltas<TDelta extends object>({
  rawDeltas,
  numKeyframes,
  mapDelta,
}: {
  rawDeltas: unknown[];
  numKeyframes: number;
  mapDelta: DeltaMapper<TDelta>;
}): TDelta[] {
  const createDelta = (): TDelta => ({}) as TDelta;

  const denseDeltas = rawDeltas.map((raw) => {
    const delta = createDelta();
    if (isRecord(raw)) mapDelta(raw, delta);
    return delta;
  });

  return fitDeltaLength(denseDeltas, numKeyframes, createDelta);
}

// デルタ配列を numKeyframes に揃える（不足は空オブジェクトで補完）
function fitDeltaLength<TDelta>(
  deltas: TDelta[],
  numKeyframes: number,
  createDelta: () => TDelta,
): TDelta[] {
  const normalized = deltas.slice(0, numKeyframes);
  while (normalized.length < numKeyframes) normalized.push(createDelta());
  return normalized;
}

function mapSketchDelta(
  raw: Record<string, unknown>,
  delta: SketchKeyframeDelta,
): void {
  if (isVector2(raw.positionDelta))
    delta.positionDelta = toVector2(raw.positionDelta);
  if (isVector2(raw.sketchInDelta))
    delta.sketchInDelta = toVector2(raw.sketchInDelta);
  if (isVector2(raw.sketchOutDelta))
    delta.sketchOutDelta = toVector2(raw.sketchOutDelta);
}

function mapGraphDelta(
  raw: Record<string, unknown>,
  delta: GraphKeyframeDelta,
): void {
  if (isVector2(raw.graphInDelta))
    delta.graphInDelta = toVector2(raw.graphInDelta);
  if (isVector2(raw.graphOutDelta))
    delta.graphOutDelta = toVector2(raw.graphOutDelta);
}

function sanitizeSketchDelta(delta: SketchKeyframeDelta): SketchKeyframeDelta {
  return {
    ...delta,
    positionDelta: delta.positionDelta
      ? sanitizeVector2(delta.positionDelta)
      : undefined,
    sketchInDelta: delta.sketchInDelta
      ? sanitizeVector2(delta.sketchInDelta)
      : undefined,
    sketchOutDelta: delta.sketchOutDelta
      ? sanitizeVector2(delta.sketchOutDelta)
      : undefined,
  };
}

function sanitizeGraphDelta(delta: GraphKeyframeDelta): GraphKeyframeDelta {
  return {
    ...delta,
    graphInDelta: delta.graphInDelta
      ? sanitizeVector2(delta.graphInDelta)
      : undefined,
    graphOutDelta: delta.graphOutDelta
      ? sanitizeVector2(delta.graphOutDelta)
      : undefined,
  };
}

function sanitizeModifierList<
  TDelta extends object,
  TModifier extends { deltas: TDelta[] },
>(
  modifiers: TModifier[] | undefined,
  sanitizeDelta: (delta: TDelta) => TDelta,
): TModifier[] | undefined {
  if (!modifiers || modifiers.length === 0) return undefined;
  const result = modifiers
    .filter((modifier) => modifier.deltas.length > 0)
    .map(
      (modifier) =>
        ({
          ...modifier,
          deltas: modifier.deltas.map((delta) => sanitizeDelta(delta)),
        }) as TModifier,
    );
  return result.length > 0 ? result : undefined;
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
    duration:
      isFiniteNumber(obj.duration) && obj.duration > 0 ? obj.duration : 1,
    // モディファイアは deserializePaths でキーフレーム情報ありでパースする
    sketchModifiers: Array.isArray(obj.sketchModifiers)
      ? (obj.sketchModifiers as SketchModifier[])
      : undefined,
    graphModifiers: Array.isArray(obj.graphModifiers)
      ? (obj.graphModifiers as GraphModifier[])
      : undefined,
  };
}

// プロジェクトのパスをデシリアライズ
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
      const rawTime = isFiniteNumber(keyframe.time)
        ? keyframe.time
        : fallbackTime;
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

    return {
      id: serializedPath.id || crypto.randomUUID(),
      keyframes,
      startTime: serializedPath.startTime,
      duration: serializedPath.duration,
      sketchModifiers: parseSketchModifiers(
        serializedPath.sketchModifiers,
        keyframes.length,
      ),
      graphModifiers: parseGraphModifiers(
        serializedPath.graphModifiers,
        keyframes.length,
      ),
    };
  });
}

// #region ヘルパー関数

// 値がRecordかどうかをチェック
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// 有限な数値かどうかをチェック
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// オプショナルなハンドルかどうかをチェック
function isOptionalHandle(value: unknown): boolean {
  return (
    value == null ||
    (isRecord(value) &&
      isFiniteNumber(value.angle) &&
      isFiniteNumber(value.dist))
  );
}

// 指定したキーがすべて有限な数値かどうかをチェック
function hasFiniteKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => isFiniteNumber(obj[key]));
}

// シリアライズされたキーフレームかどうかをチェック
function isSerializedKeyframe(value: unknown): value is SerializedKeyframe {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return false;
  if (value.time !== undefined && !isFiniteNumber(value.time)) return false;
  return (['sketchIn', 'sketchOut', 'graphIn', 'graphOut'] as const).every(
    (key) => isOptionalHandle(value[key]),
  );
}

// シリアライズされたパスかどうかをチェック
function isSerializedPath(value: unknown): value is SerializedPath {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.keyframes) || value.keyframes.length < 2)
    return false;
  if (!value.keyframes.every(isSerializedKeyframe)) return false;
  const bbox = value.bbox;
  if (!isRecord(bbox) || !hasFiniteKeys(bbox, ['x', 'y', 'width', 'height']))
    return false;
  return (
    Math.abs(bbox.width as number) > 1e-6 &&
    Math.abs(bbox.height as number) > 1e-6
  );
}

// { x, y } かどうかをチェック
function isVector2(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
  );
}

// unknown -> { x, y }
function toVector2(value: Record<string, number>): { x: number; y: number } {
  return { x: value.x, y: value.y };
}

// { x, y } をサニタイズ（NaN/Infinity 防止）
function sanitizeVector2(
  v: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: Number.isFinite(v.x) ? v.x : 0,
    y: Number.isFinite(v.y) ? v.y : 0,
  };
}

// デシリアライズ用: 生データからスケッチモディファイアをパース
function parseSketchModifiers(
  raw: unknown,
  numKeyframes: number,
): SketchModifier[] | undefined {
  return parseModifierList(raw, (v) => parseSketchModifier(v, numKeyframes));
}

// デシリアライズ用: 生データからグラフモディファイアをパース
function parseGraphModifiers(
  raw: unknown,
  numKeyframes: number,
): GraphModifier[] | undefined {
  return parseModifierList(raw, (v) => parseGraphModifier(v, numKeyframes));
}

function parseModifierList<T>(
  raw: unknown,
  parseItem: (value: unknown) => T | null,
): T[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const result = raw.map(parseItem).filter((v): v is T => v !== null);
  return result.length > 0 ? result : undefined;
}
