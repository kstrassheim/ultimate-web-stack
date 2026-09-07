/**
 * Coverage for the REAL src/config.js module.
 *
 * jest.setup.js globally mocks '@/config' so every other suite gets a
 * stable stub; this suite unmocks it and exercises the actual
 * environment-derived exports. Two build-time mechanics need a stand-in:
 *
 *   - `import.meta.env.MODE` is rewritten by jest/transform-import-meta.cjs
 *     (scoped to this one file) to read the `global.import.meta.env` stub
 *     jest.setup.js installs. Mutating MODE + re-requiring the module is
 *     how the development/production branches are exercised.
 *   - `__PROD_URI__` / `__PROD_SOCKET_URI__` are Vite `define` globals;
 *     here they are plain globals set before the module is required.
 */

jest.unmock('@/config');

const ORIGINAL_MODE = global.import.meta.env.MODE;

const loadConfig = (mode) => {
  jest.resetModules();
  global.import.meta.env.MODE = mode;
  globalThis.__PROD_URI__ = 'https://prod.example.com';
  globalThis.__PROD_SOCKET_URI__ = 'wss://prod.example.com/socket';
  return require('./config');
};

describe('config.js (real module)', () => {
  afterEach(() => {
    global.import.meta.env.MODE = ORIGINAL_MODE;
    delete globalThis.__PROD_URI__;
    delete globalThis.__PROD_SOCKET_URI__;
  });

  it('derives the dev URLs from the Vite define globals in development mode', () => {
    const config = loadConfig('development');

    expect(config.env).toBe('development');
    expect(config.isDev).toBe(true);
    expect(config.isProd).toBe(false);
    expect(config.productionUrl).toBe('https://prod.example.com');
    expect(config.productionSocketUrl).toBe('wss://prod.example.com/socket');
    expect(config.backendSocketUrl).toBe('wss://prod.example.com/socket');
    expect(config.developmentUrl).toBe('http://localhost:5173');
    // Not production: backend is same-origin (''), frontend is the dev server.
    expect(config.backendUrl).toBe('https://prod.example.com');
    expect(config.frontendUrl).toBe('http://localhost:5173');
  });

  it('uses the production URL as the frontend URL and a same-origin backend in production mode', () => {
    const config = loadConfig('production');

    expect(config.env).toBe('production');
    expect(config.isDev).toBe(false);
    expect(config.isProd).toBe(true);
    expect(config.backendUrl).toBe('');
    expect(config.frontendUrl).toBe('https://prod.example.com');
  });

  it('treats any non-production mode (e.g. test) as not-prod for URL selection', () => {
    const config = loadConfig('test');

    expect(config.isDev).toBe(false);
    expect(config.isProd).toBe(false);
    expect(config.backendUrl).toBe('https://prod.example.com');
    expect(config.frontendUrl).toBe('http://localhost:5173');
  });
});
