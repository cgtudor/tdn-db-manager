import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
  error?: string | null;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description,
  confirmLabel = 'Confirm', variant = 'danger', isLoading, error
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Prevent closing via Escape while loading
  const handleCancel = (e: React.SyntheticEvent) => {
    if (isLoading) {
      e.preventDefault();
      return;
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={handleCancel}
      className="rounded-lg shadow-xl border border-border bg-surface text-text p-0 backdrop:bg-black/50 max-w-md w-full"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-full bg-red-100 dark:bg-red-900/30 p-2">
            <AlertTriangle className="h-5 w-5 text-danger" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text">{title}</h3>
            {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button variant={variant} size="sm" onClick={onConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isLoading ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
