import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { test } from 'node:test';

import {
  deriveSections,
  isCommandAvailable,
  mergeSidecar,
  resolvePhotoId,
  sanitizeStem
} from '../prepare.ts';
import { readWebpDimensions } from '../webp.ts';

function riffChunk(type: string, data: Buffer): Buffer {
  const paddedLength = data.length + (data.length % 2);
  const chunk = Buffer.alloc(8 + paddedLength);
  chunk.write(type, 0, 4, 'ascii');
  chunk.writeUInt32LE(data.length, 4);
  data.copy(chunk, 8);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 4, 'ascii');
  riff.writeUInt32LE(4 + chunk.length, 4);
  riff.write('WEBP', 8, 4, 'ascii');
  return Buffer.concat([riff, chunk]);
}

function vp8Buffer(width: number, height: number): Buffer {
  const data = Buffer.alloc(10);
  data[3] = 0x9d;
  data[4] = 0x01;
  data[5] = 0x2a;
  data.writeUInt16LE(width, 6);
  data.writeUInt16LE(height, 8);
  return riffChunk('VP8 ', data);
}

function vp8lBuffer(width: number, height: number): Buffer {
  const data = Buffer.alloc(5);
  data[0] = 0x2f;
  data.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  return riffChunk('VP8L', data);
}

function vp8xBuffer(width: number, height: number): Buffer {
  const data = Buffer.alloc(10);
  data.writeUIntLE(width - 1, 4, 3);
  data.writeUIntLE(height - 1, 7, 3);
  return riffChunk('VP8X', data);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}

function tinyPng(
  width: number,
  height: number,
  color: [number, number, number]
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows: Buffer[] = [];
  for (let row = 0; row < height; row += 1) {
    const scanline = Buffer.alloc(1 + width * 3);
    scanline[0] = 0;
    for (let column = 0; column < width; column += 1) {
      color.forEach((value, channel) => {
        scanline[1 + column * 3 + channel] = value;
      });
    }
    rows.push(scanline);
  }
  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'binary'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function runPrepare(
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const script = join(import.meta.dirname, '..', 'prepare.ts');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if (!child.stdout || !child.stderr) {
      reject(new Error('could not capture prepare output'));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

test('derives naturally ordered sections and photos', () => {
  const sections = deriveSections([
    '10-section/ten-10.jpg',
    '2-section/two-2.jpg',
    '2-section/two-10.jpg',
    '2-section/nested/deep.jpg',
    'root.jpg'
  ]);
  assert.deepEqual(
    sections.map(section => section.title),
    ['', '2 Section', '2 Section / Nested', '10 Section']
  );
  assert.deepEqual(
    sections[1]?.photos.map(photo => photo.fileName),
    ['two-2.jpg', 'two-10.jpg']
  );
  assert.equal(sections[0]?.id, 'main');
  assert.equal(sections[2]?.id, '2-section-nested');
});

test('sanitizes stems and lengthens colliding content hashes', () => {
  assert.equal(sanitizeStem('Crème brûlée_02.JPG'), 'creme-brulee-02-jpg');
  assert.equal(sanitizeStem('---'), 'photo');

  const usedIds = new Map<string, string>();
  const firstHash = 'a'.repeat(64);
  const secondHash = `${'a'.repeat(12)}b${'c'.repeat(51)}`;
  const firstId = resolvePhotoId('Sunset', firstHash, usedIds);
  const secondId = resolvePhotoId('Sunset', secondHash, usedIds);
  assert.equal(firstId, 'sunset-aaaaaaaaaaaa');
  assert.equal(secondId, 'sunset-aaaaaaaaaaaab');
});

test('merges sidecar metadata with CLI overrides and fallback title', () => {
  const merged = mergeSidecar(
    {
      title: 'Sidecar title',
      description: 'Sidecar description',
      date: '2026-08',
      favorites: ['./2-section/photo.jpg']
    },
    { title: 'CLI title', date: '2026-09' },
    'summer-trip'
  );
  assert.deepEqual(merged, {
    title: 'CLI title',
    description: 'Sidecar description',
    date: '2026-09',
    favorites: ['2-section/photo.jpg']
  });
  assert.equal(mergeSidecar({}, {}, 'summer-trip').title, 'Summer Trip');
});

test('reads VP8, VP8L, and VP8X dimensions and rejects malformed headers', () => {
  assert.deepEqual(readWebpDimensions(vp8Buffer(320, 240)), {
    width: 320,
    height: 240
  });
  assert.deepEqual(readWebpDimensions(vp8lBuffer(640, 480)), {
    width: 640,
    height: 480
  });
  assert.deepEqual(readWebpDimensions(vp8xBuffer(1920, 1080)), {
    width: 1920,
    height: 1080
  });

  const invalidVp8 = vp8Buffer(320, 240);
  invalidVp8[15] = 0;
  assert.equal(readWebpDimensions(invalidVp8), null);

  const invalidVp8l = vp8lBuffer(320, 240);
  invalidVp8l[20] = 0;
  assert.equal(readWebpDimensions(invalidVp8l), null);

  const invalidVp8x = vp8xBuffer(320, 240).subarray(0, 25);
  assert.equal(readWebpDimensions(invalidVp8x), null);
  assert.equal(readWebpDimensions(Buffer.from('not a webp')), null);
});

test('prepares an album incrementally and mirrors stale output', async t => {
  if (!isCommandAvailable('cwebp')) {
    t.skip('cwebp is not on PATH');
    return;
  }

  const root = await mkdtemp('/private/tmp/photos-prepare-test-');
  try {
    const source = join(root, 'source');
    const output = join(root, 'output');
    await mkdir(join(source, '2-section'), { recursive: true });
    await mkdir(join(source, '10-section'), { recursive: true });
    await writeFile(join(source, 'root.png'), tinyPng(3, 2, [240, 20, 20]));
    await writeFile(
      join(source, '2-section', 'two.png'),
      tinyPng(2, 3, [20, 240, 20])
    );
    await writeFile(
      join(source, '10-section', 'ten.png'),
      tinyPng(2, 2, [20, 20, 240])
    );
    await writeFile(
      join(source, '.photos-album.json'),
      JSON.stringify({
        title: 'Fixture album',
        description: 'Generated fixture',
        date: '2026-08',
        favorites: ['2-section/two.png']
      })
    );

    const first = await runPrepare([
      source,
      '--slug',
      'fixture',
      '--out',
      output,
      '--max-edge',
      '10'
    ]);
    assert.equal(first.code, 0, first.stderr);
    const firstManifest = JSON.parse(
      await readFile(join(output, 'album.json'), 'utf8')
    ) as {
      version: number;
      slug: string;
      title: string;
      description: string | null;
      date: string | null;
      sections: Array<{
        title: string;
        photos: Array<{ file: string; favorite: boolean }>;
      }>;
    };
    assert.equal(firstManifest.version, 1);
    assert.equal(firstManifest.slug, 'fixture');
    assert.equal(firstManifest.title, 'Fixture album');
    assert.equal(firstManifest.description, 'Generated fixture');
    assert.equal(firstManifest.date, '2026-08');
    assert.deepEqual(
      firstManifest.sections.map(section => section.title),
      ['', '2 Section', '10 Section']
    );
    assert.equal(firstManifest.sections[1]?.photos[0]?.favorite, true);
    assert.equal(firstManifest.sections[0]?.photos[0]?.favorite, false);

    const outputFiles = firstManifest.sections.flatMap(section =>
      section.photos.map(photo => photo.file)
    );
    const mtimes = new Map<string, bigint>();
    for (const file of outputFiles) {
      mtimes.set(
        file,
        (await stat(join(output, ...file.split('/')), { bigint: true })).mtimeNs
      );
    }
    await writeFile(join(output, 'stale.webp'), Buffer.from('stale'));
    await mkdir(join(output, 'stale-dir'));
    await writeFile(
      join(output, 'stale-dir', 'stale.txt'),
      Buffer.from('stale')
    );

    const second = await runPrepare([
      source,
      '--slug',
      'fixture',
      '--out',
      output,
      '--max-edge',
      '10'
    ]);
    assert.equal(second.code, 0, second.stderr);
    for (const file of outputFiles) {
      assert.equal(
        (await stat(join(output, ...file.split('/')), { bigint: true }))
          .mtimeNs,
        mtimes.get(file)
      );
    }
    await assert.rejects(stat(join(output, 'stale.webp')));
    await assert.rejects(stat(join(output, 'stale-dir')));
    assert.match(
      await readFile(join(output, '.prepare-cache.json'), 'utf8'),
      /sourceSha256/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
