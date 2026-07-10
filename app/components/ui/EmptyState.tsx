import { Button } from "@/app/components/ui/Button";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 rounded-2xl grad-brand text-white flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <p className="text-sm font-bold text-ink">{title}</p>
      {subtitle && <p className="text-xs text-ink-soft mt-1">{subtitle}</p>}
      {action && (
        <div className="mt-5">
          <Button variant="primary" size="md" href={action.href}>{action.label}</Button>
        </div>
      )}
    </div>
  );
}
