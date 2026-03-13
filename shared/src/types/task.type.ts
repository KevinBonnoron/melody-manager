export type TaskType = 'download' | 'resync' | 'scan' | 'import' | 'enrichment';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: TaskType;
  name: string;
  status: TaskStatus;
  progress?: number;
  createdAt: string;
  updatedAt: string;
}
