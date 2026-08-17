import { open } from 'node:fs/promises';

const HEADER_BYTES = 64;

function isAscii(buffer: Buffer, offset: number, value: string): boolean {
  return (
    buffer.subarray(offset, offset + value.length).toString('ascii') === value
  );
}

function readThreeByteLittleEndian(buffer: Buffer, offset: number): number {
  return (
    buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
  );
}

function dimensionsFromVp8(
  buffer: Buffer,
  dataOffset: number,
  chunkSize: number,
  riffEnd: number
): { width: number; height: number } | null {
  if (
    chunkSize < 10 ||
    dataOffset + chunkSize > riffEnd ||
    dataOffset + 10 > buffer.length
  ) {
    return null;
  }

  // A WebP image must start with a key frame and the VP8 start code.
  if ((buffer[dataOffset] & 1) !== 0) return null;
  if (
    buffer[dataOffset + 3] !== 0x9d ||
    buffer[dataOffset + 4] !== 0x01 ||
    buffer[dataOffset + 5] !== 0x2a
  ) {
    return null;
  }

  const width = buffer.readUInt16LE(dataOffset + 6) & 0x3fff;
  const height = buffer.readUInt16LE(dataOffset + 8) & 0x3fff;
  if (width === 0 || height === 0) return null;
  return { width, height };
}

function dimensionsFromVp8l(
  buffer: Buffer,
  dataOffset: number,
  chunkSize: number,
  riffEnd: number
): { width: number; height: number } | null {
  if (
    chunkSize < 5 ||
    dataOffset + chunkSize > riffEnd ||
    dataOffset + 5 > buffer.length
  ) {
    return null;
  }
  if (buffer[dataOffset] !== 0x2f) return null;

  const fields = buffer.readUInt32LE(dataOffset + 1);
  // The three version bits are reserved and must be zero.
  if (fields >>> 29 !== 0) return null;

  const width = (fields & 0x3fff) + 1;
  const height = ((fields >>> 14) & 0x3fff) + 1;
  return { width, height };
}

function dimensionsFromVp8x(
  buffer: Buffer,
  dataOffset: number,
  chunkSize: number,
  riffEnd: number
): { width: number; height: number } | null {
  if (
    chunkSize < 10 ||
    dataOffset + chunkSize > riffEnd ||
    dataOffset + 10 > buffer.length
  ) {
    return null;
  }
  if ((buffer[dataOffset] & 0xe0) !== 0) return null;
  if (
    buffer[dataOffset + 1] !== 0 ||
    buffer[dataOffset + 2] !== 0 ||
    buffer[dataOffset + 3] !== 0
  ) {
    return null;
  }

  const width = readThreeByteLittleEndian(buffer, dataOffset + 4) + 1;
  const height = readThreeByteLittleEndian(buffer, dataOffset + 7) + 1;
  return { width, height };
}

export function readWebpDimensions(
  buffer: Buffer
): { width: number; height: number } | null {
  if (buffer.length < 20) return null;
  if (!isAscii(buffer, 0, 'RIFF') || !isAscii(buffer, 8, 'WEBP')) return null;
  const riffSize = buffer.readUInt32LE(4);
  if (riffSize < 4) return null;
  const riffEnd = riffSize + 8;
  if (riffEnd < buffer.length) return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkSize < 0 || dataOffset > Number.MAX_SAFE_INTEGER) return null;

    if (chunkType === 'VP8 ') {
      return dimensionsFromVp8(buffer, dataOffset, chunkSize, riffEnd);
    }
    if (chunkType === 'VP8L') {
      return dimensionsFromVp8l(buffer, dataOffset, chunkSize, riffEnd);
    }
    if (chunkType === 'VP8X') {
      return dimensionsFromVp8x(buffer, dataOffset, chunkSize, riffEnd);
    }

    const paddedSize = chunkSize + (chunkSize % 2);
    const nextOffset = dataOffset + paddedSize;
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) return null;
    if (nextOffset > riffEnd) return null;
    if (nextOffset > buffer.length) return null;
    offset = nextOffset;
  }

  return null;
}

export async function readWebpDimensionsFile(
  path: string
): Promise<{ width: number; height: number } | null> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, 'r');
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return readWebpDimensions(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}
