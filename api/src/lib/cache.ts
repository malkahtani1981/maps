/**
 * Cache-aside layer: Redis when REDIS_URL is set (production, presenting VM),
 * an in-memory Map with TTL otherwise (local development).
 *
 * Educational purpose: same interface, two backends — the classic pattern
 * used at scale (Twitter, GitHub, Stack Overflow all front hot reads with
 * Redis/Memcached). The route API caches by (from,to,engine) key.
 */
import { logger } from "./logger";

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  backend: string;
}

class MemoryCache implements Cache {
  backend = "memory";
  private store = new Map<string, { value: string; expiresAt: number }>();
  async get(key: string) {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    if (this.store.size > 10_000) this.store.clear(); // crude bound; Redis uses LRU policies
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

class RedisCache implements Cache {
  backend = "redis";
  constructor(private client: any) {}
  async get(key: string) {
    return this.client.get(key);
  }
  async set(key: string, value: string, ttlSeconds: number) {
    await this.client.set(key, value, "EX", ttlSeconds);
  }
}

let cache: Cache | null = null;

export async function getCache(): Promise<Cache> {
  if (cache) return cache;
  const url = process.env["REDIS_URL"];
  if (url) {
    try {
      // @ts-expect-error — optional dependency, present in production images only
      const { default: Redis } = await import("ioredis");
      const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
      await client.connect();
      cache = new RedisCache(client);
      logger.info("Cache backend: redis");
      return cache;
    } catch (err) {
      logger.warn({ err }, "REDIS_URL set but Redis unavailable; falling back to memory cache");
    }
  }
  cache = new MemoryCache();
  logger.info("Cache backend: in-memory");
  return cache;
}
