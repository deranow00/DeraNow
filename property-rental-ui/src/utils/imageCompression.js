const DEFAULT_OPTIONS = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.82,
  mimeType: 'image/webp',
};

const COMPRESSIBLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

const getExtensionFromMimeType = (mimeType) => {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/png') return 'png';
  return 'img';
};

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to read image file'));
    };

    image.src = objectUrl;
  });

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });

const isCompressibleImage = (file) =>
  Boolean(file) &&
  typeof file.type === 'string' &&
  file.type.startsWith('image/') &&
  COMPRESSIBLE_TYPES.has(file.type) &&
  file.type !== 'image/svg+xml' &&
  file.type !== 'image/gif';

export async function compressImageFile(file, options = {}) {
  if (!isCompressibleImage(file) || typeof document === 'undefined') return file;

  const settings = { ...DEFAULT_OPTIONS, ...options };

  try {
    const image = await loadImage(file);
    const ratio = Math.min(
      settings.maxWidth / image.naturalWidth,
      settings.maxHeight / image.naturalHeight,
      1
    );
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    if (settings.mimeType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(image, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, settings.mimeType, settings.quality);
    if (!blob && settings.mimeType !== 'image/jpeg') {
      blob = await canvasToBlob(canvas, 'image/jpeg', settings.quality);
    }

    if (!blob || blob.size >= file.size) return file;

    const extension = getExtensionFromMimeType(blob.type);
    const baseName = String(file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.${extension}`, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export async function compressImageFiles(files, options = {}) {
  const list = Array.from(files || []);
  return Promise.all(list.map((file) => compressImageFile(file, options)));
}
