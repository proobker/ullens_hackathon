// Builds the app, opens a free Cloudflare quick tunnel to localhost:5173, and starts the
// production servers with the tunnel origin allowed, so a phone can install the PWA over HTTPS.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { Tunnel, bin, install } from 'cloudflared';
import QRCode from 'qrcode';

const LOCAL = 'http://localhost:5173';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// A running `npm run dev` would answer on these ports with the wrong allowed origin.
const portFree = port => new Promise(resolve => {
  const probe = createServer().once('error', () => resolve(false)).once('listening', () => probe.close(() => resolve(true)));
  probe.listen(port);
});
for (const port of [5173, 4100]) {
  if (!(await portFree(port))) {
    console.error(`Port ${port} is in use. Stop \`npm run dev\` (or whatever holds it) and run \`npm run phone\` again.`);
    process.exit(1);
  }
}

if (!process.argv.includes('--skip-build')) {
  const build = spawnSync(npm, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
if (!existsSync(bin)) await install(bin);

const tunnel = Tunnel.quick(LOCAL);
const url = await new Promise((resolve, reject) => {
  tunnel.once('url', resolve);
  tunnel.once('error', reject);
  tunnel.once('exit', code => reject(new Error(`cloudflared exited with code ${code}`)));
});
await new Promise(resolve => tunnel.once('connected', resolve));

const server = spawn(npm, ['run', 'start'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PUBLIC_ORIGIN: `${LOCAL},${url}` }
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  tunnel.stop();
  if (process.platform === 'win32' && server.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
server.on('exit', code => stop(code ?? 1));
tunnel.on('exit', () => { console.error('Cloudflare tunnel closed.'); stop(1); });

for (let attempt = 0; attempt < 120; attempt++) {
  if (await fetch(`${LOCAL}/manifest.webmanifest`).then(r => r.ok, () => false)) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (stopping) process.exit(1);

console.log(`\n${await QRCode.toString(url, { type: 'terminal', small: true })}`);
console.log(`  Phone URL: ${url}`);
console.log('  Scan the QR code, log in (maya.patient / pran-demo-patient), then');
console.log('  Android: menu → Install app   iOS Safari: Share → Add to Home Screen');
console.log('  The URL changes every run. Press Ctrl+C to stop.\n');
