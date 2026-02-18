import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockContainerValue = {
  id: 'cid:root-planEditorDocs:Map/plan-1' as const,
};

const mockPlanEditorDocsMap = {
  get: vi.fn((key: string) => {
    if (key === 'plan-1') return mockContainerValue;
    return undefined;
  }),
};

const mockLoroDoc = {
  opCount: vi.fn(() => 0),
  frontiers: vi.fn(() => []),
  subscribe: vi.fn(() => () => {}),
  getMap: vi.fn((key: string) => {
    if (key === 'planEditorDocs') return mockPlanEditorDocsMap;
    return { get: vi.fn() };
  }),
};

const mockHandle = {
  doc: {
    toJSON: vi.fn(
      (): Record<string, unknown> => ({
        planEditorDocs: {
          'plan-1': {},
        },
      })
    ),
  },
  loroDoc: mockLoroDoc,
};

const mockRepo = {
  get: vi.fn(() => mockHandle),
};

vi.mock('../providers/repo-provider', () => ({
  useRepo: vi.fn(() => mockRepo),
}));

const mockUseDoc = vi.fn((_handle: unknown, selector: (doc: unknown) => unknown) => {
  const json = mockHandle.doc.toJSON();
  return selector(json);
});

vi.mock('@loro-extended/react', () => ({
  useDoc: (handle: unknown, selector: (doc: unknown) => unknown) => mockUseDoc(handle, selector),
}));

const mockIsContainer = vi.fn((_value: unknown) => true);

vi.mock('loro-crdt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('loro-crdt')>();
  return { ...actual, isContainer: (value: unknown) => mockIsContainer(value) };
});

import { usePlanEditorDoc } from './use-plan-editor-doc';

describe('usePlanEditorDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockHandle.doc.toJSON.mockReturnValue({
      planEditorDocs: { 'plan-1': {} },
    });

    mockPlanEditorDocsMap.get.mockImplementation((key: string) => {
      if (key === 'plan-1') return mockContainerValue;
      return undefined;
    });

    mockIsContainer.mockReturnValue(true);

    mockUseDoc.mockImplementation((_handle: unknown, selector: (doc: unknown) => unknown) => {
      const json = mockHandle.doc.toJSON();
      return selector(json);
    });
  });

  it('returns not-ready when taskId is null', () => {
    const { result } = renderHook(() => usePlanEditorDoc(null, 'plan-1'));

    expect(result.current.loroDoc).toBeNull();
    expect(result.current.containerId).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('returns not-ready when planId is null', () => {
    const { result } = renderHook(() => usePlanEditorDoc('task-1', null));

    expect(result.current.loroDoc).toBeNull();
    expect(result.current.containerId).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('returns not-ready when planEditorDocs does not contain the planId', () => {
    mockHandle.doc.toJSON.mockReturnValue({
      planEditorDocs: { 'other-plan': {} } as Record<string, unknown>,
    });

    const { result } = renderHook(() => usePlanEditorDoc('task-1', 'plan-1'));

    expect(result.current.loroDoc).toBeNull();
    expect(result.current.containerId).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('returns loroDoc and containerId when the container exists', () => {
    const { result } = renderHook(() => usePlanEditorDoc('task-1', 'plan-1'));

    expect(result.current.loroDoc).toBe(mockLoroDoc);
    expect(result.current.containerId).toBe(mockContainerValue.id);
    expect(result.current.isReady).toBe(true);
  });

  it('returns not-ready when value is not a container', () => {
    mockIsContainer.mockReturnValue(false);

    const { result } = renderHook(() => usePlanEditorDoc('task-1', 'plan-1'));

    expect(result.current.loroDoc).toBeNull();
    expect(result.current.containerId).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('isReady is true only when both loroDoc and containerId are available', () => {
    const { result: readyResult } = renderHook(() => usePlanEditorDoc('task-1', 'plan-1'));
    expect(readyResult.current.isReady).toBe(true);
    expect(readyResult.current.loroDoc).not.toBeNull();
    expect(readyResult.current.containerId).not.toBeNull();

    const { result: nullTaskResult } = renderHook(() => usePlanEditorDoc(null, 'plan-1'));
    expect(nullTaskResult.current.isReady).toBe(false);

    const { result: nullPlanResult } = renderHook(() => usePlanEditorDoc('task-1', null));
    expect(nullPlanResult.current.isReady).toBe(false);
  });
});
