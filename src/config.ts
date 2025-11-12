/// アプリケーション設定

export interface Config {
  showSketch: boolean;      // ストロークの初期表示状態
  errorTolerance: number;   // 許容誤差(ピクセル)
  defaultDragMode: number;  // デフォルトのドラッグモード
  lineWeight: number;       // 線の太さ
  pointSize: number;        // 制御点のサイズ
};

export interface Colors {
  handle: string;      // 制御点の色
  curve: string;       // ベジェ曲線の色
  sketch: string;      // スケッチ線の色
  background: string;  // 背景色
}

export const DEFAULT_CONFIG: Config = {
  showSketch: false,
  errorTolerance: 10.0,
  defaultDragMode: 1,
  lineWeight: 2,
  pointSize: 8,
};

export const DEFAULT_COLORS: Colors = {
  handle: '#fbbf24',      // Amber-400
  curve: '#f9fafb',       // Gray-50
  sketch: '#374151',      // Gray-700
  background: '#030712',  // Gray-950
};