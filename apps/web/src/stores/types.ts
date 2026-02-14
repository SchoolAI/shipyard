export type TaskStatus = 'pending' | 'active' | 'completed' | 'error';

export type AgentState = 'running' | 'idle' | 'error';

export interface AgentInfo {
  name: string;
  state: AgentState;
}

export interface TaskData {
  id: string;
  title: string;
  status: TaskStatus;
  agent: AgentInfo | null;
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = 'user' | 'agent';

export interface MessageData {
  id: string;
  taskId: string;
  role: MessageRole;
  content: string;
  isThinking?: boolean;
  createdAt: number;
}
