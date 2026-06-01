import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && <Icon className="h-10 w-10 text-text-muted mb-3 opacity-60" />}
      <h3 className="text-sm font-medium text-text" style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}>
        {title}
      </h3>
      {description && <p className="mt-1 text-sm text-text-muted italic">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
