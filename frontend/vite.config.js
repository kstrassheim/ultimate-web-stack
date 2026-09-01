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
      // Default template if file doesn't exist.
      //
      // Keep these in lockstep with frontend/public/site.webmanifest
      // (issue #141): the app's safe default theme is now dark (see
      // #129 in ThemeProvider.jsx + the boot script in
      // frontend/index.html), so a freshly-regenerated manifest must
      // also ship dark theme_color/background_color. Otherwise a
      // deleted-and-regenerated manifest would silently re-introduce
      // the white splash / white address-bar regression on a
      // dark-themed PWA install.
      manifest = {
        "id": "/",
        "start_url": "/",
        "scope": "/",
        "icons": [
          {
            "src": "/android-chrome-192x192.png",
            "sizes": "192x192",
            "type": "image/png"
          },
          {
            "src": "/android-chrome-512x512.png",
            "sizes": "512x512",
            "type": "image/png"
          }
        ],
        "theme_color": "#0f172a",
        "background_color": "#0f172a",
        "display": "standalone"
      };
    }
    
    // Update name fields with app name from terraform config
    manifest.name = appName;
    manifest.short_name = appName;

    // Pin the app identity (issue #151). Left unset, all three are derived at
    // install time from whatever URL the user happened to be on when they hit
    // "Install": `start_url` defaults to that document URL *including* any
    // ?code=/#state= left over from an Entra sign-in, `scope` to its
    // containing directory, and the install id to `start_url`. Edge tests
    // every navigation against `scope` to decide whether it stays inside the
    // app window, so leaving it implicit lets two users on the same build get
    // different behaviour — one of them having in-app links open a fresh
    // browser window outside the installed app.
    manifest.id = '/';
    manifest.start_url = '/';
    manifest.scope = '/';

    // Icons are resolved against the manifest URL (/site.webmanifest), and
    // Vite flattens public/ into the dist root — so a "public/…" prefix here
    // points at /public/… which does not exist. The catch-all SPA route then
    // answered that miss with index.html at HTTP 200, handing Edge HTML where
    // it expects a PNG instead of an honest 404 (see NON_SPA_SUFFIXES in
    // backend/main.py, which now makes that miss visible).
    manifest.icons = (manifest.icons || []).map(icon => ({
      ...icon,
      src: '/' + String(icon.src).replace(/^\/?(public\/)?/, '')
    }));

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
      '@azure/msal-browser/redirect-bridge': resolve(__dirname, 'mock/azureMsalRedirectBridge.js'),
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
    emptyOutDir: true,
    // Vite 8 defaults to the oxc/rolldown minifier. `rolldownOptions.output.minify.compress`
    // is the supported hook for oxc's dropConsole / dropDebugger flags,
    // which strip every `console.*` call (and every `debugger;` statement)
    // from the production bundle so a debug log cannot leak user-supplied
    // values (usernames, account info, error payloads containing user
    // data) to the browser console of deployed apps. Acceptance criterion
    // #1 of issue #92 ("no user-supplied value is written to the console
    // in a production build") is enforced here.
    rolldownOptions: {
      output: {
        minify: {
          compress: {
            dropConsole: true,
            dropDebugger: true,
          },
        },
      },
    },
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