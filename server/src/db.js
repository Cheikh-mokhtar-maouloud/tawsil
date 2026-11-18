import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, process.env.DB_FILE || 'tawsil.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('customer','courier')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended')),
  language TEXT NOT NULL DEFAULT 'ar',
  vehicle TEXT,
  plate TEXT,
  id_doc TEXT,
  vehicle_photo TEXT,
  available INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  location_at TEXT,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  push_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','support','accountant')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  courier_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('letter','small','large')),
  pickup_address TEXT NOT NULL,
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_lat REAL NOT NULL,
  dropoff_lng REAL NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  notes TEXT,
  location_voice TEXT,
  location_voice_duration INTEGER,
  distance_km REAL NOT NULL,
  price INTEGER NOT NULL,
  courier_fee INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'searching'
    CHECK (status IN ('searching','accepted','picked_up','delivered','cancelled','no_courier')),
  delivery_code TEXT NOT NULL,
  pickup_photo TEXT,
  rating INTEGER,
  rating_comment TEXT,
  cash_settled INTEGER NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  closed_at TEXT,
  media_purged INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_rejections (
  order_id INTEGER NOT NULL REFERENCES orders(id),
  courier_id INTEGER NOT NULL REFERENCES users(id),
  at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (order_id, courier_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sender_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('text','voice','system','call')),
  body TEXT,
  file TEXT,
  duration INTEGER,
  call_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  listened_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  caller_id INTEGER NOT NULL REFERENCES users(id),
  callee_id INTEGER NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','active','ended','missed','declined','failed')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT,
  ended_at TEXT,
  duration INTEGER,
  recording_url TEXT,
  recording_resource_id TEXT,
  recording_sid TEXT,
  recording_uid INTEGER
);
CREATE INDEX IF NOT EXISTS idx_calls_order ON calls(order_id);

CREATE TABLE IF NOT EXISTS courier_path (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_path_order ON courier_path(order_id);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  opened_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved')),
  decision TEXT CHECK (decision IN ('customer','courier','info_requested')),
  decision_note TEXT,
  assigned_to INTEGER REFERENCES admins(id),
  decided_by INTEGER REFERENCES admins(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES admins(id),
  complaint_id INTEGER REFERENCES complaints(id),
  order_id INTEGER REFERENCES orders(id),
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// الإعدادات الافتراضية للأسعار — الإدارة تعدلها من اللوحة
const defaults = {
  currency: 'MRU',
  base_fare: '50',
  per_km: '15',
  min_price: '60',
  mult_letter: '1',
  mult_small: '1.2',
  mult_large: '1.6',
  commission_percent: '20',
  max_distance_km: '40',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);

if (!db.prepare('SELECT 1 FROM admins LIMIT 1').get()) {
  db.prepare('INSERT INTO admins (username, password_hash, name, role) VALUES (?, ?, ?, ?)').run(
    config.adminUsername,
    bcrypt.hashSync(config.adminPassword, 10),
    'المدير',
    'admin',
  );
  console.log(`[db] تم إنشاء حساب المدير: ${config.adminUsername}`);
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
