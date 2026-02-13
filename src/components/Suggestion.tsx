import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { Suggestion, SuggestionStatus } from '../types';
import { clamp } from '../utils/number';
import { SuggestionItem } from './SuggestionItem';

// Props
type SketchSuggestionProps = {
  isVisible: boolean;
  placeholder: string;
  status: SuggestionStatus;
  suggestions: Suggestion[];
  position: { left: number; top: number } | null;
  testMode: boolean;
  onSubmit: (prompt: string) => void;
  onHoverChange: (id: string | null, strength: number) => void;
  onSuggestionClick: (id: string, strength: number) => void;
};

// コンポーネント
export const SketchSuggestion = ({
  isVisible,
  placeholder,
  status,
  suggestions,
  position,
  testMode,
  onSubmit,
  onHoverChange,
  onSuggestionClick,
}: SketchSuggestionProps) => {
  // 入力欄への参照
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ホバー状態
  const [hovered, setHovered] = useState<{
    id: string | null;
    strength: number;
  }>({ id: null, strength: 1 });

  // ローディング表示
  const showLoading = status === 'generating';

  // 入力欄にフォーカス
  useEffect(() => {
    if (!isVisible) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [isVisible]);

  // 非表示時にホバー状態をリセット
  useEffect(() => {
    if (!isVisible) {
      setHovered({ id: null, strength: 1 });
      onHoverChange(null, 1);
    }
  }, [isVisible, onHoverChange]);

  // プロンプト送信処理
  const handleSubmit = (event: React.FormEvent) => {
    // フォーム送信を防止
    event.preventDefault();

    // プロンプトを取得して送信
    const prompt = inputRef.current?.value ?? '';
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    onSubmit(trimmedPrompt);

    // 入力欄をクリア
    if (inputRef.current) inputRef.current.value = '';
  };

  // 影響度を計算
  const computeStrength = (clientX: number, rect: DOMRect): number =>
    clamp(((clientX - rect.left) / rect.width) * 2, 0, 2);

  // ホバー状態更新
  const updateHover = (id: string | null, strength: number) => {
    setHovered({ id, strength });
    onHoverChange(id, strength);
  };

  // マウスイベントハンドラ
  const handleMouseEnter =
    (id: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const strength = computeStrength(event.clientX, rect);
      updateHover(id, strength);
    };

  // マウス移動ハンドラ
  const handleMouseMove =
    (id: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const strength = computeStrength(event.clientX, rect);
      updateHover(id, strength);
    };

  // マウス離脱ハンドラ
  const handleMouseLeave = () => {
    updateHover(null, 1);
  };

  // クリックハンドラ
  const handleClick =
    (id: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const strength = computeStrength(event.clientX, rect);
      onSuggestionClick(id, strength);
    };

  return (
    <div
      id="sketchSuggestionContainer"
      className="corner-lg border-border bg-panel fixed z-50 flex min-w-60 flex-col overflow-hidden border shadow-[0_0_15px_0_rgba(16,24,40,0.5)]"
      style={{
        display: isVisible ? 'flex' : 'none',
        left: position?.left,
        top: position?.top,
      }}
    >
      <form
        id="sketchPromptForm"
        className="flex items-center"
        onSubmit={handleSubmit}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          className="text-text placeholder:text-text-subtle flex-1 p-3 text-sm focus:outline-none"
        />
        <button
          type="submit"
          className="text-text-muted hover:text-text cursor-pointer p-3"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <div
        id="sketchSuggestionList"
        className="*:border-border flex max-h-60 flex-col overflow-y-auto *:border-t empty:hidden"
      >
        {/* ローディング表示 */}
        {showLoading && (
          <div className="suggestion-loading text-text-muted px-3 py-2 text-sm">
            {testMode ? 'Testing...' : 'Generating...'}
          </div>
        )}

        {/* 提案リスト */}
        {!showLoading &&
          suggestions.map((suggestion) => (
            <SuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              isHovered={hovered.id === suggestion.id}
              strength={hovered.strength}
              onMouseEnter={handleMouseEnter(suggestion.id)}
              onMouseMove={handleMouseMove(suggestion.id)}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick(suggestion.id)}
            />
          ))}
      </div>
    </div>
  );
};
