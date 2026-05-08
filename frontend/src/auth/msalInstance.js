import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { msalConfig } from '@/auth/entraAuth';

const msalInstance = new PublicClientApplication(msalConfig());

const setInitialActiveAccount = () => {
  const currentActiveAccount = msalInstance.getActiveAccount();
  if (currentActiveAccount) {
    return;
  }

  const allAccounts = msalInstance.getAllAccounts();
  if (allAccounts.length > 0) {
    msalInstance.setActiveAccount(allAccounts[0]);
  }
};

// MSAL Browser v3+ requires initialize() to resolve before any other API call.
export const msalInitialization = msalInstance
  .initialize()
  .then(() => {
    msalInstance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGOUT_SUCCESS) {
        msalInstance.setActiveAccount(null);
        return;
      }

      const account = event?.payload?.account;
      if (!account) {
        return;
      }

      if (
        event.eventType === EventType.LOGIN_SUCCESS ||
        event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS ||
        event.eventType === EventType.SSO_SILENT_SUCCESS
      ) {
        msalInstance.setActiveAccount(account);
      }
    });

    return msalInstance.handleRedirectPromise();
  })
  .then((response) => {
    if (response?.account) {
      msalInstance.setActiveAccount(response.account);
    } else {
      setInitialActiveAccount();
    }
  })
  .catch((error) => {
    console.error('MSAL initialization failed', error);
  });

export default msalInstance;
