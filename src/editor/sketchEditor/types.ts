import type { Colors, Config } from '../../config';
import type { HandleManager } from '../../core/handleManager';
import type { MotionManager } from '../../core/motionManager';
import type { DomRefs } from '../../dom';
import type { SketchSuggestionManager } from '../../suggestion/sketchSuggestion';
import type { Path } from '../../types';

// ツール共通のコンテキスト
export interface ToolContext {
  // データ参照
  paths: Path[];
  activePath: Path | null;

  // マネージャー
  handleManager: HandleManager;
  suggestionManager: SketchSuggestionManager;
  motionManager: MotionManager | null;

  // 設定
  config: Config;
  colors: Colors;
  dom: DomRefs;

  // コールバック
  setActivePath(path: Path | null): void;
  addPath(path: Path): void;
  onPathCreated(path: Path): void;
  onPathSelected(path: Path | null): void;
}
