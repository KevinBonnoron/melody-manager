import type { Task } from '@melody-manager/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { tasksClient } from '@/clients/tasks.client';

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
  const initializedRef = useRef(false);
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
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    const unsub = tasksClient.events((task) => {
      upsertTask(task);
    });

    return () => {
      unsub?.();
      initializedRef.current = false;
    };
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
