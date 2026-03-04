import type { Keyframe, SerializedKeyframe } from '../types';

type CornerLike = Pick<
  Keyframe | SerializedKeyframe,
  'sketchCorner' | 'graphCorner'
>;

// Sketch用のコーナー判定
export function isSketchCorner(keyframe: CornerLike): boolean {
  return keyframe.sketchCorner ?? false;
}

// Graph用のコーナー判定
export function isGraphCorner(keyframe: CornerLike): boolean {
  return keyframe.graphCorner ?? false;
}
