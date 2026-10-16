"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { apiFetch, type ApiError } from "./client";

/**
 * Read from the API with SWR: cached in the browser, de-duplicated, refreshed in the background (see the
 * SWRConfig in the app shell) and after every write (refreshAll). Pass null to wait.
 */
export function useApi<T>(url: string | null, config?: SWRConfiguration<T, ApiError>) {
  return useSWR<T, ApiError>(url, (key: string) => apiFetch<T>(key), config);
}
