import type { SyncMutation, SyncMutationResult } from "../types/sync";
import type { OutboxManager } from "./outbox";
import type { SyncClient } from "./syncClient";
import { extractConflicts, type ConflictHandler } from "./conflictHandler";
import { AlwaysOnlineStatus, type NetworkStatus, type NetworkStatusListener } from "./networkStatus";

export type SyncStatus = "synced" | "pending" | "syncing" | "error";
export type SyncEvent = "syncStart" | "syncComplete" | "syncError" | "offlineChange";

export type SyncStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

class MemoryStorage implements SyncStorage {
  private readonly store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

export class SyncManager {
  private readonly syncClient: SyncClient;
  private readonly outbox: OutboxManager;
  private readonly storage: SyncStorage;
  private readonly conflictHandler?: ConflictHandler;
  private readonly networkStatus: NetworkStatus;
  private status: SyncStatus = "synced";
  private online = true;
  private autoSyncTimer?: ReturnType<typeof setInterval>;
  private readonly lastSyncKey = "hemera.sync.lastSyncTime";
  private readonly listeners = new Map<SyncEvent, Set<(payload?: unknown) => void>>();

  constructor(
    syncClient: SyncClient,
    outbox: OutboxManager,
    storage?: SyncStorage,
    conflictHandler?: ConflictHandler,
    networkStatus?: NetworkStatus
  ) {
    this.syncClient = syncClient;
    this.outbox = outbox;
    this.storage = storage ?? new MemoryStorage();
    this.conflictHandler = conflictHandler;
    this.networkStatus = networkStatus ?? new AlwaysOnlineStatus();
    this.online = this.networkStatus.isOnline();
    this.networkStatus.onChange((online) => {
      this.online = online;
      this.emit("offlineChange", online);
    });
  }

  async queueMutation(mutation: SyncMutation): Promise<void> {
    await this.outbox.add(mutation);
    this.status = "pending";
  }

  async getLastSyncTime(): Promise<string | null> {
    return this.storage.getItem(this.lastSyncKey);
  }

  getSyncStatus(): SyncStatus {
    return this.status;
  }

  on(event: SyncEvent, handler: (payload?: unknown) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
    return () => {
      set.delete(handler);
    };
  }

  async sync(): Promise<void> {
    if (this.status === "syncing") {
      return;
    }
    if (!this.online) {
      this.status = "pending";
      return;
    }
    this.status = "syncing";
    this.emit("syncStart");
    let batchIds: string[] = [];
    try {
      const pending = await this.outbox.getNextBatch();
      if (pending.length > 0) {
        batchIds = pending.map((item) => item.id);
        const pushResponse = await this.syncClient.push(pending);
        await this.handlePushResults(pushResponse.results);
      }

      const since = (await this.getLastSyncTime()) ?? new Date(0).toISOString();
      const pullResponse = await this.syncClient.pull(since);
      await this.storage.setItem(this.lastSyncKey, pullResponse.serverTime);

      const remaining = await this.outbox.getPendingCount();
      this.status = remaining > 0 ? "pending" : "synced";
      this.emit("syncComplete");
    } catch (err) {
      if (batchIds.length > 0) {
        await Promise.all(batchIds.map((id) => this.outbox.markFailed(id)));
      }
      this.status = "error";
      this.emit("syncError", err);
      throw err;
    }
  }

  startAutoSync(intervalMs: number): void {
    if (this.autoSyncTimer) {
      return;
    }
    this.autoSyncTimer = setInterval(() => {
      void this.sync().catch(() => {});
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (!this.autoSyncTimer) {
      return;
    }
    clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = undefined;
  }

  private async handlePushResults(results: SyncMutationResult[]) {
    const successfulIds = results.filter((result) => result.success).map((result) => result.id);
    if (successfulIds.length > 0) {
      await this.outbox.remove(successfulIds);
    }
    const failedIds = results.filter((result) => !result.success).map((result) => result.id);
    if (failedIds.length > 0) {
      await Promise.all(failedIds.map((id) => this.outbox.markFailed(id)));
    }
    if (this.conflictHandler) {
      const conflicts = extractConflicts(results);
      if (conflicts.length > 0) {
        this.conflictHandler(conflicts);
      }
    }
  }

  private emit(event: SyncEvent, payload?: unknown) {
    const listeners = this.listeners.get(event);
    if (!listeners) {
      return;
    }
    for (const handler of listeners) {
      handler(payload);
    }
  }
}
