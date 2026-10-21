import axios from 'axios';
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
});
let csrf = '';
let csrfRequest: Promise<void> | undefined;
export async function ensureCsrf() {
  if (!csrf) {
    csrfRequest ??= api
      .get('/auth/csrf')
      .then((r) => {
        csrf = r.data.data.token;
      })
      .finally(() => {
        csrfRequest = undefined;
      });
    await csrfRequest;
  }
}
api.interceptors.request.use(async (config) => {
  if (!['get', 'head', 'options'].includes(config.method ?? 'get')) {
    await ensureCsrf();
    config.headers.set('x-csrf-token', csrf);
  }
  return config;
});
let refreshing: Promise<unknown> | undefined;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status === 403 &&
      error.response?.data?.error?.code === 'CSRF_INVALID' &&
      config &&
      !config._csrfRetried
    ) {
      config._csrfRetried = true;
      csrf = '';
      await ensureCsrf();
      return api(config);
    }
    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !config.url?.startsWith('/auth/')
    ) {
      config._retried = true;
      refreshing ??= api.post('/auth/refresh').finally(() => {
        refreshing = undefined;
      });
      try {
        await refreshing;
        return await api(config);
      } catch {
        window.dispatchEvent(new Event('session-expired'));
      }
    }
    return Promise.reject(error);
  },
);
export const errorMessage = (e: unknown) =>
  axios.isAxiosError(e)
    ? (e.response?.data?.error?.message ?? 'Cannot reach the server. Please try again.')
    : e instanceof Error
      ? e.message
      : 'Something went wrong.';
export const money = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n / 100);
export const date = (s: string) =>
  new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
