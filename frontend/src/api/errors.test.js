import {
  ApiError,
  SessionExpiredError,
  onSessionExpired,
  notifySessionExpired,
  bodyLooksLikeLoginPage,
  inspectResponseForExpiry,
  inspectionJson,
} from './errors';

const silentConsoleError = () => {
  const original = console.error;
  console.error = jest.fn();
  return () => { console.error = original; };
};

const makeResponse = ({
  status = 200,
  statusText = 'OK',
  ok,
  contentType,
  bodyText = '',
  redirected = false,
  url = 'https://api.example.com/api/user-data',
} = {}) => {
  return {
    status,
    statusText,
    ok: typeof ok === 'boolean' ? ok : status >= 200 && status < 300,
    redirected,
    url,
    headers: {
      get: (name) => {
        if (typeof contentType === 'string' && name.toLowerCase() === 'content-type') {
          return contentType;
        }
        return null;
      },
    },
    text: async () => bodyText,
  };
};

describe('api/errors', () => {
  describe('SessionExpiredError', () => {
    it('stores the detection and target URL', () => {
      const err = new SessionExpiredError('msg', {
        detection: 'redirected',
        targetUrl: 'https://login.microsoftonline.com/foo',
        status: 302,
      });
      expect(err.name).toBe('SessionExpiredError');
      expect(err.detection).toBe('redirected');
      expect(err.targetUrl).toBe('https://login.microsoftonline.com/foo');
      expect(err.status).toBe(302);
      expect(err.message).toBe('msg');
      expect(err instanceof Error).toBe(true);
    });

    it('is(value) walks the .cause chain', () => {
      const root = new SessionExpiredError('root');
      const wrapped = new Error('wrapper', { cause: root });
      const doubleWrapped = new ApiError('again', { cause: wrapped });

      expect(SessionExpiredError.is(root)).toBe(true);
      expect(SessionExpiredError.is(wrapped)).toBe(true);
      expect(SessionExpiredError.is(doubleWrapped)).toBe(true);
      expect(SessionExpiredError.is(new Error('plain'))).toBe(false);
      expect(SessionExpiredError.is(null)).toBe(false);
      expect(SessionExpiredError.is(undefined)).toBe(false);
    });

    it('is(value) does not loop on cyclic causes', () => {
      const a = new Error('a');
      const b = new Error('b');
      a.cause = b;
      b.cause = a;
      expect(() => SessionExpiredError.is(a)).not.toThrow();
      expect(SessionExpiredError.is(a)).toBe(false);
    });
  });

  describe('onSessionExpired / notifySessionExpired', () => {
    let restoreConsole;
    beforeEach(() => {
      restoreConsole = silentConsoleError();
    });
    afterEach(() => {
      restoreConsole();
    });

    it('subscribes a handler and notifies it', () => {
      const handler = jest.fn();
      const off = onSessionExpired(handler);
      const payload = { error: new SessionExpiredError('x'), source: '/api/foo' };
      notifySessionExpired(payload);
      expect(handler).toHaveBeenCalledWith(payload);
      off();
      notifySessionExpired(payload);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('rejects non-function handlers', () => {
      expect(() => onSessionExpired(null)).toThrow(TypeError);
      expect(() => onSessionExpired('not a function')).toThrow(TypeError);
    });

    it('continues notifying other handlers when one throws', () => {
      const bad = jest.fn(() => { throw new Error('boom'); });
      const good = jest.fn();
      onSessionExpired(bad);
      onSessionExpired(good);
      notifySessionExpired({});
      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
    });
  });

  describe('bodyLooksLikeLoginPage', () => {
    it('returns false when body is empty', () => {
      expect(bodyLooksLikeLoginPage('', 'text/html')).toBe(false);
      expect(bodyLooksLikeLoginPage(null, 'text/html')).toBe(false);
    });

    it('returns false when content-type is not HTML', () => {
      expect(bodyLooksLikeLoginPage('Sign in to your account', 'application/json')).toBe(false);
    });

    it('matches known login markers in the body', () => {
      expect(bodyLooksLikeLoginPage('<html>Sign in to your account</html>', 'text/html')).toBe(true);
      expect(bodyLooksLikeLoginPage('<html>login.microsoftonline.com/foo</html>', 'text/html')).toBe(true);
      expect(bodyLooksLikeLoginPage('<html>.auth/login/aad</html>', 'text/html')).toBe(true);
      expect(bodyLooksLikeLoginPage('<html>plain page</html>', 'text/html')).toBe(false);
    });

    it('does not match when both content-type is wrong and body matches markers', () => {
      expect(bodyLooksLikeLoginPage('Sign in to your account', 'application/json')).toBe(false);
    });
  });

  describe('inspectResponseForExpiry', () => {
    it('detects redirect to login via final URL', async () => {
      const response = makeResponse({
        status: 200,
        contentType: 'text/html',
        bodyText: '<html></html>',
        redirected: true,
        url: 'https://app.example.com/.auth/login/aad?post_login_redirect_url=/dashboard',
      });
      const result = await inspectResponseForExpiry(response);
      expect(result.looksLikeExpiry).toBe(true);
      expect(result.detection).toBe('redirected-to-login');
      expect(result.finalUrl).toContain('.auth/login/aad');
      expect(result.bodyText).toBe('<html></html>');
    });

    it('detects HTML body with login marker on 200', async () => {
      const response = makeResponse({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        bodyText: '<html><title>Sign in to your account</title></html>',
      });
      const result = await inspectResponseForExpiry(response);
      expect(result.looksLikeExpiry).toBe(true);
      expect(result.detection).toBe('login-marker');
    });

    it('detects plain HTML body (no marker) on 200 as html-body', async () => {
      const response = makeResponse({
        status: 200,
        contentType: 'text/html',
        bodyText: '<html><body>Plain page</body></html>',
      });
      const result = await inspectResponseForExpiry(response);
      expect(result.looksLikeExpiry).toBe(true);
      expect(result.detection).toBe('html-body');
    });

    it('returns false for genuine 200 JSON', async () => {
      const response = makeResponse({
        status: 200,
        contentType: 'application/json',
        bodyText: '{"message":"hello"}',
      });
      const result = await inspectResponseForExpiry(response);
      expect(result.looksLikeExpiry).toBe(false);
      expect(result.detection).toBeUndefined();
    });

    it('returns false for genuine 401 (treated as a real API error, not expiry)', async () => {
      const response = makeResponse({
        status: 401,
        statusText: 'Unauthorized',
        contentType: 'application/json',
        bodyText: '{"error":"unauthorized"}',
      });
      const result = await inspectResponseForExpiry(response);
      expect(result.looksLikeExpiry).toBe(false);
      expect(result.status).toBe(401);
    });

    it('returns false for genuine 403', async () => {
      const response = makeResponse({
        status: 403,
        statusText: 'Forbidden',
        contentType: 'application/json',
        bodyText: '{"error":"forbidden"}',
      });
      const result = await inspectResponseForExpiry(response);
      expect(result.looksLikeExpiry).toBe(false);
    });

    it('returns false for genuine 500', async () => {
      const response = makeResponse({
        status: 500,
        statusText: 'Server Error',
        contentType: 'text/html',
        bodyText: '<html>500 error</html>',
      });
      const result = await inspectResponseForExpiry(response);
      // A 500 with HTML body is still treated as a real backend error
      // (not expiry) — the API genuinely returned 500.
      expect(result.looksLikeExpiry).toBe(false);
      expect(result.status).toBe(500);
    });

    it('does not consider plain-text status 200 as expiry', async () => {
      const response = makeResponse({
        status: 200,
        contentType: 'text/plain',
        bodyText: 'not html',
      });
      const result = await inspectResponseForExpiry(response);
      expect(result.looksLikeExpiry).toBe(false);
    });

    it('tolerates responses with no headers or text method (test mocks)', async () => {
      const result = await inspectResponseForExpiry({ status: 200, ok: true });
      expect(result.status).toBe(200);
      expect(result.looksLikeExpiry).toBe(false);
    });

    it('defaults status to 500 when ok is explicitly false and status missing', async () => {
      const result = await inspectResponseForExpiry({ ok: false });
      expect(result.status).toBe(500);
      expect(result.looksLikeExpiry).toBe(false);
    });
  });

  describe('inspectionJson', () => {
    it('parses JSON from inspection body', () => {
      const value = inspectionJson({ bodyText: '{"a":1,"b":[1,2]}' });
      expect(value).toEqual({ a: 1, b: [1, 2] });
    });

    it('throws ApiError when body is not JSON', () => {
      let caught;
      try {
        inspectionJson({ bodyText: 'not json' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.message).toMatch(/parse/i);
    });

    it('throws ApiError when inspection has no body', () => {
      expect(() => inspectionJson(null)).toThrow(ApiError);
    });
  });
});
