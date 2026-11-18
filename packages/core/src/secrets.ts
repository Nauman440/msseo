import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for secrets stored at rest (Google refresh tokens, website connections), keyed
 * by ENCRYPTION_KEY (32 random bytes, base64). Format: v1:<iv>:<tag>:<data>, all base64.
 */
export function encryptionKeyValid(v: string | undefined = process.env.ENCRYPTION_KEY): boolean {
  if (!v?.trim()) return false;
  try {
    return Buffer.from(v.trim(), 'base64').length === 32;
  } catch {
    return false;
  }
}

const key = () => Buffer.from(process.env.ENCRYPTION_KEY!.trim(), 'base64');

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
