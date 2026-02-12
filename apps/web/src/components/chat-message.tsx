import { Avatar } from '@heroui/react';
import { Bot } from 'lucide-react';

export type MessageRole = 'user' | 'agent';

export interface ChatMessageData {
  id: string;
  role: MessageRole;
  content: string;
  isThinking?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

function AgentMessage({ message }: ChatMessageProps) {
  return (
    <div className="flex items-start gap-3 max-w-3xl">
      <Avatar className="size-7 shrink-0 bg-default mt-0.5">
        <Avatar.Fallback>
          <Bot className="w-4 h-4 text-muted" />
        </Avatar.Fallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        {message.isThinking ? (
          <div className="py-2">
            <ThinkingDots />
          </div>
        ) : (
          <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ message }: ChatMessageProps) {
  return (
    <div className="flex justify-end max-w-3xl ml-auto">
      <div className="bg-default rounded-2xl px-4 py-2.5 max-w-[80%]">
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  if (message.role === 'user') {
    return <UserMessage message={message} />;
  }
  return <AgentMessage message={message} />;
}
