import type { Task, TaskStatus, TaskType } from '@melody-manager/shared';

type TaskListener = (task: Task) => void;

class TaskService {
  private readonly tasks = new Map<string, Task>();
  private readonly listeners = new Set<TaskListener>();
  private counter = 0;

  public create(type: TaskType, name: string): Task {
    const id = `task-${++this.counter}-${Date.now()}`;
    const now = new Date().toISOString();
    const task: Task = {
      id,
      type,
      name,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    this.notify(task);
    return task;
  }

  public update(id: string, patch: { status?: TaskStatus; progress?: number }): Task | null {
    const task = this.tasks.get(id);
    if (!task) {
      return null;
    }
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    this.notify(task);
    return task;
  }

  public getAll(): Task[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public onUpdate(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public clearCompleted(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id);
      }
    }
  }

  public cleanup(maxAge = 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    for (const [id, task] of this.tasks) {
      if ((task.status === 'completed' || task.status === 'failed') && new Date(task.updatedAt).getTime() < cutoff) {
        this.tasks.delete(id);
      }
    }
  }

  private notify(task: Task): void {
    for (const listener of this.listeners) {
      listener(task);
    }
  }
}

export const taskService = new TaskService();
