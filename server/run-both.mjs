import { spawn } from 'node:child_process';

const run = (script) => spawn('npm', ['run', script], { stdio: 'inherit', shell: true });

const api = run('start:api');
const ui = run('start');

let closed = false;
function shutdown(code = 0) {
  if (closed) return;
  closed = true;
  api.kill();
  ui.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
api.on('exit', (code) => {
  if (code !== 0) {
    console.error(`API exited with code ${code}`);
    shutdown(code ?? 1);
  }
});
ui.on('exit', (code) => shutdown(code ?? 0));
