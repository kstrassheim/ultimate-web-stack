import { resolve, join } from 'path';
import fs from 'fs';
// import { normalizePath } from 'vite';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
// import { viteStaticCopy } from 'vite-plugin-static-copy';

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
  plugins: [react()],
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