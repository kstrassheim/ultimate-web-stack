import { defineConfig } from 'cypress';
import fs from 'fs';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    
    // Video configuration
    video: true,
    videoCompression: 32,
    videosFolder: 'cypress/videos',
    
    // Screenshot configuration
    screenshotOnRunFailure: true,
    screenshotsFolder: 'cypress/screenshots',
    
    // Only keep videos for failures
    videoUploadOnPasses: false,
   
    // Fix the event handler to use ES module syntax
    setupNodeEvents(on, config) {
      on('after:spec', (spec, results) => {
        // If the spec has a video and none of the tests failed
        if (results && results.video && !results.tests.some(test => test.state === 'failed')) {
          console.log(`Deleting video for passing spec: ${spec.name}`);
          
          // Delete the video file
          try {
            fs.unlinkSync(results.video);
          } catch (error) {
            console.error('Error deleting video:', error);
          }
        }
      });
      
      on('task', {
        coverageReport: () => {
          // coverage collection disabled - unit tests removed
          return null;
        }
      });
      
      return config;
    }
  }
});