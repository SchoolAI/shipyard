import { describe, expect, it } from 'vitest';
import {
  extractImagesFromClipboard,
  isSupportedImageType,
  MAX_IMAGE_BYTES,
  SUPPORTED_IMAGE_TYPES,
} from './image-utils';

describe('isSupportedImageType', () => {
  it.each(SUPPORTED_IMAGE_TYPES)('accepts %s', (type) => {
    expect(isSupportedImageType(type)).toBe(true);
  });

  it('rejects unsupported types', () => {
    expect(isSupportedImageType('image/svg+xml')).toBe(false);
    expect(isSupportedImageType('application/pdf')).toBe(false);
    expect(isSupportedImageType('text/plain')).toBe(false);
  });
});

describe('extractImagesFromClipboard', () => {
  function createMockDataTransfer(items: Array<{ kind: string; type: string; file: File | null }>) {
    return {
      items: items.map((item) => ({
        kind: item.kind,
        type: item.type,
        getAsFile: () => item.file,
      })),
    } as unknown as DataTransfer;
  }

  it('extracts image files from clipboard items', () => {
    const file = new File(['pixels'], 'screenshot.png', { type: 'image/png' });
    const dt = createMockDataTransfer([{ kind: 'file', type: 'image/png', file }]);
    const result = extractImagesFromClipboard(dt);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(file);
  });

  it('ignores non-file items (like text)', () => {
    const dt = createMockDataTransfer([{ kind: 'string', type: 'text/plain', file: null }]);
    const result = extractImagesFromClipboard(dt);
    expect(result).toHaveLength(0);
  });

  it('ignores unsupported file types', () => {
    const file = new File(['<svg></svg>'], 'icon.svg', { type: 'image/svg+xml' });
    const dt = createMockDataTransfer([{ kind: 'file', type: 'image/svg+xml', file }]);
    const result = extractImagesFromClipboard(dt);
    expect(result).toHaveLength(0);
  });

  it('extracts multiple images', () => {
    const png = new File(['a'], 'a.png', { type: 'image/png' });
    const jpg = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    const dt = createMockDataTransfer([
      { kind: 'file', type: 'image/png', file: png },
      { kind: 'file', type: 'image/jpeg', file: jpg },
    ]);
    const result = extractImagesFromClipboard(dt);
    expect(result).toHaveLength(2);
  });
});

describe('constants', () => {
  it('MAX_IMAGE_BYTES is 4 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(4 * 1024 * 1024);
  });

  it('SUPPORTED_IMAGE_TYPES includes common formats', () => {
    expect(SUPPORTED_IMAGE_TYPES).toContain('image/png');
    expect(SUPPORTED_IMAGE_TYPES).toContain('image/jpeg');
    expect(SUPPORTED_IMAGE_TYPES).toContain('image/gif');
    expect(SUPPORTED_IMAGE_TYPES).toContain('image/webp');
  });
});
