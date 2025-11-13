/// アプリケーション設定

// スキーマ定義
export interface Config {
  showSketch: boolean;        // ストロークの初期表示状態
  errorTolerance: number;     // 許容誤差(ピクセル)
  coarseErrorWeight: number;  // 粗い誤差の倍数
  defaultDragMode: number;    // デフォルトのドラッグモード
  lineWeight: number;         // 線の太さ
  pointSize: number;          // 制御点のサイズ
  llmPrompt: string;          // LLMへの指示プロンプト
};

export interface Colors {
  handle: string;      // 制御点の色
  curve: string;       // ベジェ曲線の色
  sketch: string;      // スケッチ線の色
  border: string;      // 境界線の色
  background: string;  // 背景色
}

// デフォルト設定
export const DEFAULT_CONFIG: Config = {
  showSketch: false,
  errorTolerance: 10.0,
  coarseErrorWeight: 2.0,
  defaultDragMode: 1,
  lineWeight: 1,
  pointSize: 6,
  llmPrompt: [
    'あなたは手描き軌跡と自然言語の指示を組み合わせて文脈に沿ったモーション/シェイプパスを補正するアシスタントです。',
    '与えられたパスと意図（例：サイン波、バウンド、螺旋）を分析し、曲線の滑らかさ、制御点、シェイプ変形、拡大/回転など複合パラメータの親和性を改善する提案を3件提示してください。',
    '各提案にはループ回数、減衰、コミカル/リアルといった自然言語で調整可能なパラメータと、それらを再編集するための具体的な操作手順を含めてください。',
    'アニメーション原則や関連研究を踏まえつつ、位置だけでなくスケールや回転も含む再利用可能なパス設計の視点を示してください。',
    '英語4単語以内で各提案に修正内容のタイトルを付けてください。',
  ].join('\n'),
};

export const DEFAULT_COLORS: Colors = {
  handle: '#fbbf24',      // Amber-400
  curve: '#f9fafb',       // Gray-50
  sketch: '#374151',      // Gray-700
  border: '#1f2937',      // Gray-800
  background: '#030712',  // Gray-950
};
