import { useToastStore } from '@/services/toastStore';

export function ToastHost() {
  const message = useToastStore((s) => s.message);
  const actionLabel = useToastStore((s) => s.actionLabel);
  const onAction = useToastStore((s) => s.onAction);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!message) return null;

  return (
    <div className="toast-host" role="status">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="toast-host__action" onClick={() => { onAction(); dismiss(); }}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
