/**
 * securehash.js — compress + encrypt + encode a JSON object into a URL hash.
 *
 * Pipeline:
 *   object → positional tuples → JSON → deflate → AES-GCM → base64url
 *
 * Zero dependencies. Native CompressionStream and Web Crypto only.
 *
 * ── Wire format ─────────────────────────────────────────────────────────────
 *   byte 0        version (0x01)
 *   bytes 1..16   PBKDF2 salt (16 bytes)
 *   bytes 17..28  AES-GCM IV (12 bytes)
 *   bytes 29..    ciphertext, with the 16-byte GCM tag appended by WebCrypto
 *
 * The salt and IV are public by design — they must travel with the payload and
 * are not secret. What must never be reused is an (IV, key) pair, so a fresh
 * random salt AND IV are generated on every encrypt.
 *
 * ── Security notes, stated plainly ──────────────────────────────────────────
 * 1. PBKDF2 at 10,000 iterations is the requested parameter. It is BELOW
 *    current OWASP guidance (>= 600,000 for PBKDF2-HMAC-SHA256), and against
 *    an offline attacker who has the URL, it buys little. Anything protecting
 *    a low-value, short-lived link is fine; do not protect credentials with it.
 *    Raise `iterations` if the threat model needs it — see DEFAULTS.
 * 2. AES-128-GCM is the requested key size. 128-bit is not the weak point here;
 *    the password is.
 * 3. A URL fragment never reaches a server, but it DOES land in browser history,
 *    and messaging apps fetch shared links for previews. Encryption protects the
 *    contents from anyone who sees the link without the password — it does not
 *    make sharing the link private.
 */

const VERSION = 0x01;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export const DEFAULTS = Object.freeze({
  iterations: 10_000, // see security note 1
  hash: 'SHA-256',
  keyLength: 128,     // AES-128-GCM
  format: 'deflate',
});

/** Thrown for every failure mode, with a stable `code` for branching. */
export class SecureHashError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'SecureHashError';
    this.code = code; // BAD_PASSWORD | CORRUPT | UNSUPPORTED | BAD_INPUT
    if (cause) this.cause = cause;
  }
}

/* ── environment ──────────────────────────────────────────────────────────── */

function requireEnv() {
  const missing = [];
  if (typeof CompressionStream === 'undefined') missing.push('CompressionStream');
  if (typeof DecompressionStream === 'undefined') missing.push('DecompressionStream');
  if (typeof crypto === 'undefined' || !crypto.subtle) missing.push('crypto.subtle');
  if (missing.length) {
    throw new SecureHashError(
      'UNSUPPORTED',
      `Missing required browser APIs: ${missing.join(', ')}. ` +
      'crypto.subtle requires a secure context (https: or localhost).'
    );
  }
}

/* ── 1. shape: nested object ⇄ positional tuples ──────────────────────────── */

/**
 * A schema is a plain description of how to flatten an object into an array.
 * Each entry is a key, or [key, subSchema] for a nested object, or
 * [key, subSchema, true] for an array of such objects.
 *
 * Positional tuples drop every JSON key from the payload, which is the single
 * biggest win before compression — keys otherwise repeat once per array element.
 */
export function packBySchema(obj, schema) {
  if (obj == null || typeof obj !== 'object') {
    throw new SecureHashError('BAD_INPUT', 'packBySchema expects an object');
  }
  return schema.map((entry) => {
    if (typeof entry === 'string') return obj[entry] ?? null;
    const [key, sub, isList] = entry;
    const v = obj[key];
    if (v == null) return null;
    if (isList) return Array.isArray(v) ? v.map((item) => packBySchema(item, sub)) : [];
    return packBySchema(v, sub);
  });
}

export function unpackBySchema(tuple, schema) {
  if (!Array.isArray(tuple)) {
    throw new SecureHashError('CORRUPT', 'Expected a positional tuple');
  }
  const out = {};
  schema.forEach((entry, i) => {
    const v = tuple[i];
    if (typeof entry === 'string') { out[entry] = v; return; }
    const [key, sub, isList] = entry;
    if (v == null) { out[key] = isList ? [] : null; return; }
    out[key] = isList
      ? (Array.isArray(v) ? v.map((item) => unpackBySchema(item, sub)) : [])
      : unpackBySchema(v, sub);
  });
  return out;
}

/* ── 2. compression ───────────────────────────────────────────────────────── */

async function streamThrough(stream, bytes) {
  const writer = stream.writable.getWriter();
  // Not awaited: write() resolves only once the reader drains, so awaiting it
  // here before Response consumes `readable` would deadlock.
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

const compress = (bytes, format) => streamThrough(new CompressionStream(format), bytes);
const decompress = (bytes, format) => streamThrough(new DecompressionStream(format), bytes);

/* ── 3. base64url ─────────────────────────────────────────────────────────── */

export function toBase64Url(bytes) {
  let bin = '';
  // Chunked so a large payload cannot blow the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str) {
  if (typeof str !== 'string') throw new SecureHashError('BAD_INPUT', 'Expected a string');
  // Tolerate a leading '#', a full URL, and stray whitespace from copy/paste.
  let s = str.trim();
  const hash = s.lastIndexOf('#');
  if (hash !== -1) s = s.slice(hash + 1);
  const eq = s.indexOf('=');
  if (eq !== -1 && /^[a-zA-Z0-9_-]+=/.test(s)) s = s.slice(eq + 1); // "#d=<payload>"
  s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
    throw new SecureHashError('CORRUPT', 'Hash contains characters that are not base64url');
  }
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  let bin;
  try { bin = atob(padded); }
  catch (e) { throw new SecureHashError('CORRUPT', 'Hash is not valid base64url', e); }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ── 4. key derivation ────────────────────────────────────────────────────── */

async function deriveKey(password, salt, opts) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new SecureHashError('BAD_INPUT', 'Password must be a non-empty string');
  }
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: opts.iterations, hash: opts.hash },
    material,
    { name: 'AES-GCM', length: opts.keyLength },
    false,
    ['encrypt', 'decrypt']
  );
}

/* ── 5. public API ────────────────────────────────────────────────────────── */

/**
 * Compress, encrypt and encode `data` into a base64url hash string.
 *
 * @param {object} data
 * @param {string} password
 * @param {{schema?: Array, iterations?: number, hash?: string, keyLength?: number, format?: string}} [options]
 * @returns {Promise<string>} base64url, no padding
 */
export async function encodeToHash(data, password, options = {}) {
  requireEnv();
  const opts = { ...DEFAULTS, ...options };
  if (data == null) throw new SecureHashError('BAD_INPUT', 'data is required');

  const shaped = opts.schema ? packBySchema(data, opts.schema) : data;

  let json;
  try { json = JSON.stringify(shaped); }
  catch (e) { throw new SecureHashError('BAD_INPUT', 'data is not JSON-serialisable', e); }
  if (json === undefined) throw new SecureHashError('BAD_INPUT', 'data serialised to undefined');

  const packed = await compress(new TextEncoder().encode(json), opts.format);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, opts);

  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, packed)
  );

  const out = new Uint8Array(1 + SALT_BYTES + IV_BYTES + cipher.length);
  out[0] = VERSION;
  out.set(salt, 1);
  out.set(iv, 1 + SALT_BYTES);
  out.set(cipher, 1 + SALT_BYTES + IV_BYTES);
  return toBase64Url(out);
}

/**
 * Reverse of {@link encodeToHash}. Accepts a bare payload, `#payload`,
 * `#key=payload`, or a whole URL.
 *
 * Throws SecureHashError with code:
 *   BAD_PASSWORD — authentication failed (wrong password or tampered payload)
 *   CORRUPT      — not decodable at all (bad base64, truncated, bad version)
 *   UNSUPPORTED  — required browser API missing
 *   BAD_INPUT    — caller passed something unusable
 */
export async function decodeFromHash(hash, password, options = {}) {
  requireEnv();
  const opts = { ...DEFAULTS, ...options };

  const bytes = fromBase64Url(hash);
  const MIN = 1 + SALT_BYTES + IV_BYTES + 16; // + GCM tag
  if (bytes.length < MIN) {
    throw new SecureHashError('CORRUPT', `Hash is truncated (${bytes.length} bytes, need at least ${MIN})`);
  }
  if (bytes[0] !== VERSION) {
    throw new SecureHashError('CORRUPT', `Unsupported payload version 0x${bytes[0].toString(16)}`);
  }

  const salt = bytes.subarray(1, 1 + SALT_BYTES);
  const iv = bytes.subarray(1 + SALT_BYTES, 1 + SALT_BYTES + IV_BYTES);
  const cipher = bytes.subarray(1 + SALT_BYTES + IV_BYTES);

  const key = await deriveKey(password, salt, opts);

  let packed;
  try {
    packed = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, cipher)
    );
  } catch (e) {
    // GCM authentication is all-or-nothing and deliberately indistinguishable:
    // a wrong password and a tampered payload fail identically.
    throw new SecureHashError('BAD_PASSWORD', 'Wrong password, or the hash has been altered', e);
  }

  let json;
  try {
    json = new TextDecoder().decode(await decompress(packed, opts.format));
  } catch (e) {
    throw new SecureHashError('CORRUPT', 'Payload decrypted but could not be decompressed', e);
  }

  let parsed;
  try { parsed = JSON.parse(json); }
  catch (e) { throw new SecureHashError('CORRUPT', 'Payload is not valid JSON', e); }

  return opts.schema ? unpackBySchema(parsed, opts.schema) : parsed;
}

/** Convenience: full URL for sharing. */
export async function buildShareUrl(data, password, { baseUrl, key = 'd', ...options } = {}) {
  const payload = await encodeToHash(data, password, options);
  const base = baseUrl ?? (location.origin + location.pathname);
  return `${base}#${key}=${payload}`;
}

export default { encodeToHash, decodeFromHash, buildShareUrl, packBySchema, unpackBySchema,
                 toBase64Url, fromBase64Url, SecureHashError, DEFAULTS };
