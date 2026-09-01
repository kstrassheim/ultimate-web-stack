import { LogLevel, InteractionRequiredAuthError } from '@azure/msal-browser';
import { frontendUrl } from "@/config";
import tfconfig from '@/../terraform.config.json';
import appInsights from '@/log/appInsights';


export const msalConfig = () =>{
  return {
    auth: {
      clientId: tfconfig.client_id.value,
      authority: `https://login.microsoftonline.com/${tfconfig.tenant_id.value}/v2.0`,
      redirectUri: frontendUrl,
      postLogoutRedirectUri: frontendUrl+'/post-logout',
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          console[level === LogLevel.Error ? 'error' : 'info'](message);
        }
      }
    }
  };
};


export const loginRequest = {
  scopes: tfconfig.requested_graph_api_delegated_permissions.value,
};

export const retrieveTokenForBackend = async (instance, extraScopes = []) => {
  appInsights.trackEvent({ name: 'MSAL Retrieving Token' });
  const account = instance.getActiveAccount();
  const tokenResponse = await instance.acquireTokenSilent({
    scopes: [tfconfig.oauth2_permission_scope_uri.value, ...extraScopes],
    account: account,
  });
  return tokenResponse.accessToken;
}

// Graph delegated permissions this app actually uses. Requesting
// `https://graph.microsoft.com/.default` instead means "every delegated
// permission already consented for this user and app" — so for any user
// missing consent it fails with InteractionRequiredAuthError on *every* call
// rather than prompting for the one scope that is missing (issue #151).
export const GRAPH_SCOPES = ['User.Read'];

/**
 * Thrown when Graph needs an interactive consent that we deliberately did not
 * open a popup for. Callers can tell "this user has to grant access" apart
 * from "Graph is broken" and render an affordance instead of an error.
 */
export class GraphConsentRequiredError extends Error {
  constructor(scopes, options) {
    super('Graph access requires consent', options);
    this.name = 'GraphConsentRequiredError';
    this.scopes = scopes;
  }
}

// Matched by name as well as identity: the Cypress/vite mock build swaps the
// module graph (see `getAliases()` in vite.config.js), so a
// GraphConsentRequiredError can cross a module boundary `instanceof` does not
// survive.
export const isGraphConsentRequiredError = (error) =>
  error instanceof GraphConsentRequiredError || error?.name === 'GraphConsentRequiredError';

// MSAL surfaces "the user must interact" in several shapes: a real
// InteractionRequiredAuthError, a plain object carrying only `name` (the mock
// MSAL used by the Cypress/vite mock build), or an AuthError whose errorCode
// says consent/interaction/login is required. Matching on `instanceof` alone
// would silently stop recognising the last two and put us straight back to
// re-throwing where we used to prompt.
const INTERACTION_REQUIRED_CODES = ['consent_required', 'interaction_required', 'login_required'];

export const isInteractionRequiredError = (error) =>
  error instanceof InteractionRequiredAuthError ||
  error?.name === 'InteractionRequiredAuthError' ||
  INTERACTION_REQUIRED_CODES.includes(error?.errorCode);

// One interaction-required failure must not become one popup per navigation.
// Remember for the lifetime of the tab that silent Graph auth cannot succeed
// for this account; only an explicit user gesture retries it.
const consentBlockedAccounts = new Set();

const accountKeyOf = (account) => account?.homeAccountId || account?.username || '';

/** Test seam / sign-out hook: forget which accounts need interactive consent. */
export const resetGraphConsentState = () => consentBlockedAccounts.clear();

/**
 * Acquire a Microsoft Graph access token.
 *
 * @param {object} instance - MSAL PublicClientApplication
 * @param {string[]} extraScopes - additional delegated Graph scopes required
 * @param {{interactive?: boolean}} options - `interactive: true` permits a
 *   popup, and MUST only be passed from a real user gesture.
 *   `acquireTokenPopup` is `window.open`: called from a mount effect it steals
 *   focus into a fresh window on every navigation, and in an installed PWA
 *   that window is a separate Edge browser window outside the app (#151).
 */
export const retrieveTokenForGraph = async (instance, extraScopes = [], { interactive = false } = {}) => {
  appInsights.trackEvent({ name: 'MSAL Retrieving Graph Token' });
  const account = instance.getActiveAccount();
  const scopesToRequest = [...new Set([...GRAPH_SCOPES, ...extraScopes])];
  const accountKey = accountKeyOf(account);

  // Known to need consent and nobody asked for it — fail fast, no popup.
  if (!interactive && consentBlockedAccounts.has(accountKey)) {
    throw new GraphConsentRequiredError(scopesToRequest);
  }

  try {
    const tokenResponse = await instance.acquireTokenSilent({
      scopes: scopesToRequest,
      account: account
    });

    consentBlockedAccounts.delete(accountKey);
    return tokenResponse.accessToken;
  } catch (error) {
    appInsights.trackException({
      exception: error,
      properties: {
        operation: 'retrieveTokenForGraph',
        scopes: scopesToRequest.join(',')
      }
    });

    if (!isInteractionRequiredError(error)) {
      throw error;
    }

    if (!interactive) {
      consentBlockedAccounts.add(accountKey);
      throw new GraphConsentRequiredError(scopesToRequest, { cause: error });
    }

    const interactiveResponse = await instance.acquireTokenPopup({
      scopes: scopesToRequest,
    });

    consentBlockedAccounts.delete(accountKey);
    return interactiveResponse.accessToken;
  }
};

