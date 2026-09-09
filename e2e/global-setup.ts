import { unlink } from 'node:fs/promises';

const dbFiles = ['data/db/e2e.db', 'data/db/e2e.db-shm', 'data/db/e2e.db-wal'];

export default async function globalSetup() {
  for (const file of dbFiles) {
    try {
      await unlink(file);
    } catch {
      // file does not exist — ignore
    }
  }
}