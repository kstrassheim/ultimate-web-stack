import { resolve, join } from 'path';
import fs from 'fs';
// import { normalizePath } from 'vite';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
// import { viteStaticCopy } from 'vite-plugin-static-copy';
import tfconfig from './terraform.config.json'
const isDeployment = fs.existsSync('./.deploy');


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
const role = process.env.npm_config_role || null;  // Read the custom param
console.log(`Mocking role: ${role}`); 

export default defineConfig({
  plugins: [react()],
  base: "/",
  // resolve: {
  //   alias: {
  //     // Replace a real API with a mock based on role
  //     '../api/realApi': role === 'Admin' 
  //       ? '../mocks/adminMockApi' 
  //       : '../mocks/userMockApi',
  //   }
  // },
  define: {
    __DEBUG__: !isDeployment,
    __MOCKROLE__: JSON.stringify(role),
    // define another production uri for deployment then local
    __PROD_URI__: isDeployment ? JSON.stringify(tfconfig.web_url.value) : JSON.stringify('http://localhost:8000')
  },
  build: {
    outDir: '../backend/dist',
    emptyOutDir: true
  }
})


copyLogos();