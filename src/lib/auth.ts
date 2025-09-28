export interface DevIdentity {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  tenant?: string | null;
}

const STORAGE_KEY = 'marble-dev-identity';
const HEADER_KEY = 'x-marble-dev-user';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadDevIdentity(): DevIdentity | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DevIdentity;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.email !== 'string') {
      return null;
    }
    return {
      id: parsed.id,
      email: parsed.email,
      displayName:
        typeof parsed.displayName === 'string' && parsed.displayName.trim().length > 0
          ? parsed.displayName
          : parsed.email,
      avatarUrl: parsed.avatarUrl ?? null,
      tenant: parsed.tenant ?? null,
    };
  } catch (error) {
    console.warn('Failed to load stored identity', error);
    return null;
  }
}

export function saveDevIdentity(identity: DevIdentity): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearDevIdentity(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function encodeBase64(value: string): string {
  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  const BufferCtor = (globalThis as unknown as { Buffer?: { from(data: string, encoding: string): { toString(enc: string): string } } }).Buffer;
  if (BufferCtor) {
    return BufferCtor.from(value, 'utf-8').toString('base64');
  }
  throw new Error('No base64 encoder available');
}

export function getIdentityHeader(): string | null {
  const identity = loadDevIdentity();
  if (!identity) return null;
  const payload = {
    id: identity.id,
    email: identity.email,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl ?? null,
    tenant:
      identity.tenant ??
      (identity.email.includes('@') ? identity.email.split('@')[1] : 'dev'),
  } satisfies DevIdentity;
  return encodeBase64(JSON.stringify(payload));
}

export function getIdentityHeaderName(): string {
  return HEADER_KEY;
}
