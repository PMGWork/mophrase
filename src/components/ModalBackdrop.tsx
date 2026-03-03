import type { ReactNode, MouseEvent } from 'react';

// モーダルの背景コンポーネント
type ModalBackdropProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

// モーダルの背景コンポーネント
export const ModalBackdrop = ({
  isOpen,
  onClose,
  children,
}: ModalBackdropProps) => {
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ display: isOpen ? 'flex' : 'none' }}
      onClick={handleBackdropClick}
    >
      {children}
    </div>
  );
};
