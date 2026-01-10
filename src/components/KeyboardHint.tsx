type KeyboardHintProps = {
  keys: string;
  label: string;
};

export const KeyboardHint = ({ keys, label }: KeyboardHintProps) => (
  <span>
    <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400">
      {keys}
    </kbd>{' '}
    {label}
  </span>
);
