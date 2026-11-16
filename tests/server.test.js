const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test('HTTP server exposes the game, health endpoint and City Guide module', async t => {
  const port = await freePort();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'citygame-test-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), ACC_FILE: path.join(temp, 'accounts.json'), SAVE_FILE: path.join(temp, 'saves.json') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const base = 'http://127.0.0.1:' + port;
  let response;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) assert.fail('Server exited early: ' + logs);
    try { response = await fetch(base + '/api/health'); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(response, 'server should start and accept HTTP requests');
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);

  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Lagos Life/);

  const guide = await fetch(base + '/citygame-city-guide.js');
  assert.equal(guide.status, 200);
  assert.match(await guide.text(), /City Guide/);

  const rebuild = await fetch(base + '/rebuild.html');
  assert.equal(rebuild.status, 200);
  assert.match(await rebuild.text(), /citygame-core.js/);
  for (const asset of ['/citygame.css', '/citygame-world.js', '/citygame-core.js', '/citygame-apps.js']) {
    const assetResponse = await fetch(base + asset);
    assert.equal(assetResponse.status, 200, asset + ' should be served');
  }
  const privateAccount = await fetch(base + '/api/account');
  assert.equal(privateAccount.status, 401, 'account snapshot must require authentication');

  const registration = await fetch(base + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'account_test', password: 'A-secure-test-pass-9831', name: 'Test Player', email: 'test@example.invalid', dob: '1990-01-01', agree: true })
  });
  assert.equal(registration.status, 200);
  const credentials = await registration.json();
  const account = await fetch(base + '/api/account', { headers: { Authorization: 'Bearer ' + credentials.token } });
  assert.equal(account.status, 200);
  const snapshot = await account.json();
  assert.equal(snapshot.account.username, 'account_test');
  assert.equal(snapshot.account.displayName, 'Test Player');
  assert.equal(typeof snapshot.account.player.money, 'number');
});
