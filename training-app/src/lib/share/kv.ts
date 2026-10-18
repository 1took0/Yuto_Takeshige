import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 共有データの保存先（最小限の Redis 互換操作）
 * - Upstash Redis（Vercel Marketplace の無料プラン）… KV_REST_API_URL / KV_REST_API_TOKEN
 *   または UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * - ファイル（自宅 PC などで `npm start` する場合）… SHARE_STORE=file
 * - メモリ（テスト用）
 */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(...keys: string[]): Promise<void>;
  hset(key: string, entries: Record<string, string>): Promise<void>;
  hdel(key: string, ...fields: string[]): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hkeys(key: string): Promise<string[]>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
}

// ---------- メモリ ----------
export class MemoryKV implements KV {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  sets = new Map<string, Set<string>>();
  async get(k: string) {
    return this.strings.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.strings.set(k, v);
  }
  async del(...ks: string[]) {
    for (const k of ks) {
      this.strings.delete(k);
      this.hashes.delete(k);
      this.sets.delete(k);
    }
  }
  async hset(k: string, e: Record<string, string>) {
    const h = this.hashes.get(k) ?? new Map();
    for (const [f, v] of Object.entries(e)) h.set(f, v);
    this.hashes.set(k, h);
  }
  async hdel(k: string, ...fs: string[]) {
    const h = this.hashes.get(k);
    if (h) for (const f of fs) h.delete(f);
  }
  async hgetall(k: string) {
    return Object.fromEntries(this.hashes.get(k) ?? []);
  }
  async hkeys(k: string) {
    return [...(this.hashes.get(k)?.keys() ?? [])];
  }
  async sadd(k: string, m: string) {
    const s = this.sets.get(k) ?? new Set();
    s.add(m);
    this.sets.set(k, s);
  }
  async srem(k: string, m: string) {
    this.sets.get(k)?.delete(m);
  }
  async smembers(k: string) {
    return [...(this.sets.get(k) ?? [])];
  }
  toJSON() {
    return {
      strings: Object.fromEntries(this.strings),
      hashes: Object.fromEntries([...this.hashes].map(([k, v]) => [k, Object.fromEntries(v)])),
      sets: Object.fromEntries([...this.sets].map(([k, v]) => [k, [...v]])),
    };
  }
  load(j: ReturnType<MemoryKV["toJSON"]>) {
    this.strings = new Map(Object.entries(j.strings ?? {}));
    this.hashes = new Map(Object.entries(j.hashes ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
    this.sets = new Map(Object.entries(j.sets ?? {}).map(([k, v]) => [k, new Set(v)]));
  }
}

// ---------- ファイル ----------
export class FileKV implements KV {
  private mem = new MemoryKV();
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}
  private async ensure() {
    if (this.loaded) return;
    try {
      this.mem.load(JSON.parse(await fs.readFile(this.file, "utf8")));
    } catch {
      /* 初回は空 */
    }
    this.loaded = true;
  }
  private async persist() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.mem.toJSON()));
    await fs.rename(tmp, this.file);
  }
  private run<T>(fn: () => Promise<T>, write: boolean): Promise<T> {
    const p = this.queue.then(async () => {
      await this.ensure();
      const r = await fn();
      if (write) await this.persist();
      return r;
    });
    this.queue = p.catch(() => {});
    return p;
  }
  get(k: string) {
    return this.run(() => this.mem.get(k), false);
  }
  set(k: string, v: string) {
    return this.run(() => this.mem.set(k, v), true);
  }
  del(...ks: string[]) {
    return this.run(() => this.mem.del(...ks), true);
  }
  hset(k: string, e: Record<string, string>) {
    return this.run(() => this.mem.hset(k, e), true);
  }
  hdel(k: string, ...fs: string[]) {
    return this.run(() => this.mem.hdel(k, ...fs), true);
  }
  hgetall(k: string) {
    return this.run(() => this.mem.hgetall(k), false);
  }
  hkeys(k: string) {
    return this.run(() => this.mem.hkeys(k), false);
  }
  sadd(k: string, m: string) {
    return this.run(() => this.mem.sadd(k, m), true);
  }
  srem(k: string, m: string) {
    return this.run(() => this.mem.srem(k, m), true);
  }
  smembers(k: string) {
    return this.run(() => this.mem.smembers(k), false);
  }
}

// ---------- Upstash Redis（REST） ----------
export class UpstashKV implements KV {
  constructor(
    private url: string,
    private token: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}
  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await this.fetchImpl(this.url.replace(/\/$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const j = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || j.error) throw new Error(`Upstash error: ${j.error ?? res.status}`);
    return j.result as T;
  }
  async get(k: string) {
    return (await this.cmd<string | null>("GET", k)) ?? null;
  }
  async set(k: string, v: string) {
    await this.cmd("SET", k, v);
  }
  async del(...ks: string[]) {
    if (ks.length) await this.cmd("DEL", ...ks);
  }
  async hset(k: string, e: Record<string, string>) {
    const flat = Object.entries(e).flat();
    if (flat.length) await this.cmd("HSET", k, ...flat);
  }
  async hdel(k: string, ...fs: string[]) {
    if (fs.length) await this.cmd("HDEL", k, ...fs);
  }
  async hgetall(k: string) {
    const arr = (await this.cmd<string[] | Record<string, string> | null>("HGETALL", k)) ?? [];
    if (!Array.isArray(arr)) return arr;
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < arr.length; i += 2) out[arr[i]] = arr[i + 1];
    return out;
  }
  async hkeys(k: string) {
    return (await this.cmd<string[] | null>("HKEYS", k)) ?? [];
  }
  async sadd(k: string, m: string) {
    await this.cmd("SADD", k, m);
  }
  async srem(k: string, m: string) {
    await this.cmd("SREM", k, m);
  }
  async smembers(k: string) {
    return (await this.cmd<string[] | null>("SMEMBERS", k)) ?? [];
  }
}

let cached: KV | null | undefined;

export type StoreKind = "upstash" | "file" | "none";

export function storeKind(): StoreKind {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return "upstash";
  if (process.env.SHARE_STORE === "file") return "file";
  return "none";
}

export function getKV(): KV | null {
  if (cached !== undefined) return cached;
  const kind = storeKind();
  if (kind === "upstash") {
    cached = new UpstashKV((process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)!, (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)!);
  } else if (kind === "file") {
    cached = new FileKV(process.env.SHARE_FILE || path.join(process.cwd(), ".data", "share.json"));
  } else cached = null;
  return cached;
}

/** テスト用 */
export function setKV(kv: KV | null | undefined) {
  cached = kv;
}
