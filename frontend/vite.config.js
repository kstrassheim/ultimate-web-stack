import { resolve, join } from 'path';
import fs from 'fs';
// import { normalizePath } from 'vite';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import istanbul from 'vite-plugin-istanbul'

const isMockEnabled = process.env.npm_config_mock === 'true';
console.log(`Mocking ${isMockEnabled ? 'enabled' : 'disabled'}`);
// check if this is an pipeline deployment (pipeline will create a empty .deploy file)
const isDeployment = fs.existsSync('./.deploy');

// get terraform config whether mock or real
const configPath = isMockEnabled 
  ? resolve(__dirname, './mock/terraform.mock.config.json')
  : resolve(__dirname, './terraform.config.json');
const tfconfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log(`Using terraform config: ${configPath}`);

// Optional: Copy logo files manually before Vite starts (for development)
const copyLogos = () => {
  const env = tfconfig.env.value || 'dev';
  const srcDir = resolve(__dirname, `logo_src/${env}`);
  // Only attempt copy if source directory exists
  if (fs.existsSync(srcDir)) {
    // Copy to public
    const assetsDir = resolve(__dirname, 'src/assets');
    const publicDir = resolve(__dirname, 'public');
    const files = fs.readdirSync(srcDir);
    files.forEach(file => {
      const srcPath = join(srcDir, file);
      const destPath = join(publicDir, file);
      
      // Check if it's a directory
      if (fs.statSync(srcPath).isDirectory()) {
        // Recursively copy subdirectories
        copyAllFiles(srcPath, destPath);
      } else {
        // Copy file
        fs.copyFileSync(srcPath, destPath);
      }
    });

    if (fs.existsSync(join(srcDir, 'logo.png'))) {
      fs.copyFileSync(join(srcDir, 'logo.png'), join(assetsDir, 'logo.png'));
      fs.copyFileSync(join(srcDir, 'logo.png'), join(assetsDir, 'logo.png'));
    }
  }
}

// Path to the manifest file
const manifestPath = resolve(__dirname, 'public/site.webmanifest');

// Add this function after copyLogos function
const generateWebManifest = () => {
  try {
    // Get app name from terraform config
    const baseAppName = tfconfig.app_name?.value || 'Ultimate Web Stack';
    const env = tfconfig.env?.value?.toLowerCase() || 'dev';
    
    // Add environment to app name for dev or test environments
    const appName = (env === 'dev' || env === 'test') 
      ? `${baseAppName} ${env.toLowerCase()}`
      : baseAppName;
    
    // Read existing manifest as template
    let manifest;
    if (fs.existsSync(manifestPath)) {
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      manifest = JSON.parse(manifestContent);
    } else {
      // Default template if file doesn't exist
      manifest = {
        "icons": [
          {
            "src": "android-chrome-192x192.png",
            "sizes": "192x192",
            "type": "image/png"
          },
          {
            "src": "android-chrome-512x512.png",
            "sizes": "512x512",
            "type": "image/png"
          }
        ],
        "theme_color": "#ffffff",
        "background_color": "#ffffff",
        "display": "standalone"
      };
    }
    
    // Update name fields with app name from terraform config
    manifest.name = appName;
    manifest.short_name = appName;
    
    // Write updated manifest back to file

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Generated site.webmanifest with app name: "${appName}"`);
  } catch (error) {
    console.error('Error generating site.webmanifest:', error);
  }
};

const setTitleEnvVariable = () => {
  const appName = tfconfig.app_name?.value || 'Ultimate Web Stack';
  process.env.VITE_APP_TITLE = appName;
  console.log(`Set VITE_APP_TITLE to "${appName}"`);
};

//const mockRoleIndex = process.argv.indexOf('--role');
// const mockRole = mockRoleIndex > -1 ? process.argv[mockRoleIndex + 1] : null;

const getAliases = () => {

  const baseAliases = {
    '@': resolve(__dirname, 'src')
  };

  if (isMockEnabled) {
    console.log('Redirecting MSAL imports to mock implementation');
    // !! Important : This does the actual mocking in a transparent way
    return {
      '@azure/msal-browser': resolve(__dirname, 'mock/azureMsalBrowser.js'),
      '@/../terraform.config.json': resolve(__dirname, 'mock/terraform.mock.config.json'),
      '@/log/appInsights': resolve(__dirname, 'mock/appInsights.js'),
      '../log/appInsights': resolve(__dirname, 'mock/appInsights.js'),
      '@/api/graphApi': resolve(__dirname, 'mock/graphApi.js'),
      ...baseAliases
    };
  }
  return baseAliases;
};

export default defineConfig({
  plugins: [
    react(),
    // Add Istanbul plugin for code coverage
    istanbul({
      include: 'src/*',
      exclude: ['node_modules', 'test/'],
      extension: ['.js', '.jsx'],
      requireEnv: false,
    })
  ],
  base: "/",
  resolve: {
    alias: getAliases()
  },
  define: {
    __MOCK__: JSON.stringify(isMockEnabled),
    // define another production uri for deployment then local
    __PROD_URI__: isDeployment ? JSON.stringify(tfconfig.web_url.value) : JSON.stringify('http://localhost:8000'),
    __PROD_SOCKET_URI__: isDeployment ? JSON.stringify(tfconfig.web_url.value.replace('https://', 'wss://')): JSON.stringify('ws://localhost:8000')
  },
  build: {
    outDir: '../backend/dist',
    emptyOutDir: true
  },
  server: {
    hmr: {
      // Configure HMR to use a specific port instead of the server port
      port: 24678,
      // Optional: If behind a proxy or having connection issues
      // overlay: false
    }
  },
})


copyLogos();
// Only generate the web manifest when NOT there or in deployment mode
// Generate manifest file logic:
// 1. In dev mode (not deployment), only generate if file doesn't exist
// 2. In production deployment, always generate
if (isDeployment || !fs.existsSync(manifestPath)) {
  generateWebManifest();
}

setTitleEnvVariable();