export type NetworkStatusListener = (online: boolean) => void;

export interface NetworkStatus {
  isOnline: () => boolean;
  onChange: (listener: NetworkStatusListener) => () => void;
}

export class AlwaysOnlineStatus implements NetworkStatus {
  isOnline() {
    return true;
  }

  onChange(_listener: NetworkStatusListener) {
    return () => {};
  }
}
