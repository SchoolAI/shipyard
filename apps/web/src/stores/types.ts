export type MessageRole = 'user' | 'agent';

export interface MessageData {
  id: string;
  taskId: string;
  role: MessageRole;
  content: string;
  isThinking?: boolean;
  createdAt: number;
}
