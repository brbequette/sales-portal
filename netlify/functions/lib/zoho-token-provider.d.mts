export interface ZohoTokenCacheValue {
  token: string;
  expiresAt: number;
}

export interface ZohoTokenCacheAdapter {
  read(key: string): Promise<{ value: string } | ZohoTokenCacheValue | null>;
  write(key: string, value: ZohoTokenCacheValue): Promise<unknown>;
}

export interface ZohoTokenProviderOptions {
  env?: Record<string, string | undefined>;
  cache?: Partial<ZohoTokenCacheAdapter>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  abort?: { timeout(milliseconds: number): AbortSignal };
}

export function cleanEnv(value: string | undefined): string;
export function normalizeDataCenter(value: string | undefined): string;
export function createZohoTokenProvider(options?: ZohoTokenProviderOptions): {
  getToken(forceRefresh?: boolean): Promise<string>;
  dataCenter: string;
  cacheKey: string;
  config: Readonly<Record<string, string>>;
};
