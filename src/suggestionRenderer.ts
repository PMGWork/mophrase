import p5 from 'p5';
import type { Path, Suggestion, SuggestionHitTarget } from './types';
import type { Colors } from './config';

const boxWidth = 150;
const boxHeight = 35;
const boxOffsetX = 20;
const boxOffsetY = 45;

// 提案を描画する
export function drawSuggestions(
  p: p5,
  colors: Colors,
  path: Path | undefined,
  suggestions: Suggestion[],
  isLoading: boolean
): SuggestionHitTarget[] {
  if (!path || (suggestions.length === 0 && !isLoading)) return [];
  const anchor = getLatestEndPoint([path]);
  if (!anchor) return [];

  const hitTargets: SuggestionHitTarget[] = [];

  p.push();
  p.textFont('Geist');
  p.textAlign(p.LEFT, p.CENTER);
  p.rectMode(p.CENTER);

  // 提案ボックスの基準位置を計算
  const baseX = anchor.x + boxOffsetX;
  const baseY = anchor.y;

  if (isLoading) {
    // ローディング表示
    for(let i = 0; i < 3; i++) {
      const offsetY = (i - 1) * boxOffsetY;
      const boxX = baseX;
      const boxY = baseY + offsetY - boxHeight/2;

      drawSuggestion(p, colors, boxX, boxY, 'Generating...');

      hitTargets.push({
        id: 'loading',
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
      });
    }
  } else {
    // 提案の表示
    suggestions.forEach((suggestion, index) => {
      const offsetY = (index - (suggestions.length - 1) / 2) * boxOffsetY;
      const boxX = baseX;
      const boxY = baseY + offsetY - boxHeight/2;

      drawSuggestion(p, colors, boxX, boxY, suggestion.title);

      hitTargets.push({
        id: suggestion.id,
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
      });
    });
  }

  p.pop();
  return hitTargets;
}

// 提案を描画する共通関数
function drawSuggestion(
  p: p5,
  colors: Colors,
  boxX: number,
  boxY: number,
  text: string
): void {
  // 背景ボックスの描画
  p.fill(colors.background);
  p.stroke(colors.border);
  p.strokeWeight(1);
  p.rect(boxX + boxWidth/2, boxY + boxHeight/2, boxWidth, boxHeight, 4);

  // テキストの描画
  p.noStroke();
  p.fill(colors.curve);
  p.textSize(12);
  p.text(text, boxX + 16, boxY + boxHeight/2 + 1.5);
}

// 最新のパスの終点を取得
function getLatestEndPoint(paths: Path[]): p5.Vector | null {
  for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex--) {
    const path = paths[pathIndex];
    if (!path) continue;
    if (path.curves.length > 0) {
      const lastCurve = path.curves[path.curves.length - 1];
      const endPoint = lastCurve?.[3];
      if (endPoint) return endPoint.copy();
    }
    if (path.points.length > 0) {
      const fallback = path.points[path.points.length - 1];
      if (fallback) return fallback.copy();
    }
  }
  return null;
}