import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine the Python executable path in a more robust way
const isWindows = process.platform === 'win32';
const backendPath = path.resolve(__dirname, '../backend');
const venvPath = path.resolve(backendPath, 'venv');

// Try different possible Python executable locations
function findPythonExecutable() {
  const possiblePaths = isWindows 
    ? [
        path.join(venvPath, 'Scripts', 'python.exe'),
        path.join(backendPath, 'venv', 'Scripts', 'python.exe'),
        'python.exe', // Fallback to system Python if venv not found
      ]
    : [
        path.join(venvPath, 'bin', 'python'),
        path.join(backendPath, 'venv', 'bin', 'python'),
        'python3',  // Try python3 first on Unix
        'python',   // Fallback to system Python
      ];
  
  // Return the first path that exists
  for (const pythonPath of possiblePaths) {
    // For absolute paths, check if they exist
    if (path.isAbsolute(pythonPath) && fs.existsSync(pythonPath)) {
      console.log(`Using Python executable: ${pythonPath}`);
      return pythonPath;
    } 
    // For relative/system paths (like 'python' or 'python3'), just use as is
    else if (!path.isAbsolute(pythonPath)) {
      console.log(`Using system Python: ${pythonPath}`);
      return pythonPath;
    }
  }
  
  // If nothing found, use default
  const defaultPath = isWindows ? 'python.exe' : 'python3';
  console.warn(`No Python executable found, falling back to ${defaultPath}`);
  return defaultPath;
}

const pythonExe = findPythonExecutable();

// Launch FastAPI with debugpy
const args = [
  '-m', 'uvicorn',
  'main:app',
  '--host', '0.0.0.0',
  '--port', '8000',
  '--reload'
];

// Add debugpy args if needed
const enableDebug = true //process.env.ENABLE_DEBUG === 'true';
if (enableDebug) {
  //args.unshift('--wait-for-client');
  args.unshift('5678');
  args.unshift('--listen');
  args.unshift('-m', 'debugpy');
}

const backend = spawn(pythonExe, args, {
  cwd: backendPath,
  env: { ...process.env, MOCK: process.env.MOCK || 'true' },
  stdio: 'inherit'
});

process.on('SIGINT', () => {
  backend.kill('SIGINT');
  process.exit(0);
});