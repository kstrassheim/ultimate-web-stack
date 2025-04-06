//// filepath: c:\projects\ultimate-web-stack\frontend\src\api\graphApi.test.js
import { getProfilePhoto, getAllGroups } from './graphApi';
import { retrieveTokenForGraph } from '@/auth/entraAuth';
import appInsights from '@/log/appInsights';

// Add the following block to mock the entire module so that retrieveTokenForGraph becomes a jest mock:
jest.mock('@/auth/entraAuth', () => ({
  retrieveTokenForGraph: jest.fn(),
  loginRequest: {}
}));

global.fetch = jest.fn();

// Ensure window.getProfilePhoto is undefined so our own implementation runs.
delete window.getProfilePhoto;

// Remove any explicit mock for graphApi so the real implementation is used
jest.unmock('@/api/graphApi');

describe('graphApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfilePhoto', () => {
    it('calls trackEvent and fetches profile photo successfully', async () => {
      const mockBlob = new Blob(['fake image data'], { type: 'image/png' });
      const expectedUrl = 'blob:http://localhost/fake-url';

      // Create a fake instance that supports acquireTokenSilent
      const mockInstance = {
        acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'fake-token' })
      };
      // A fake active account with an Admin role
      const mockAccount = { 
        username: 'testuser',
        idTokenClaims: { roles: ['Admin'] }
      };

      global.URL.createObjectURL = jest.fn().mockReturnValue(expectedUrl);
      fetch.mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob)
      });

      const result = await getProfilePhoto(mockInstance, mockAccount);
      expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Profile - Getting profile image' });
      expect(global.fetch).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me/photo/$value', {
        headers: { Authorization: 'Bearer fake-token' }
      });
      expect(result).toBe(expectedUrl);
    });

    it('returns undefined if no active account', async () => {
      // Expect undefined (not null) when activeAccount is falsy
      const result = await getProfilePhoto({}, null);
      expect(result).toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('handles fetch errors gracefully', async () => {
      fetch.mockRejectedValue(new Error('Network error'));
      await getProfilePhoto({}, { username: 'testuser' });
      expect(appInsights.trackException).toHaveBeenCalled();
    });
  });

  describe('getAllGroups', () => {
    it('requests token with Group.Read.All and fetches group data', async () => {
      // Provide an instance with a getActiveAccount() function
      const mockInstance = {
        getActiveAccount: jest.fn().mockReturnValue({
          idTokenClaims: { roles: ['Admin'] }
        })
      };

      // Instead of spyOn, assign a new mock implementation directly.
      retrieveTokenForGraph.mockResolvedValue('fake-group-token');

      fetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ value: [{ id: 'group1' }] })
      });

      const result = await getAllGroups(mockInstance);
      expect(appInsights.trackEvent).toHaveBeenCalledWith({ name: 'Api Call - getAllGroups (Graph API)' });
      expect(retrieveTokenForGraph).toHaveBeenCalledWith(mockInstance, ['Group.Read.All']);
      expect(global.fetch).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/groups', {
        headers: {
          Authorization: 'Bearer fake-group-token',
          'Content-Type': 'application/json'
        }
      });
      expect(result).toEqual([{ id: 'group1' }]);
    });

    it('tracks exception if fetch fails', async () => {
      const mockInstance = {
        getActiveAccount: jest.fn().mockReturnValue({
          idTokenClaims: { roles: ['Admin'] }
        })
      };
      retrieveTokenForGraph.mockResolvedValue('fake-group-token');
      fetch.mockRejectedValue(new Error('Network error'));
      await expect(getAllGroups(mockInstance)).rejects.toThrow();
      expect(appInsights.trackException).toHaveBeenCalled();
    });
  });
});