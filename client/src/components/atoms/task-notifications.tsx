import type { TaskStatus } from '@melody-manager/shared';
import { useTasks } from '@/contexts/task-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Bell, CheckCircle2, Loader2, AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function TaskNotifications() {
  const { t } = useTranslation();
  const { tasks, activeTasks, hasActiveTasks, clearCompleted } = useTasks();

  const recentTasks = tasks.slice(0, 10);
  const hasCompletedTasks = tasks.length > activeTasks.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('Tasks.title')}>
          <Bell className="h-4 w-4" />
          {hasActiveTasks && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">{t('Tasks.title')}</DropdownMenuLabel>
          {hasCompletedTasks && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearCompleted}>
              <X className="h-3 w-3 mr-1" />
              {t('Tasks.clear')}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {recentTasks.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">{t('Tasks.empty')}</div>
        ) : (
          recentTasks.map((task) => (
            <DropdownMenuItem key={task.id} className="flex items-start gap-3 py-2 cursor-default" onSelect={(e) => e.preventDefault()}>
              <TaskStatusIcon status={task.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {t(`Tasks.types.${task.type}`)} — {task.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {t(`Tasks.status.${task.status}`)} · {new Date(task.updatedAt).toLocaleTimeString()}
                </p>
                {task.status === 'running' && task.progress !== undefined && (
                  <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} />
                  </div>
                )}
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0 mt-0.5" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
    default:
      return <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />;
  }
}
