import type { ReactNode } from 'react';
import { ActionRow } from '@/components/ActionRow';

/** Adapter so the same harness renders the pre-change SwipeableRow from a HEAD checkout. */
export function RowFor(props: {
  label: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <ActionRow ariaLabel={props.label} onEdit={props.onEdit} onDuplicate={props.onDuplicate} onDelete={props.onDelete}>
      {props.children}
    </ActionRow>
  );
}
