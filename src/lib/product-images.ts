export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function imageContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
