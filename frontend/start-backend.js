import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWindows = process.platform === 'win32';
const pythonExe = isWindows ? 
  path.resolve(__dirname, '../backend/venv/Scripts/python.exe') : 
  path.resolve(__dirname, '../backend/venv/bin/python');

const backendDir = path.resolve(__dirname, '../backend');

const backend = spawn(pythonExe, ['-m', 'uvicorn', 'main:app', '--reload', '--port', '8000'], {
  cwd: backendDir,
  stdio: 'inherit'
});

process.on('SIGINT', () => {
  backend.kill();
  process.exit();
});