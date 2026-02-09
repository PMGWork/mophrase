export const colors = {
  background: 'var(--color-background)',
  panel: 'var(--color-panel)',
  panelElevated: 'var(--color-panel-elevated)',
  border: 'var(--color-border)',
  borderMuted: 'var(--color-border-muted)',
  text: 'var(--color-text)',
  textMuted: 'var(--color-text-muted)',
  textSubtle: 'var(--color-text-subtle)',
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  object1: 'var(--color-object-1)',
  object2: 'var(--color-object-2)',
  object3: 'var(--color-object-3)',
} as const;

export type Color = (typeof colors)[keyof typeof colors];

let cachedComputedStyles: CSSStyleDeclaration | null = null;

function getComputedStyles(): CSSStyleDeclaration {
  if (!cachedComputedStyles) {
    cachedComputedStyles = getComputedStyle(document.documentElement);
  }
  return cachedComputedStyles;
}

export function resolveColor(cssVar: string): string {
  if (!cssVar.startsWith('var(--')) {
    return cssVar;
  }
  const computed = getComputedStyles();
  return computed.getPropertyValue(cssVar.slice(4, -1)).trim();
}
