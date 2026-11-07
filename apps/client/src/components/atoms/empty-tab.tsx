import type { ReactNode } from 'react';

export function EmptyTab({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
