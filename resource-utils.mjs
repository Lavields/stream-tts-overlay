import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

export class BoundedTTLCache {
  constructor(limit = 64, ttl = 300000, now = Date.now) {
    this.limit = limit; this.ttl = ttl; this.now = now; this.entries = new Map();
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.until <= this.now()) { this.entries.delete(key); return; }
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }
  set(key, value) {
    const now = this.now();
    for (const [k, entry] of this.entries) if (entry.until <= now) this.entries.delete(k);
    this.entries.delete(key);
    this.entries.set(key, { value, until: now + this.ttl });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  clear() { this.entries.clear(); }
}

// Keep only the newest mouth state while an OBS client is backpressured.
export function sendEvent(res, type, event) {
  if (res.destroyed || res.writableEnded) return;
  if (type === 'overlay' && res.writableNeedDrain) {
    res.pendingOverlay = event;
    if (!res.overlayDrain) {
      res.overlayDrain = () => {
        res.overlayDrain = null;
        const pending = res.pendingOverlay;
        res.pendingOverlay = null;
        if (pending && !res.destroyed && !res.writableEnded) res.write(pending);
      };
      res.once('drain', res.overlayDrain);
    }
    return;
  }
  res.write(event);
}

// Stream large assets instead of allocating a full Buffer for every request.
export async function serveStatic(req, res, path, contentType) {
  const info = await stat(path);
  const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs * 1000).toString(16)}"`;
  const headers = { 'Content-Type': contentType, 'Cache-Control': 'private, no-cache',
    ETag: etag, 'X-Content-Type-Options': 'nosniff' };
  if (req.headers['if-none-match']?.split(/\s*,\s*/).includes(etag)) {
    res.writeHead(304, headers); res.end(); return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': info.size });
  try { await pipeline(createReadStream(path), res); }
  catch (error) { if (!res.destroyed) throw error; }
}
