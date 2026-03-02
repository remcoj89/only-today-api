import type { SyncMutation } from "../types/sync";
import { getNextRetryDelay, MAX_RETRIES } from "./retryStrategy";

export type OutboxItem = SyncMutation & {
  retryCount?: number;
  lastAttemptAt?: string;
};

export type OutboxStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export class OutboxManager {
  private readonly storageKey = "hemera.sync.outbox";
  private readonly storage?: OutboxStorage;
  private items: OutboxItem[] = [];
  private loaded = false;

  constructor(storage?: OutboxStorage) {
    this.storage = storage;
  }

  private async ensureLoaded() {
    if (this.loaded || !this.storage) {
      this.loaded = true;
      return;
    }
    const raw = await this.storage.getItem(this.storageKey);
    this.items = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    this.loaded = true;
  }

  private async persist() {
    if (!this.storage) {
      return;
    }
    await this.storage.setItem(this.storageKey, JSON.stringify(this.items));
  }

  async add(mutation: SyncMutation): Promise<void> {
    await this.ensureLoaded();
    this.items.push(mutation);
    await this.persist();
  }

  async getNextBatch(now: number = Date.now()): Promise<OutboxItem[]> {
    await this.ensureLoaded();
    return this.items.filter((item) => {
      const retryCount = item.retryCount ?? 0;
      if (retryCount === 0 && !item.lastAttemptAt) {
        return true;
      }
      if (!this.shouldRetry(item)) {
        return false;
      }
      const lastAttempt = item.lastAttemptAt ? Date.parse(item.lastAttemptAt) : 0;
      const delay = getNextRetryDelay(retryCount);
      return now - lastAttempt >= delay;
    });
  }

  async markFailed(id: string, now: string = new Date().toISOString()): Promise<void> {
    await this.ensureLoaded();
    this.items = this.items.map((item) => {
      if (item.id !== id) {
        return item;
      }
      const retryCount = (item.retryCount ?? 0) + 1;
      return {
        ...item,
        retryCount,
        lastAttemptAt: now
      };
    });
    await this.persist();
  }

  shouldRetry(item: OutboxItem): boolean {
    const retryCount = item.retryCount ?? 0;
    return retryCount < MAX_RETRIES;
  }

  async getAll(): Promise<OutboxItem[]> {
    await this.ensureLoaded();
    return [...this.items];
  }

  async remove(ids: string[]): Promise<void> {
    await this.ensureLoaded();
    this.items = this.items.filter((item) => !ids.includes(item.id));
    await this.persist();
  }

  async clear(): Promise<void> {
    await this.ensureLoaded();
    this.items = [];
    await this.persist();
  }

  async getPendingCount(): Promise<number> {
    await this.ensureLoaded();
    return this.items.length;
  }
}
