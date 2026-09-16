import { createEnv } from './env.util';
import { describe, expect, it } from 'bun:test';

describe('createEnv', () => {
  it('falls back to the default for an empty value', () => {
    const env = createEnv(() => '');
    expect(env('VITE_PB_URL').string('http://fallback')).toBe('http://fallback');
  });

  it('falls back to the default for an undefined value', () => {
    const env = createEnv(() => undefined);
    expect(env('VITE_PB_URL').string('http://fallback')).toBe('http://fallback');
  });

  it('uses the value when there is one', () => {
    const env = createEnv(() => 'http://localhost:8090');
    expect(env('VITE_PB_URL').string('http://fallback')).toBe('http://localhost:8090');
  });

  it('treats an empty value as unset for booleans and numbers too', () => {
    const env = createEnv(() => '');
    expect(env('SOME_FLAG').boolean(true)).toBe(true);
    expect(env('SOME_PORT').number(8090)).toBe(8090);
  });
});
