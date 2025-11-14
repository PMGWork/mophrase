import p5 from 'p5';
import type { Path, SerializedPath, SerializedVector, Suggestion, SuggestionHitTarget } from './types';
import type { Colors, Config } from './config';
import { suggestionResponseSchema } from './types';
import { generateStructured } from './llmService';
import { drawSuggestions } from './suggestionRenderer';


// #region 提案マネージャー
// 提案の状態
export type SuggestionState = 'idle' | 'loading' | 'error';

// 提案管理クラス
export class SuggestionManager {
  private suggestions: Suggestion[] = [];
  private hitTargets: SuggestionHitTarget[] = [];
  private status: SuggestionState = 'idle';
  private config: Config;
  private targetPath: Path | undefined;

  constructor(config: Config) {
    this.config = config;
  }

  // 提案を生成する
  async generate(targetPath: Path): Promise<void> {
    if (!targetPath) {
      this.setState('error');
      return;
    }

    this.targetPath = targetPath;

    this.clear();
    this.setState('loading');

    try {
      const fetched = await fetchSuggestions(
        serializePaths([targetPath]),
        () => this.generateId(),
        this.config.llmPrompt
      );
      this.suggestions = fetched;
      this.setState('idle');
    } catch (error) {
      console.error(error);
      this.setState('error');
    }
  }

  // 提案をリセットする
  reset(): void {
    this.clear();
    this.targetPath = undefined;
    this.setState('idle');
  }

  // 提案を描画する
  draw(p: p5, colors: Colors, path: Path | undefined): void {
    if (!path) {
      this.hitTargets = [];
      p.cursor('default');
      return;
    }
    this.hitTargets = drawSuggestions(p, colors, path, this.suggestions, this.status === 'loading');

    // マウスカーソルを変更
    if (this.status !== 'loading') {
      const isOver = this.hitTargets.some(
        (hit) => p.mouseX >= hit.x && p.mouseX <= hit.x + hit.width && p.mouseY >= hit.y && p.mouseY <= hit.y + hit.height
      );
      p.cursor(isOver ? 'pointer' : 'default');
    }
  }

  // 提案を選択してパスを取得する
  trySelectSuggestion(x: number, y: number, p: p5): Path[] | null {
    const target = this.hitTargets.find(
      (hit) => x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height
    );
    if (!target || target.id === 'loading') return null;

    const suggestion = this.suggestions.find((entry) => entry.id === target.id);
    if (!suggestion) return null;

    const restored = deserializePaths([suggestion.path], [this.targetPath!], p);
    if (restored.length === 0) {
      this.setState('error');
      return null;
    }

    // 提案されたパスを返す
    this.setState('idle');
    this.clear();
    return restored;
  }

  // 状態を更新する
  private setState(state: SuggestionState): void {
    this.status = state;
  }

  // 提案をクリアする
  private clear(): void {
    this.suggestions = [];
    this.hitTargets = [];
    this.targetPath = undefined;
  }

  // 一意な提案IDを生成する
  private generateId(): string {
    return crypto.randomUUID();
  }
}


// #region プライベート関数
// パス配列をシリアライズする
function serializePaths(paths: Path[]): SerializedPath[] {
  return paths.map((path) => ({
    points: path.points.map((point) => toSerializedVector(point)),
    curves: path.curves.map((curve) => curve.map((point) => toSerializedVector(point))),
  }));
}

// パス配列をデシリアライズする
function deserializePaths(serializedPaths: SerializedPath[], paths: Path[], p: p5): Path[] {
  return serializedPaths.map((path, index) => ({
    points: path.points.map((point) => p.createVector(point.x, point.y)),
    curves: path.curves.map((curve) => curve.map((point) => p.createVector(point.x, point.y))),
    fitError: paths[index].fitError
  }));
}

// ベクトルをシリアライズ形式に変換する
function toSerializedVector(vec: p5.Vector): SerializedVector {
  const precision = 100;
  return {
    x: Math.round(vec.x * precision) / precision,
    y: Math.round(vec.y * precision) / precision,
  };
}

// プロンプトを構築する
function buildPrompt(serializedPaths: SerializedPath[], basePrompt: string): string {
  return [
    basePrompt,
    '',
    '入力データ:',
    JSON.stringify({ paths: serializedPaths }, null, 2),
  ].join('\n');
}

// LLM から提案を取得する
async function fetchSuggestions(
  serializedPaths: SerializedPath[],
  generateId: () => string,
  basePrompt: string
): Promise<Suggestion[]> {
  const prompt = buildPrompt(serializedPaths, basePrompt);
  const result = await generateStructured(prompt, suggestionResponseSchema, 'Groq');

  return result.suggestions.map((suggestion): Suggestion => ({
    id: generateId(),
    title: suggestion.title,
    description: suggestion.description,
    path: suggestion.path,
  }));
}
