import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { tasksClient } from '@/clients/tasks.client';
import type { Task } from '@/shared';

interface TaskContextValue {
  tasks: Task[];
  activeTasks: Task[];
  hasActiveTasks: boolean;
  clearCompleted: () => void;
}

const TaskContext = createContext<TaskContextValue>({
  tasks: [],
  activeTasks: [],
  hasActiveTasks: false,
  clearCompleted: () => {},
});

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const upsertTask = useCallback((task: Task) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = task;
        return updated;
      }

      return [task, ...prev];
    });
  }, []);

  useEffect(() => {
    const unsub = tasksClient.events((task) => {
      upsertTask(task);
    });

    return unsub;
  }, [upsertTask]);

  const activeTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'running');
  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === 'pending' || t.status === 'running'));
    tasksClient.clearCompleted();
  }, []);

  return <TaskContext.Provider value={{ tasks, activeTasks, hasActiveTasks: activeTasks.length > 0, clearCompleted }}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  return useContext(TaskContext);
}
