type KeyboardHintProps = {
  keys: string;
  label: string;
};

export const KeyboardHint = ({ keys, label }: KeyboardHintProps) => (
  <span className="text-text-subtle">
    <kbd className="bg-panel-elevated text-text-muted rounded px-1.5 py-0.5">
      {keys}
    </kbd>{' '}
    {label}
  </span>
);
