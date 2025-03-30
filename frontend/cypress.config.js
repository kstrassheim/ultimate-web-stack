import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    env: {
      apiUrl: 'http://localhost:8000'
    },
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    // You can add launch options:
    // For example, to include the remote debugging flag:

    // Video configuration
    video: true,
    videoCompression: 32,
    videosFolder: 'cypress/videos',
    
    // Screenshot configuration
    screenshotOnRunFailure: true,
    screenshotsFolder: 'cypress/screenshots',
    
    // Only keep videos for failures
    videoUploadOnPasses: false,
   
    // Configure dev server to start before tests
    devServer: {
        command: 'npm run dev',
        port: 5173,
        timeout: 60000, // milliseconds
    },
  },
  // Browser launch options with debugging port
//   chromeWebSecurity: false, // Try disabling web security
//   browsers: [
//     {
//       name: 'chrome',
//       family: 'chromium',
//       channel: 'stable',
//       displayName: 'Chrome',
//       version: '114.0.5735.133',
//       path: '',
//       majorVersion: '114',
//       // Use userland-flags
//       launchOptions: {
//         args: [
//           '--remote-debugging-port=9222',
//           '--disable-gpu',
//           '--no-sandbox'
//         ]
//       }
//     }
//   ],
//   env: {
//     CYPRESS_REMOTE_DEBUGGING_PORT: 9222
//   }
});