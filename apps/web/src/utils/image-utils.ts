export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 1920;

const SUPPORTED_SET = new Set<string>(SUPPORTED_IMAGE_TYPES);

export function isSupportedImageType(type: string): boolean {
  return SUPPORTED_SET.has(type);
}

export function extractImagesFromClipboard(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind === 'file' && isSupportedImageType(item.type)) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

export function fileToBase64(file: File): Promise<{ mediaType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader did not return a string'));
        return;
      }
      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('Invalid data URL'));
        return;
      }
      resolve({
        mediaType: file.type,
        data: result.slice(commaIndex + 1),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function resizeIfNeeded(file: File, maxDimension = DEFAULT_MAX_DIMENSION): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      if (img.width <= maxDimension && img.height <= maxDimension) {
        resolve(file);
        return;
      }

      const scale = maxDimension / Math.max(img.width, img.height);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name, { type: file.type }));
        },
        file.type,
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for resizing'));
    };

    img.src = url;
  });
}

export interface ImageAttachment {
  mediaType: string;
  data: string;
}

export async function processImageFile(file: File): Promise<ImageAttachment> {
  if (!isSupportedImageType(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }
  const resized = await resizeIfNeeded(file);
  if (resized.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image too large after resize: ${(resized.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`
    );
  }
  return fileToBase64(resized);
}
