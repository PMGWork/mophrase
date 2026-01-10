import { useRef } from 'react';
import { Send } from 'lucide-react';

type SketchSuggestionProps = {
  onSubmit: (prompt: string) => void;
};

export const SketchSuggestion = ({ onSubmit }: SketchSuggestionProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      id="sketchSuggestionContainer"
      className="corner-lg fixed z-50 min-w-60 overflow-hidden border border-gray-800 bg-gray-900 shadow-[0_0_15px_0_rgba(16,24,40,0.5)]"
      style={{ display: 'none' }}
    >
      <form
        id="sketchPromptForm"
        className="flex items-center"
        onSubmit={(event) => {
          event.preventDefault();
          const value = inputRef.current?.value ?? '';
          const trimmed = value.trim();
          if (!trimmed) return;
          onSubmit(trimmed);
          if (inputRef.current) inputRef.current.value = '';
        }}
      >
        <input
          ref={inputRef}
          id="sketchPromptInput"
          type="text"
          placeholder="Enter instructions..."
          autoComplete="off"
          className="flex-1 p-3 text-sm text-gray-50 placeholder:text-gray-500 focus:outline-none"
        />
        <button type="submit" className="cursor-pointer p-3">
          <Send className="h-4 w-4" />
        </button>
      </form>
      <div
        id="sketchSuggestionList"
        className="flex max-h-60 flex-col overflow-y-auto *:border-t *:border-gray-800 empty:hidden"
      />
    </div>
  );
};
