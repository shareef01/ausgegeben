import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useLongPress } from '@/hooks/useLongPress';

interface AddTransactionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick'> {
  onAdd: () => void;
  onLongPress?: () => void;
  children: ReactNode;
}

export function AddTransactionButton({
  onAdd,
  onLongPress,
  children,
  onContextMenu,
  ...rest
}: AddTransactionButtonProps) {
  const press = useLongPress(
    () => onLongPress?.(),
    onAdd,
  );

  return (
    <button
      type="button"
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
      {...press}
      {...rest}
    >
      {children}
    </button>
  );
}
