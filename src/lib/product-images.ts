export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const PRODUCT_IMAGE_WIDTHS = [320, 640, 960, 1440] as const;

// Only our immutable public uploads use the resize endpoint. External URLs stay unchanged.
export function responsiveProductImage(src: string) {
  if (!/^\/api\/images\/[a-f0-9]{64}$/.test(src)) return { src, srcSet: undefined };
  return {
    src: `${src}?w=640&v=1`,
    srcSet: PRODUCT_IMAGE_WIDTHS.map(width => `${src}?w=${width}&v=1 ${width}w`).join(', '),
  };
}

export function imageContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
