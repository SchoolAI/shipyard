import type { TaskId } from '@shipyard/loro-schema';
import { InputRequestModal } from './input-request-modal';
import type { AnyInputRequest } from './input-request-types';
import { MultiQuestionInputModal } from './multi-question-input-modal';

export type { AnyInputRequest } from './input-request-types';

interface AnyInputRequestModalProps {
  isOpen: boolean;
  request: AnyInputRequest | null;
  taskId: TaskId;
  onClose: () => void;
}

export function AnyInputRequestModal({
  isOpen,
  request,
  taskId,
  onClose,
}: AnyInputRequestModalProps) {
  if (request?.type === 'multi') {
    return (
      <MultiQuestionInputModal
        isOpen={isOpen}
        request={request}
        taskId={taskId}
        onClose={onClose}
      />
    );
  }

  return <InputRequestModal isOpen={isOpen} request={request} taskId={taskId} onClose={onClose} />;
}
