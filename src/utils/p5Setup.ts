/**
 * p5.js の初期化設定。
 * FriendlyErrors と SketchChecker を無効化して描画パフォーマンスを向上させる。
 */

import p5 from 'p5';

type P5WithErrorToggles = typeof p5 & {
  disableFriendlyErrors?: boolean;
  disableSketchChecker?: boolean;
};

const p5WithErrorToggles = p5 as P5WithErrorToggles;
p5WithErrorToggles.disableFriendlyErrors = true;
p5WithErrorToggles.disableSketchChecker = true;
