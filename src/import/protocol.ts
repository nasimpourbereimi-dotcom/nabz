import type { ImportEvent, ImportSummary } from './healthImport';

export type ToWorker = { type: 'start'; file: File };
export type FromWorker =
  | ImportEvent
  | { type: 'done'; summary: ImportSummary }
  | { type: 'error'; code: string; message: string };
