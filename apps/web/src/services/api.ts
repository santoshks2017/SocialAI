// VITE_API_URL must be set in Vercel / your deployment environment.
// Example: https://cardekho-social-ai-api.onrender.com/v1
// In local Vite dev, fall back to the API workspace's default Fastify port.
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)
  ?? (import.meta.env.DEV ? 'http://127.0.0.1:3001/v1' : '');

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

// Attempt a silent token refresh; returns new token or null on failure.
async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    if (!data.token) return null;
    localStorage.setItem('access_token', data.token);
    return data.token;
  } catch {
    return null;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE_URL}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const token = localStorage.getItem('access_token');

  const hasJsonBody = fetchOptions.body !== undefined && !(fetchOptions.body instanceof FormData);

  const headers: HeadersInit = {
    ...(hasJsonBody && { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...fetchOptions.headers,
  };

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    // Auto-refresh on 401 (once) then retry
    if (response.status === 401 && !isRetry) {
      // Capture whether a real session existed BEFORE attempting refresh
      const hadRealSession = !!(localStorage.getItem('access_token') || localStorage.getItem('refresh_token'));
      const newToken = await tryRefreshToken();
      if (newToken) {
        return request<T>(endpoint, options, true);
      }
      // Only force-logout when a real session expired; demo users (no token) stay logged in
      if (hadRealSession) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_info');
        window.dispatchEvent(new Event('auth:logout'));
      }
    }

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = typeof data.message === 'string'
        ? data.message
        : (data.error && typeof data.error === 'string'
          ? data.error
          : (data.error?.message || 'An error occurred'));
      throw new ApiError(
        errorMessage,
        response.status,
        data
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error', 0);
  }
}

export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(endpoint, { method: 'GET', params }),
  
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  
  put: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
  
  upload: <T>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {}, 
    }),
};

export default api;
