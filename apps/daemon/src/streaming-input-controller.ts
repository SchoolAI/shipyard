import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

type Resolver = (result: IteratorResult<SDKUserMessage>) => void;

export class StreamingInputController {
  #queue: SDKUserMessage[] = [];
  #waiting: Resolver | null = null;
  #done = false;

  push(message: string): void {
    const sdkMessage: SDKUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: message,
      },
      parent_tool_use_id: null,
      session_id: '',
    };

    if (this.#done) return;

    if (this.#waiting) {
      const resolve = this.#waiting;
      this.#waiting = null;
      resolve({ value: sdkMessage, done: false });
    } else {
      this.#queue.push(sdkMessage);
    }
  }

  end(): void {
    this.#done = true;
    if (this.#waiting) {
      const resolve = this.#waiting;
      this.#waiting = null;
      // eslint-disable-next-line no-restricted-syntax -- IteratorResult requires value even when done
      resolve({ value: undefined as never, done: true });
    }
  }

  get isDone(): boolean {
    return this.#done;
  }

  iterable(): AsyncIterable<SDKUserMessage> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<SDKUserMessage>> {
            if (self.#queue.length > 0) {
              const next = self.#queue.shift();
              if (!next) return Promise.resolve({ value: undefined as never, done: true });
              return Promise.resolve({ value: next, done: false });
            }
            if (self.#done) {
              // eslint-disable-next-line no-restricted-syntax -- IteratorResult requires value even when done
              return Promise.resolve({ value: undefined as never, done: true });
            }
            return new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
              self.#waiting = resolve;
            });
          },
        };
      },
    };
  }
}
