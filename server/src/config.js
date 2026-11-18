import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  isDev: (process.env.NODE_ENV || 'development') !== 'production',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  retentionDays: Number(process.env.RETENTION_DAYS || 60),
  offerTimeoutSeconds: Number(process.env.OFFER_TIMEOUT_SECONDS || 30),
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(root, 'uploads'),
  agora: {
    appId: process.env.AGORA_APP_ID || '',
    appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
    customerId: process.env.AGORA_CUSTOMER_ID || '',
    customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
    storage: {
      vendor: Number(process.env.AGORA_STORAGE_VENDOR || 1),
      region: Number(process.env.AGORA_STORAGE_REGION || 0),
      bucket: process.env.AGORA_STORAGE_BUCKET || '',
      accessKey: process.env.AGORA_STORAGE_ACCESS_KEY || '',
      secretKey: process.env.AGORA_STORAGE_SECRET_KEY || '',
      publicUrl: process.env.AGORA_STORAGE_PUBLIC_URL || '',
    },
  },
};

export const callsEnabled = () => Boolean(config.agora.appId && config.agora.appCertificate);
export const recordingEnabled = () =>
  callsEnabled() && Boolean(config.agora.customerId && config.agora.customerSecret && config.agora.storage.bucket);
