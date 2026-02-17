import { describe, expect, it } from 'vitest';
import { StreamingInputController } from './streaming-input-controller.js';

describe('StreamingInputController', () => {
  it('wraps a plain string as SDKUserMessage with string content', async () => {
    const controller = new StreamingInputController();
    controller.push('Hello');
    controller.end();

    const iter = controller.iterable()[Symbol.asyncIterator]();
    const { value, done } = await iter.next();
    expect(done).toBe(false);
    expect(value).toEqual({
      type: 'user',
      message: { role: 'user', content: 'Hello' },
      parent_tool_use_id: null,
      session_id: '',
    });
  });

  it('wraps content blocks as SDKUserMessage with array content', async () => {
    const controller = new StreamingInputController();
    controller.push([
      { type: 'text', text: 'Check this' },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
      },
    ]);
    controller.end();

    const iter = controller.iterable()[Symbol.asyncIterator]();
    const { value, done } = await iter.next();
    expect(done).toBe(false);
    expect(value).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
          },
        ],
      },
      parent_tool_use_id: null,
      session_id: '',
    });
  });

  it('handles image-only content blocks (no text)', async () => {
    const controller = new StreamingInputController();
    controller.push([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' },
      },
    ]);
    controller.end();

    const iter = controller.iterable()[Symbol.asyncIterator]();
    const { value } = await iter.next();
    expect(value.message.content).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' },
      },
    ]);
  });

  it('signals done after end()', async () => {
    const controller = new StreamingInputController();
    controller.push('msg');
    controller.end();

    const iter = controller.iterable()[Symbol.asyncIterator]();
    await iter.next();
    const { done } = await iter.next();
    expect(done).toBe(true);
  });

  it('drops messages pushed after end()', async () => {
    const controller = new StreamingInputController();
    controller.end();
    controller.push('dropped');

    const iter = controller.iterable()[Symbol.asyncIterator]();
    const { done } = await iter.next();
    expect(done).toBe(true);
  });
});
