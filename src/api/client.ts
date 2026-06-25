import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://kadi.olininnovations.co.ke/api';

const TOKEN_KEY = 'kadi_auth_token';

// --- Token storage (SecureStore, never AsyncStorage) ------------------------

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// --- Error type -------------------------------------------------------------

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  errors?: FieldErrors;

  constructor(message: string, status: number, errors?: FieldErrors) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }

  /** First validation message for a field, if any. */
  fieldError(field: string): string | undefined {
    return this.errors?.[field]?.[0];
  }
}

// --- Fetch wrapper ----------------------------------------------------------

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Send the bearer token (defaults to true). */
  auth?: boolean;
  /** Provide a token explicitly (e.g. right after login before it's stored). */
  token?: string | null;
}

export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, auth = true, token } = opts;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const bearer = token !== undefined ? token : await getToken();
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  }

  const url = path.startsWith('http') ? path : `${BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Network error — check your connection and try again.',
      0
    );
  }

  // 204 No Content (logout, etc.)
  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const obj = (data ?? {}) as { message?: string; errors?: FieldErrors };
    const message =
      obj.message ??
      (res.status === 401
        ? 'You are not signed in.'
        : 'Something went wrong. Please try again.');
    throw new ApiError(message, res.status, obj.errors);
  }

  return data as T;
}

export const API_BASE = BASE;
