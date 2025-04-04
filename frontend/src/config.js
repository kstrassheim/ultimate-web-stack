export const env = import.meta.env.MODE;
export const isDev = env === 'development';
export const isProd = env === 'production';
export const productionUrl = __PROD_URI__; //'; // generated during build to distinct whether local or in app service
export const productionSocketUrl = __PROD_SOCKET_URI__;
export const developmentUrl = 'http://localhost:5173';
export const backendSocketUrl = __PROD_SOCKET_URI__;
export const backendUrl = isProd  ? '': productionUrl;
export const frontendUrl = isProd ? productionUrl : developmentUrl;