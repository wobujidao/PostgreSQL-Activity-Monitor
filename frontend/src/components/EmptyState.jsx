import { Button } from '@/components/ui/button';

/**
 * @param {{ icon: React.ElementType, title: string, description?: string, actionLabel?: string, onAction?: () => void }} props
 */
export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && <Icon className="h-16 w-16 text-muted-foreground/40 mb-4" strokeWidth={1.2} />}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4">{actionLabel}</Button>
      )}
    </div>
  );
}
