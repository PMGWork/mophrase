/**
 * ResizeObserver を使ったコンテナのリサイズ監視フック。
 * リサイズ時にコールバックを呼び出す。
 */

import { useEffect, type RefObject } from 'react';

export function useResizeObserver(
  containerRef: RefObject<HTMLElement | null>,
  callback: () => void,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      callback();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef, callback]);
}
