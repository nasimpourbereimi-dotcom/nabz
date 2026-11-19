import { BlobReader, configure, ZipReader, type Entry, type FileEntry } from '@zip.js/zip.js';
import type { XmlSource } from './healthImport';

// We already run inside a Web Worker; zip.js should not spawn more. Native DecompressionStream does the work.
configure({ useWebWorkers: false, useCompressionStream: true });

export class ImportError extends Error {
  constructor(public code: 'not-zip' | 'no-export-xml' | 'read-failed', message?: string) {
    super(message ?? code);
  }
}

const isExportXml = (e: Entry): e is FileEntry =>
  !e.directory && /(^|\/)export\.xml$/i.test(e.filename);

/** Opens Health's export.zip and returns a re-readable stream of export.xml text (one read per pass). */
export async function openHealthZip(file: Blob): Promise<{ source: XmlSource; xmlBytes: number; close: () => Promise<void> }> {
  const reader = new ZipReader(new BlobReader(file));
  let entries: Entry[];
  try {
    entries = await reader.getEntries();
  } catch (e) {
    throw new ImportError('not-zip', String(e));
  }
  const entry = entries.find(isExportXml);
  if (!entry) throw new ImportError('no-export-xml');

  const source: XmlSource = (onFraction) => ({
    async *[Symbol.asyncIterator]() {
      const pipe = new TransformStream<Uint8Array, Uint8Array>();
      const total = entry.uncompressedSize || 1;
      let read = 0;
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctl) {
          read += chunk.byteLength;
          onFraction(Math.min(1, read / total));
          ctl.enqueue(chunk);
        },
      });
      const done = entry.getData(pipe.writable).catch((e: unknown) => {
        throw new ImportError('read-failed', String(e));
      });
      const textReader = pipe.readable.pipeThrough(counter).pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
      try {
        for (;;) {
          const { value, done: d } = await textReader.read();
          if (d) break;
          yield value;
        }
      } finally {
        textReader.releaseLock();
      }
      await done;
    },
  });
  return { source, xmlBytes: entry.uncompressedSize, close: () => reader.close() };
}
