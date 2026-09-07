/**
 * The trailing-slash arm of WebSocketClient's base-URL cond-expr.
 *
 * '@/config' is mocked per test FILE, so exercising a backendSocketUrl with
 * a trailing slash needs its own file — a file-level jest.mock wins over a
 * doMock inside isolateModules.
 */
import { WebSocketClient } from './socket';

jest.mock('@/config', () => ({
  backendSocketUrl: 'wss://trailing.example.com/',
}));

jest.mock('@/auth/entraAuth', () => ({
  retrieveTokenForBackend: jest.fn().mockResolvedValue('mock-token-123'),
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
}));

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.send = jest.fn();
    this.close = jest.fn();
  }
}
MockWebSocket.OPEN = 1;

global.WebSocket = jest.fn((url) => new MockWebSocket(url));

describe('WebSocketClient with a trailing-slash backend URL', () => {
  it('does not produce a double slash in the socket URL', async () => {
    const client = new WebSocketClient('ws/endpoint');
    await client.connect({});

    expect(global.WebSocket).toHaveBeenCalledWith('wss://trailing.example.com/ws/endpoint');
  });
});
