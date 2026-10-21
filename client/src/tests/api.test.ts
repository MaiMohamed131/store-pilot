import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return {
    config,
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Forbidden',
    headers: new AxiosHeaders(),
  };
}
function denied(config: InternalAxiosRequestConfig, code: string) {
  return new AxiosError(
    'Forbidden',
    'ERR_BAD_RESPONSE',
    config,
    undefined,
    response(config, { error: { code } }, 403),
  );
}
describe('CSRF request recovery', () => {
  beforeEach(() => vi.resetModules());
  it('refreshes a stale token once and retries the original payload', async () => {
    const { api } = await import('../lib/api');
    let gets = 0;
    const posts: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = async (config) => {
      if (config.method === 'get')
        return response(config, { data: { token: ++gets === 1 ? 'stale' : 'fresh' } });
      posts.push(config);
      if (posts.length === 1) throw denied(config, 'CSRF_INVALID');
      return response(config, { data: { id: 'signed-in-user' } });
    };
    const result = await api.post('/auth/login', {
      email: 'demo@example.test',
      password: 'local-test',
    });
    expect(result.data.data.id).toBe('signed-in-user');
    expect(gets).toBe(2);
    expect(posts).toHaveLength(2);
    expect(posts[1].headers.get('x-csrf-token')).toBe('fresh');
    expect(posts[1].data).toBe(posts[0].data);
  });
  it('does not retry a rejected origin', async () => {
    const { api } = await import('../lib/api');
    let gets = 0;
    let posts = 0;
    api.defaults.adapter = async (config) => {
      if (config.method === 'get') {
        gets++;
        return response(config, { data: { token: 'token' } });
      }
      posts++;
      throw denied(config, 'CSRF_ORIGIN');
    };
    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(AxiosError);
    expect(gets).toBe(1);
    expect(posts).toBe(1);
  });
  it('stops retrying after a second token rejection', async () => {
    const { api } = await import('../lib/api');
    let posts = 0;
    api.defaults.adapter = async (config) => {
      if (config.method === 'get') return response(config, { data: { token: 'token' } });
      posts++;
      throw denied(config, 'CSRF_INVALID');
    };
    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(AxiosError);
    expect(posts).toBe(2);
  });
});
