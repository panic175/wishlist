import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Lazy initialization to avoid database access during build
let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;

function getDb() {
  if (!_db) {
    // Ensure data directories exist
    const dataDir = path.join(process.cwd(), 'data');
    const dbDir = path.join(dataDir, 'db');
    const uploadsDir = path.join(dataDir, 'uploads');

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Database file path (overridable for tests via WISHLIST_DB_PATH)
    const defaultDbPath = path.join(dbDir, 'wishlist.db');
    const dbPath = process.env.WISHLIST_DB_PATH
      ? path.resolve(process.cwd(), process.env.WISHLIST_DB_PATH)
      : defaultDbPath;

    // Create SQLite database connection
    _sqlite = new Database(dbPath);
    _sqlite.pragma('journal_mode = WAL'); // Better concurrency

    // Restrict DB file access to the owning user. better-sqlite3 creates the
    // file with the process umask, which may leave it world-readable.
    try {
      fs.chmodSync(dbPath, 0o600);
    } catch {
      // Non-fatal: staging environments (tmpfs etc.) may not support chmod.
    }

    // Create Drizzle instance
    _db = drizzle(_sqlite, { schema });
  }
  return _db;
}

// Export db as a getter
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  }
});

// Initialize database (create tables and seed if needed)
export async function initializeDatabase() {
  try {
    // Ensure database is initialized
    const sqlite = _sqlite || getDb() && _sqlite;
    if (!sqlite) throw new Error('Failed to initialize database');

    // Create wishlists table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        preferences TEXT,
        image_url TEXT,
        notes TEXT,
        is_public INTEGER DEFAULT 0 NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
      )
    `);

    // Create wishlist_items table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id TEXT PRIMARY KEY NOT NULL,
        wishlist_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price REAL,
        currency TEXT DEFAULT 'USD' NOT NULL,
        quantity INTEGER DEFAULT 1 NOT NULL,
        images TEXT,
        purchase_urls TEXT,
        notes TEXT,
        is_archived INTEGER DEFAULT 0 NOT NULL,
        claimed_by_name TEXT,
        claimed_by_note TEXT,
        claimed_by_token TEXT UNIQUE,
        claimed_at INTEGER,
        is_purchased INTEGER DEFAULT 0 NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
        FOREIGN KEY (wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE
      )
    `);

    // Create settings table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY NOT NULL,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
      )
    `);

    // Run migrations for existing databases
    try {
      const columns = sqlite.pragma('table_info(wishlists)') as Array<{ name: string }>;

      // Add image_url column if it doesn't exist
      const hasImageUrl = columns.some((col) => col.name === 'image_url');
      if (!hasImageUrl) {
        sqlite.exec('ALTER TABLE wishlists ADD COLUMN image_url TEXT');
        console.log('✅ Added image_url column to wishlists table');
      }

      // Add sort_order column if it doesn't exist
      const hasSortOrder = columns.some((col) => col.name === 'sort_order');
      if (!hasSortOrder) {
        sqlite.exec('ALTER TABLE wishlists ADD COLUMN sort_order INTEGER DEFAULT 0 NOT NULL');
        console.log('✅ Added sort_order column to wishlists table');
      }

      // Add preferences column if it doesn't exist
      const hasPreferences = columns.some((col) => col.name === 'preferences');
      if (!hasPreferences) {
        sqlite.exec('ALTER TABLE wishlists ADD COLUMN preferences TEXT');
        console.log('✅ Added preferences column to wishlists table');
      }
    } catch (migrationError) {
      console.log('Migration already applied or not needed');
    }

    // Backfill per-URL pricing for existing items (one-time migration).
    // Copies item-level price/currency/image into each purchase_urls entry
    // that is missing them, so the public page can render per-URL prices.
    try {
      const backfillMarker = sqlite
        .prepare(`SELECT 1 FROM settings WHERE key = 'purchaseUrlsBackfilled'`)
        .get();

      if (!backfillMarker) {
        const rows = sqlite
          .prepare(
            `SELECT id, price, currency, images, purchase_urls
             FROM wishlist_items
             WHERE purchase_urls IS NOT NULL AND purchase_urls != ''`
          )
          .all() as Array<{
          id: string;
          price: number | null;
          currency: string | null;
          images: string | null;
          purchase_urls: string;
        }>;

        const update = sqlite.prepare(
          `UPDATE wishlist_items SET purchase_urls = ?, updated_at = unixepoch() WHERE id = ?`
        );
        let changed = 0;

        for (const row of rows) {
          let urls: Array<Record<string, unknown>>;
          try {
            urls = JSON.parse(row.purchase_urls);
          } catch {
            continue;
          }
          if (!Array.isArray(urls)) continue;

          let dirty = false;
          for (const entry of urls) {
            if (
              (entry.price === undefined || entry.price === null) &&
              typeof row.price === 'number'
            ) {
              entry.price = row.price;
              dirty = true;
            }
            if (!entry.currency) {
              entry.currency = row.currency || 'USD';
              dirty = true;
            }
            if ((entry.imageUrl === undefined || entry.imageUrl === null) && row.images) {
              entry.imageUrl = row.images;
              dirty = true;
            }
          }

          if (dirty) {
            update.run(JSON.stringify(urls), row.id);
            changed += 1;
          }
        }

        if (changed > 0) {
          console.log(`✅ Backfilled per-URL pricing for ${changed} item(s)`);
        }

        sqlite
          .prepare(
            `INSERT INTO settings (id, key, value, updated_at)
             VALUES ('migration-purchaseUrlsPrice', 'purchaseUrlsBackfilled', '1', unixepoch())
             ON CONFLICT(key) DO NOTHING`
          )
          .run();
      }
    } catch (backfillError) {
      console.log('Per-URL price backfill already applied or not needed');
    }

    // Auto-seed database if empty
    const { seedDatabase } = await import('./seed');
    await seedDatabase();

    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Export schema for use in other files
export * from './schema';
