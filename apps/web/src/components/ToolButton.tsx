import type { LucideIcon } from 'lucide-react';

type ToolButtonProps = {
  title: string;
  icon: LucideIcon;
  isSelected?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export const ToolButton = ({
  title,
  icon: Icon,
  isSelected = false,
  disabled = false,
  onClick,
}: ToolButtonProps) => {
  const baseClass =
    'corner-md focus-visible:ring-border flex h-9 w-9 items-center justify-center transition-colors focus-visible:ring-1 focus-visible:outline-none';
  const selectedClass = 'bg-gray-50 text-gray-950 ring-border ring-1';
  const idleClass = 'bg-gray-800 text-gray-300';
  const interactiveClass =
    'cursor-pointer hover:bg-gray-700 hover:text-gray-100';
  const disabledClass = 'cursor-not-allowed opacity-40';

  return (
    <button
      type="button"
      title={title}
      className={`${baseClass} ${isSelected ? selectedClass : idleClass} ${
        disabled
          ? disabledClass
          : isSelected
            ? 'cursor-pointer'
            : interactiveClass
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};
