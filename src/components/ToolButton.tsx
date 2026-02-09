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
}: ToolButtonProps) => (
  <button
    title={title}
    className={`corner-md flex h-9 w-9 cursor-pointer items-center justify-center transition-colors ${
      isSelected
        ? 'bg-gray-50 text-gray-950 hover:bg-gray-200'
        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
    }`}
    onClick={onClick}
  >
    <Icon className="h-4 w-4" />
  </button>
);
