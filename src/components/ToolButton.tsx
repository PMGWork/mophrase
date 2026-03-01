import type { LucideIcon } from 'lucide-react';

type ToolButtonProps = {
  title: string;
  icon: LucideIcon;
  isSelected?: boolean;
  onClick: () => void;
};

export const ToolButton = ({
  title,
  icon: Icon,
  isSelected = false,
  onClick,
}: ToolButtonProps) => {
  const baseClass =
    'corner-md focus-visible:ring-border flex h-9 w-9 cursor-pointer items-center justify-center transition-colors focus-visible:ring-1 focus-visible:outline-none';
  const selectedClass =
    'bg-gray-50 text-gray-950 ring-border ring-1 hover:bg-gray-200';
  const idleClass = 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100';

  return (
    <button
      type="button"
      title={title}
      className={`${baseClass} ${isSelected ? selectedClass : idleClass}`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
};
