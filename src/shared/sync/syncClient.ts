import type {
  SyncMutation,
  SyncPullResponse,
  SyncPushResponse
} from "../types/sync";

type AuthTokenProvider = () => Promise<string | null>;

export class SyncClient {
  private readonly apiUrl: string;
  private readonly getAuthToken: AuthTokenProvider;

  constructor(apiUrl: string, getAuthToken: AuthTokenProvider) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.getAuthToken = getAuthToken;
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const token = await this.getAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async push(mutations: SyncMutation[]): Promise<SyncPushResponse> {
    const response = await fetch(`${this.apiUrl}/sync/push`, {
      method: "POST",
      headers: await this.buildHeaders(),
      body: JSON.stringify({ mutations })
    });
    if (!response.ok) {
      throw new Error(`Sync push failed (${response.status})`);
    }
    const payload = (await response.json()) as { data: SyncPushResponse };
    return payload.data;
  }

  async pull(since: string, docTypes?: string[]): Promise<SyncPullResponse> {
    const params = new URLSearchParams({ since });
    if (docTypes && docTypes.length > 0) {
      params.set("docTypes", docTypes.join(","));
    }
    const response = await fetch(`${this.apiUrl}/sync/pull?${params.toString()}`, {
      method: "GET",
      headers: await this.buildHeaders()
    });
    if (!response.ok) {
      throw new Error(`Sync pull failed (${response.status})`);
    }
    const payload = (await response.json()) as { data: SyncPullResponse };
    return payload.data;
  }

  async fullSync(mutations: SyncMutation[], pullSince: string): Promise<{
    push: SyncPushResponse;
    pull: SyncPullResponse;
  }> {
    const response = await fetch(`${this.apiUrl}/sync/full`, {
      method: "POST",
      headers: await this.buildHeaders(),
      body: JSON.stringify({ push: { mutations }, pullSince })
    });
    if (!response.ok) {
      throw new Error(`Sync full failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      data: { push: SyncPushResponse; pull: SyncPullResponse };
    };
    return payload.data;
  }
}
