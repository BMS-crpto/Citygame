const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
function verifyGoogle(token, cb) {
  if (!GOOGLE_CLIENT_ID) return cb(null);
  let done = false; const fin = v => { if (!done) { done = true; cb(v); } };
  const rq = https.get('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(token).slice(0, 4000)), r => {
    let b = ''; r.on('data', d => b += d); r.on('end', () => { try { const j = JSON.parse(b); fin(j.aud === GOOGLE_CLIENT_ID && j.email && String(j.email_verified) === 'true' ? { email: String(j.email).toLowerCase(), name: j.given_name || j.name || 'Player' } : null); } catch (e) { fin(null); } });
  });
  rq.on('error', () => fin(null)); rq.setTimeout(5000, () => { rq.destroy(); fin(null); });
}

const PORT = process.env.PORT || 3000;
// ---- accounts: username + password (scrypt hashed), signed 30-day tokens ----
const ACC_FILE = process.env.ACC_FILE || path.join(__dirname, 'accounts.json');
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(ACC_FILE, 'utf8')); } catch (e) { accounts = {}; }
if (!accounts._secret) { accounts._secret = crypto.randomBytes(32).toString('hex'); }
function saveAccounts() { try { fs.writeFileSync(ACC_FILE + '.tmp', JSON.stringify(accounts)); fs.renameSync(ACC_FILE + '.tmp', ACC_FILE); } catch (e) { console.log('account save failed', e.message); } }
saveAccounts();
// ---- storage: JSON files by default. Render's free disk is wiped on every restart/redeploy, so for PERMANENT
// accounts set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (free Upstash Redis). Then accounts, progress
// and rented homes are kept in Upstash and survive restarts. ----
const UP_URL = process.env.UPSTASH_REDIS_REST_URL || '', UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const UP_ON = !!(UP_URL && UP_TOKEN);
let dbWritesOk = true, dbLastError = '';
function upCmd(cmd, pipeline) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(UP_URL); } catch (e) { return reject(new Error('bad UPSTASH_REDIS_REST_URL')); }
    const lib = u.protocol === 'http:' ? http : https, body = JSON.stringify(cmd);
    const rq = lib.request({ hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443), path: (u.pathname.replace(/\/$/, '') || '') + (pipeline ? '/pipeline' : '/'), method: 'POST',
      headers: { Authorization: 'Bearer ' + UP_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, r => {
      let b = ''; r.on('data', d => b += d);
      r.on('end', () => { try { const j = JSON.parse(b); if (j && j.error) reject(new Error(String(j.error))); else resolve(pipeline ? j : j.result); } catch (e) { reject(new Error('bad reply from storage (HTTP ' + r.statusCode + ')')); } });
    });
    rq.on('error', reject); rq.setTimeout(8000, () => rq.destroy(new Error('storage timeout'))); rq.end(body);
  });
}
const hashToObj = r => { if (Array.isArray(r)) { const o = {}; for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = r[i + 1]; return o; } return r && typeof r === 'object' ? r : {}; };
let dbQ = [], dbTimer = null, dbBusy = false;
function dbPut(hash, field, value) { if (!UP_ON || !dbWritesOk) return; dbQ.push([hash, String(field), String(value)]); if (!dbTimer) dbTimer = setTimeout(() => { dbTimer = null; dbFlush(); }, 400); }
async function dbFlush() {
  if (!UP_ON || !dbWritesOk || dbBusy || !dbQ.length) return; dbBusy = true;
  const batch = dbQ; dbQ = [];
  try {
    const by = {}; for (const [h, f, v] of batch) (by[h] = by[h] || {})[f] = v;   // newest value per field wins
    const cmds = [];
    for (const h in by) { const fs_ = Object.keys(by[h]); for (let i = 0; i < fs_.length; i += 40) { const c = ['HSET', h]; for (const f of fs_.slice(i, i + 40)) c.push(f, by[h][f]); cmds.push(c); } }
    const res = await upCmd(cmds, true); dbLastError = '';
    if (Array.isArray(res) && res.some(r => r && r.error)) throw new Error(res.find(r => r && r.error).error);
  } catch (e) { dbLastError = e.message; console.log('storage write failed, will retry:', e.message); dbQ = batch.concat(dbQ).slice(-5000); setTimeout(dbFlush, 3000); }
  dbBusy = false; if (dbQ.length && !dbTimer) dbTimer = setTimeout(() => { dbTimer = null; dbFlush(); }, 400);
}
const persistAccount = u => (UP_ON && dbWritesOk) ? upCmd(['HSET', 'accounts', u, JSON.stringify(accounts[u])]) : Promise.resolve();
const WEAK = ['12345678', 'password', 'password1', '123456789', 'qwertyui', '11111111', '1234567890', 'iloveyou'];
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
function makeToken(u) { const body = Buffer.from(JSON.stringify({ u, exp: Date.now() + 30 * 864e5 })).toString('base64url'); return body + '.' + crypto.createHmac('sha256', accounts._secret).update(body).digest('base64url'); }
function readToken(t) {
  try {
    const [body, sig] = String(t).split('.'); if (!body || !sig) return null;
    const want = crypto.createHmac('sha256', accounts._secret).update(body).digest('base64url');
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const j = JSON.parse(Buffer.from(body, 'base64url').toString());
    const a = accounts[j.u]; if (!a || j.exp < Date.now()) return null;
    return { acct: j.u, name: j.u };
  } catch (e) { return null; }
}
const hits = {};
function limited(ip) { const n = Date.now(); hits[ip] = (hits[ip] || []).filter(t => n - t < 60000); hits[ip].push(n); return hits[ip].length > (+process.env.AUTH_LIMIT || 12); }
function authApi(req, res) {
  const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
  if (limited(ip)) return out(429, { error: 'Too many attempts. Wait a minute.' });
  let b = ''; req.on('data', d => { b += d; if (b.length > 4000) req.destroy(); });
  req.on('end', () => {
    let m; try { m = JSON.parse(b); } catch (e) { return out(400, { error: 'Bad request' }); }
    const u = String(m.username || '').trim().toLowerCase(), pw = String(m.password || '');
    if (req.url === '/api/register') {
      if (!/^[a-z0-9_]{3,14}$/.test(u)) return out(400, { error: 'Username: 3-14 letters, numbers or _' });
      if (pw.length < 8 || WEAK.includes(pw.toLowerCase()) || pw.toLowerCase() === u) return out(400, { error: 'Password must be 8+ characters and not easy to guess' });
      const dob = new Date(m.dob); if (isNaN(dob)) return out(400, { error: 'Enter your date of birth' });
      const age = (Date.now() - dob.getTime()) / (365.25 * 864e5); if (age < 18) return out(400, { error: 'You must be 18 or older' });
      if (!m.agree) return out(400, { error: 'Please accept the terms' });
      if (m.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(m.email))) return out(400, { error: 'Email looks wrong' });
      if (accounts[u]) return out(409, { error: 'Username already taken' });
      const salt = crypto.randomBytes(16).toString('hex');
      accounts[u] = { salt, hash: hashPw(pw, salt), name: String(m.name || u).slice(0, 30), email: String(m.email || '').slice(0, 80), dob: String(m.dob), created: Date.now() };
      saveAccounts();
      persistAccount(u).then(() => out(200, { token: makeToken(u), username: u }))
        .catch(e => { console.log('could not save account', u, e.message); delete accounts[u]; saveAccounts(); out(503, { error: 'Could not save your account right now. Please try again in a moment.' }); });
      return;
    }
    const a = accounts[u];
    const ok = a && crypto.timingSafeEqual(Buffer.from(hashPw(pw, a.salt), 'hex'), Buffer.from(a.hash, 'hex'));
    if (!ok) return out(401, { error: 'Wrong username or password' });
    out(200, { token: makeToken(u), username: u });
  });
}

const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && (req.url === '/api/register' || req.url === '/api/login')) return authApi(req, res);
  if (req.url === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, storage: UP_ON ? (dbWritesOk ? 'upstash (accounts are permanent)' : 'upstash unreachable - using temporary files') : 'temporary file (accounts are WIPED when Render restarts or redeploys)', accounts: Object.keys(accounts).length - 1, lastError: dbLastError })); }
  if (req.url === '/config.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ googleClientId: GOOGLE_CLIENT_ID })); }
  let url; try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(PUB, url));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(d);
  });
});

// ---- tiny dependency-free WebSocket (text frames) ----
class Sock {
  constructor(socket) { this.socket = socket; this.readyState = 1; this.buf = Buffer.alloc(0); this.handlers = {};
    socket.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.end()); socket.on('error', () => this.end()); }
  on(e, f) { this.handlers[e] = f; }
  end() { if (this.readyState === 1) { this.readyState = 3; this.handlers.close && this.handlers.close(); } }
  send(str) {
    const p = Buffer.from(str); let h;
    if (p.length < 126) h = Buffer.from([0x81, p.length]);
    else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(p.length, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
    this.socket.write(Buffer.concat([h, p]));
  }
  parse() {
    while (this.buf.length >= 2) {
      const op = this.buf[0] & 0x0f, masked = this.buf[1] & 0x80; let len = this.buf[1] & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1e5) { this.socket.destroy(); return; }
      const total = off + (masked ? 4 : 0) + len; if (this.buf.length < total) return;
      let payload = this.buf.slice(off + (masked ? 4 : 0), total);
      if (masked) { const k = this.buf.slice(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ k[i % 4])); }
      this.buf = this.buf.slice(total);
      if (op === 1 && this.handlers.message) this.handlers.message(payload.toString());
      else if (op === 8) { this.socket.end(); this.end(); return; }
      else if (op === 9) { this.socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); }
    }
  }
}
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']; if (!key) return socket.destroy();
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  onConnection(new Sock(socket));
});

// ---- saving: progress is stored per room + player name in saves.json ----
const SAVE_FILE = process.env.SAVE_FILE || path.join(__dirname, 'saves.json');
let saves = {};
try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch (e) { saves = {}; }
let saveDirty = false;
const dirtySaves = new Set();
const saveKey = (room, p) => room + ':' + (p.acct ? 'a:' + p.acct : p.email ? 'g:' + p.email : String(p.name).toLowerCase());
function savePlayer(room, p) {
  const R = rooms[room]; if (!R || !p) return;
  const k = saveKey(room, p);
  saves[k] = { role: p.role, garage: p.garage, money: p.money, bank: p.bank, food: p.food, life: p.life, inv: p.inv, houses: [], path: p.path, look: p.look, saved: Date.now() };
  saveDirty = true; dirtySaves.add(k);
}
function flushSaves() {
  if (!saveDirty) return; saveDirty = false;
  try { fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(saves)); fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE); } catch (e) { console.log('save failed', e.message); }
  for (const k of dirtySaves) if (saves[k]) dbPut('saves', k, JSON.stringify(saves[k]));
  dirtySaves.clear();
}
// who rents which house: houseId -> { key, name, until(ms) }. Kept inside saves._tenants (file) and the 'tenants' hash (Upstash)
const tenants = saves._tenants = (saves._tenants && typeof saves._tenants === 'object') ? saves._tenants : {};
function setTenant(id, t) { tenants[id] = t; saveDirty = true; dbPut('tenants', id, JSON.stringify(t)); }
async function loadStore() {
  if (!UP_ON) { console.log('storage: FILES ONLY. On Render free this is wiped on restart. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for permanent accounts.'); return; }
  let ok = false;
  for (let i = 0; i < 5 && !ok; i++) {
    try {
      const [A, S, T] = await Promise.all(['accounts', 'saves', 'tenants'].map(h => upCmd(['HGETALL', h]).then(hashToObj)));
      for (const k in A) { if (k === '_secret') accounts._secret = A[k]; else { try { accounts[k] = JSON.parse(A[k]); } catch (e) {} } }
      if (!A._secret) await upCmd(['HSET', 'accounts', '_secret', accounts._secret]);
      for (const k in accounts) if (k !== '_secret' && !A[k]) dbPut('accounts', k, JSON.stringify(accounts[k]));   // move old file accounts into storage
      for (const k in S) { try { saves[k] = JSON.parse(S[k]); } catch (e) {} }
      for (const k in saves) if (k !== '_tenants' && !S[k]) dbPut('saves', k, JSON.stringify(saves[k]));
      for (const k in T) { try { tenants[k] = JSON.parse(T[k]); } catch (e) {} }
      for (const k in tenants) if (!T[k]) dbPut('tenants', k, JSON.stringify(tenants[k]));
      ok = true; console.log('storage: Upstash connected. accounts:', Object.keys(A).filter(k => k !== '_secret').length, 'saves:', Object.keys(S).length);
    } catch (e) { dbLastError = e.message; console.log('Upstash load failed (try ' + (i + 1) + '/5):', e.message); await new Promise(r => setTimeout(r, 2000)); }
  }
  if (!ok) { dbWritesOk = false; console.log('!! Upstash unreachable. Running on temporary files; storage writes are OFF so nothing real is overwritten.'); }
}
const rooms = {}; // code -> { players:{}, owners:{houseId:playerId} }
let nextId = 1;
const ROLES = ['citizen', 'police', 'thief', 'nurse', 'lawyer', 'taxi'];
// vehicles: nobody drives for free. col = model index used by the client
const CARS = {
  5: { name: 'Okada bike', price: 150000 }, 6: { name: 'Keke', price: 350000 },
  0: { name: 'Toyota sedan', price: 900000 }, 3: { name: 'Honda sedan', price: 1200000 },
  1: { name: 'SUV', price: 2500000 }, 4: { name: 'Family SUV', price: 3000000 },
  2: { name: 'Nissan GT-R', price: 12000000 }, 7: { name: 'Lamborghini', price: 45000000 }
};

// ---- world layout (same for every room) ----
// v0.5: blocks are 64m wide. Block (bx,bz) has its centre at bx*64+32.
const cx = b => b * 64 + 32;
const WEEK = 7 * 24 * 3600 * 1000;
const HOUSES = [];
// Lekki Estates: the original 16 villas (weekly rent)
for (const bx of [2, 3]) for (let bz = -4; bz < 4; bz++) {
  const id = HOUSES.length, x = cx(bx) + 13, z = cx(bz) - 12;
  HOUSES.push({ id, x, z, kind: 'villa', area: 'Lekki', name: 'Lekki Villa ' + (id + 1), rent: 200000, door: { x, z: z + 8.9 }, out: { x, z: z + 13 } });
}
// every other area, poor to rich: [area, kind, rent per week, blocks]
const AREAS = [
  ['Agege', 'flat', 25000, [[-6, -4], [-5, -3], [-6, -2]]],
  ['Mushin', 'flat', 30000, [[-6, 0], [-5, 1], [-6, 2]]],
  ['Yaba', 'flat', 55000, [[-3, -6], [-2, -5], [-1, -6]]],
  ['Surulere', 'flat', 60000, [[-4, 0], [-3, 1], [-4, 2]]],
  ['Ikeja', 'flat', 90000, [[-4, -3], [-3, -2], [-4, -1]]],
  ['Ajah', 'villa', 120000, [[4, 0], [5, 1], [4, 2]]],
  ['Ikoyi', 'lobby', 400000, [[4, -3], [5, -2], [4, -1]]],
  ['Victoria Island', 'lobby', 500000, [[-1, -1], [1, -1], [-2, 1]]],
  ['Eko Atlantic', 'lobby', 650000, [[0, 4], [2, 5], [3, 4]]]
];
for (const [area, kind, rent, blocks] of AREAS) blocks.forEach(([bx, bz], i) => {
  const id = HOUSES.length, X = cx(bx), Z = cx(bz), nm = area + ' ' + (kind === 'flat' ? 'Flat' : kind === 'villa' ? 'Villa' : 'Penthouse') + ' ' + (i + 1);
  if (kind === 'flat') { const x = X + 13, z = Z + 12; HOUSES.push({ id, x, z, kind, area, name: nm, rent, door: { x, z: z + 5.6 }, out: { x, z: z + 8.8 } }); }
  else if (kind === 'villa') { const x = X + 13, z = Z + 12; HOUSES.push({ id, x, z, kind, area, name: nm, rent, door: { x, z: z + 8.9 }, out: { x, z: z + 12 } }); }
  else { const x = X, z = Z + 21.6; HOUSES.push({ id, x, z, kind, area, name: nm, rent, door: { x, z }, out: { x, z: z + 2.4 } }); }
});
HOUSES.forEach(h => { h.price = h.rent; h.units = h.kind === 'flat' ? 20 : h.kind === 'lobby' ? 6 : 1; });
// every home you can live in is a UNIT. Several units share one building door, each unit has its own room inside
const UNITS = [];
HOUSES.forEach(h => { h.first = UNITS.length; for (let k = 0; k < h.units; k++) UNITS.push({ id: UNITS.length, house: h.id, k }); });
const SHOPS = [[-4,-3],[-3,-2],[-4,2],[-3,3]].map(([bx,bz],i) => ({ id: i, x: cx(bx)+13, z: cx(bz)-12 }));
const JAIL = { x: -405, z: 405 };
// places you can walk into. Their insides are built far away from the city (x = 1000).
const BANK_DOOR = { x: 32, z: 43 }, BANK_OUT = { x: 32, z: 47 };
const MALL_DOOR = { x: 32, z: 174.5 }, MALL_OUT = { x: 32, z: 179 };
const ROOM = { bank: { x: 1000, z: 0, hd: 11 }, mall: { x: 1000, z: 200, hd: 16 } };
const houseRoom = id => ({ x: 1000, z: 400 + id * 40, hd: 9 });
const ATM = { x: 989, z: 0 }, VAULT = { x: 1009.5, z: -9.5 }, MALLCASH = { x: 1000, z: 187.5 };
const FOODC = { x: 1019, z: 192 };               // food counter inside the Grand Market
// named places on the city map (all on the road, so nobody lands inside a wall)
const PLACES = [
  { id: 'bank', name: 'Lagoon Bank', icon: '🏦', x: 32, z: 48 },
  { id: 'mall', name: 'Grand Market Hall', icon: '🛒', x: 32, z: 180 },
  { id: 'vi', name: 'Victoria Island', icon: '🏙️', x: 0, z: -40 },
  { id: 'lekki', name: 'Lekki Estates', icon: '🏡', x: 128, z: 40 },
  { id: 'ikeja', name: 'Ikeja Offices', icon: '🏢', x: -192, z: -120 },
  { id: 'surulere', name: 'Surulere', icon: '🏘️', x: -192, z: 120 },
  { id: 'market', name: 'Mainland Market', icon: '🧺', x: 64, z: -200 },
  { id: 'ajah', name: 'Ajah', icon: '🏘️', x: 320, z: 128 }, { id: 'ikoyi', name: 'Ikoyi', icon: '🏛️', x: 320, z: -128 },
  { id: 'agege', name: 'Agege', icon: '🏚️', x: -320, z: -128 }, { id: 'mushin', name: 'Mushin', icon: '🏘️', x: -320, z: 128 },
  { id: 'yaba', name: 'Yaba', icon: '🎓', x: -128, z: -320 }, { id: 'oshodi', name: 'Oshodi', icon: '🚌', x: 128, z: -320 },
  { id: 'maryland', name: 'Maryland', icon: '🛍️', x: -64, z: 320 }, { id: 'eko', name: 'Eko Atlantic', icon: '🌆', x: 192, z: 320 },
  { id: 'airport', name: 'Lagos Airport', icon: '✈️', x: -192, z: 300 }, { id: 'jail', name: 'City Jail', icon: '⛓️', x: -398, z: 398 }
];
const RIDES = { keke: { name: 'Keke', rate: 0.15, min: 30, speed: 28 }, danfo: { name: 'Danfo', rate: 0.07, min: 20, speed: 20 }, okada: { name: 'Okada', rate: 0.28, min: 60, speed: 42 }, jet: { name: 'Private Jet', rate: 0.2, min: 350, speed: 110 } };
const MAXLOOK = [4, 4, 7, 4, 1, 5];   // skin, hair style, top, trousers, body (0 man / 1 woman), hair colour
// people you can talk to. place: null = outside in the city, otherwise the room they stand in
const NPCS = [
  { id: 'cashier', name: 'Auntie Chioma', title: 'Cashier', place: 'mall', x: 997.5, z: 186.1, ry: 0, look: [1, 0, 5, 3, 1, 0] },
  { id: 'mamaput', name: 'Mama Put', title: 'Food seller', place: 'mall', x: 1021.3, z: 192, ry: -Math.PI / 2, look: [2, 4, 3, 2, 1, 0] },
  { id: 'mallguard', name: 'Oga Musa', title: 'Security', place: 'mall', x: 1004.5, z: 212.6, ry: Math.PI, look: [4, 3, 7, 1, 0, 0] },
  { id: 'teller', name: 'Mr Segun', title: 'Bank teller', place: 'bank', x: 1003, z: -8.0, ry: 0, look: [1, 0, 4, 1, 0, 0] },
  { id: 'bankguard', name: 'Danladi', title: 'Bank security', place: 'bank', x: 991.5, z: 7.2, ry: 0.5, look: [3, 3, 7, 1, 0, 0] },
  { id: 'agent', name: 'Agent Kemi', title: 'Rent agent', place: null, x: 10, z: 12, ry: -2.5, look: [1, 0, 1, 3, 1, 1] }
];
const WORLD = { houses: HOUSES, shops: SHOPS, jail: JAIL, bankDoor: BANK_DOOR, mallDoor: MALL_DOOR, places: PLACES, rides: RIDES,
  npcs: NPCS.map(n => ({ id: n.id, name: n.name, title: n.title, place: n.place, x: n.x, z: n.z, ry: n.ry, look: n.look })) };
function newJob(p) {
  const shop = SHOPS[Math.floor(Math.random() * SHOPS.length)];
  const h = Math.random() < 0.5 ? HOUSES[Math.floor(Math.random() * HOUSES.length)] : null;
  const dl = PLACES.filter(q => q.id !== 'jail'), pl = dl[Math.floor(Math.random() * dl.length)];
  const pu = { x: shop.x, z: shop.z + 9 };
  const dr = h ? { x: h.door.x, z: h.door.z, name: 'House #' + (h.id + 1) } : { x: pl.x, z: pl.z, name: pl.name };
  p.job = { stage: 'pickup', pu, dr, pay: 120 + Math.round(dist(pu, dr) * 0.5), until: Date.now() + 360000 };
}
function jobInfo(p) {
  if (!p.job) return null;
  const j = p.job, tg = j.stage === 'pickup' ? j.pu : j.dr;
  return { stage: j.stage, x: tg.x, z: tg.z, pay: j.pay, label: j.stage === 'pickup' ? 'Pick up the package at the shop' : 'Deliver the package to ' + j.dr.name, left: Math.max(0, Math.round((j.until - Date.now()) / 1000)) };
}
function placeInfo(place) {
  if (place === 'bank') return { door: BANK_DOOR, out: BANK_OUT, room: ROOM.bank };
  if (place === 'mall') return { door: MALL_DOOR, out: MALL_OUT, room: ROOM.mall };
  const m = /^house(\d+)$/.exec(place || ''); const u = m && UNITS[+m[1]], h = u && HOUSES[u.house];
  return h ? { door: h.door, out: h.out, room: houseRoom(u.id), house: h, unit: u.id } : null;
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg) { Object.values(rooms[room].players).forEach(p => send(p.ws, msg)); }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function nearest(room, me, filter, maxd) {
  let best = null, bd = maxd;
  for (const p of Object.values(rooms[room].players)) {
    if (p.id === me.id || !filter(p)) continue;
    const d = dist(p, me); if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function jail(room, p, ms) {
  p.jailUntil = Date.now() + ms;
  p.x = JAIL.x + (Math.random() - 0.5) * 6; p.z = JAIL.z + (Math.random() - 0.5) * 6; p.car = -1; p.inside = null;
  send(p.ws, { t: 'tp', x: p.x, z: p.z });
}
// friends who rob together: other thieves standing near the robber get 30% of the loot
function crew(room, p, gain) {
  const cut = Math.floor(gain * 0.3); if (cut <= 0) return;
  for (const q of Object.values(rooms[room].players)) {
    if (q === p || q.role !== 'thief' || q.inside !== p.inside || q.jailUntil > Date.now() || dist(q, p) > 18) continue;
    q.money += cut; send(q.ws, { t: 'toast', text: `🦹 Crew cut from ${p.name}: +₦${cut}` });
  }
}
function cooldown(p, key, ms) { const n = Date.now(); if ((p.cd[key] || 0) > n) return false; p.cd[key] = n + ms; return true; }

function onConnection(ws) {
  let id = null, room = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') { const go = (gu) => {
      room = 'CITY1'; // one shared world for every player
      const role = 'citizen'; // the path (good or bad job) is chosen inside the game
      id = nextId++;
      rooms[room] = rooms[room] || { players: {}, owners: {}, paint: {} };
      rooms[room].players[id] = {
        ws, id, name: String(m.name || 'Player').slice(0, 14), role, money: 500, bank: 0, inside: null, food: 100, job: null, travelUntil: 0, dest: null, look: (Array.isArray(m.look) ? m.look : []).slice(0, 6).concat([0,0,0,0,0,0]).slice(0, 6).map((v, i) => Math.max(0, Math.min(MAXLOOK[i], Math.floor(+v) || 0))), car: -1, garage: [], jailUntil: 0, cd: {},
        x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8, ry: 0, moving: false
      };
      const np = rooms[room].players[id]; if (gu) { np.email = gu.email; np.acct = gu.acct; if (gu.acct) np.name = gu.acct; else if (!m.name) np.name = String(gu.name).slice(0, 14); }
      const sv = saves[saveKey(room, np)];
      if (sv) {
        np.money = Math.max(0, Math.floor(+sv.money) || 0); np.bank = Math.max(0, Math.floor(+sv.bank) || 0); np.food = Math.max(0, Math.min(100, +sv.food || 100));
      }
      if (sv && ROLES.includes(sv.role)) np.role = sv.role;
      np.garage = (sv && Array.isArray(sv.garage) ? sv.garage : []).filter(c => CARS[c]);
      // life path: the system decides once, then it is saved with the player
      const first = !sv || !sv.path;
      np.path = (sv && PATHS[sv.path]) ? sv.path : (Math.random() < 0.5 ? 'nepo' : 'lapo');
      if (first) {
        np.money += START[np.path];
        const key = pKey(np);
        if (!myUnit(np)) {   // a starter flat comes with every new player: first week already paid
          const sh = HOUSES.find(h => h.area === 'Agege' && freeUnit(h)) || HOUSES.find(h => h.kind === 'flat' && freeUnit(h));
          if (sh) { const fu = freeUnit(sh); setTenant(fu.id, { key, name: np.name, until: Date.now() + WEEK }); np.starter = { name: unitName(sh, fu), area: sh.area, rent: sh.rent }; }
        }
      }
      np.life = newLife(); if (sv && sv.life) restoreLife(np.life, sv.life); restoreInv(np, sv && sv.inv);
      send(ws, { t: 'welcome', id, room, world: WORLD, path: np.path, role: np.role, garage: np.garage, cars: CARS, first, pathInfo: PATHS[np.path], start: START[np.path], starter: np.starter || null, home: homeInfo(np) });
      if (sv && !first) send(ws, { t: 'toast', text: '💾 Welcome back! Progress restored' });
      send(ws, { t: 'catalog', items: Object.entries(ITEMS).map(([id, i]) => ({ id, name: i.name, icon: i.icon, cat: i.cat, price: i.price, desc: i.desc })) });
      sendLife(np, rooms[room]);
      broadcast(room, { t: 'toast', text: `${rooms[room].players[id].name} joined Lagos` });
      }; if (m.token) { const a = readToken(m.token); if (!a) return send(ws, { t: 'authfail' }); go(a); } else if (m.idToken) verifyGoogle(m.idToken, go); else go(null); return;
    }
    if (!room || !rooms[room] || !rooms[room].players[id]) return;
    const p = rooms[room].players[id], R = rooms[room];
    const now = Date.now();
    if (p.travelUntil > now && m.t !== 'chat') return;
    if (m.t === 'move') {
      if (p.jailUntil > now) return;
      p.x = +m.x || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.moving = !!m.moving;
      p.car = Number.isInteger(m.car) && p.garage.includes(m.car) ? m.car : -1;
      if (p.job && !p.inside) {
        const j = p.job;
        if (now > j.until) { p.job = null; send(ws, { t: 'job', job: null }); send(ws, { t: 'toast', text: '📦 Delivery job expired' }); }
        else if (dist(p, j.stage === 'pickup' ? j.pu : j.dr) < 6) {
          if (j.stage === 'pickup') { j.stage = 'drop'; send(ws, { t: 'toast', text: '📦 Package picked up! Now deliver it' }); send(ws, { t: 'job', job: jobInfo(p) }); }
          else { addMoney(p, j.pay, 'Delivery job'); send(ws, { t: 'toast', text: `📦 Delivered! +₦${j.pay}` }); p.job = null; send(ws, { t: 'job', job: null }); }
        }
      }
    } else if (m.t === 'chat') {
      broadcast(room, { t: 'chat', name: p.name, text: String(m.text || '').slice(0, 80) });
    } else if (m.t === 'buycar') {
      const c = CARS[m.col];
      if (!c) return;
      if (p.garage.includes(+m.col)) return send(ws, { t: 'toast', text: 'You already own this one' });
      if (!charge(p, c.price, 'Bought ' + c.name)) return;
      p.garage.push(+m.col); savePlayer(room, p);
      send(ws, { t: 'garage', garage: p.garage, bought: +m.col });
      send(ws, { t: 'toast', text: `🔑 You bought a ${c.name}!` }); sendLife(p, R);
    } else if (m.t === 'role') {
      if (!ROLES.includes(m.role)) return;
      if (p.jailUntil > now) return send(ws, { t: 'toast', text: 'You are in jail!' });
      if (p.role === m.role) return;
      if (!cooldown(p, 'role', 20000)) return send(ws, { t: 'toast', text: 'Wait a few seconds before changing path' });
      p.role = m.role; savePlayer(room, p);
      send(ws, { t: 'rolenow', role: p.role });
      broadcast(room, { t: 'toast', text: ({ citizen: '🙂 ' + p.name + ' is a normal citizen now', police: '🚔 ' + p.name + ' joined the police', thief: '🦹 ' + p.name + ' went to the dark side', nurse: '💉 ' + p.name + ' became a nurse', lawyer: '⚖️ ' + p.name + ' became a lawyer', taxi: '🚕 ' + p.name + ' became a taxi driver' })[p.role] });
    } else if (m.t === 'rent' || m.t === 'buy') {
      if (p.jailUntil > now) return send(ws, { t: 'toast', text: 'You are in jail!' });
      const curU = myUnit(p), cur = curU && HOUSES[curU.house];
      if (m.op === 'renew') {
        if (!curU) return send(ws, { t: 'toast', text: 'You have no home yet. Walk to a house door to rent one' });
        return payRent(room, p, cur, curU, true);
      }
      if (p.inside) return;
      let h = null, bd = 9; for (const q of HOUSES) { const d = dist(q.door, p); if (d < bd) { bd = d; h = q; } }
      if (!h) return send(ws, { t: 'toast', text: 'No house nearby' });
      if (curU && curU.house === h.id) return payRent(room, p, h, curU, true);
      const fu = freeUnit(h);
      if (!fu) return send(ws, { t: 'toast', text: h.units === 1 ? `🔒 ${h.name} is rented by ${activeTenant(h.first).name}` : `🔒 ${h.name} is fully rented. Try another building` });
      if (curU && !(p.moveOk && p.moveOk.id === h.id && p.moveOk.until > now)) {
        p.moveOk = { id: h.id, until: now + 8000 };
        return send(ws, { t: 'toast', text: `⚠️ You already rent ${unitName(cur, curU)}. Tap RENT again to move here (your old home is lost, no refund)` });
      }
      payRent(room, p, h, fu, false);
    } else if (m.t === 'travel') {
      if (p.jailUntil > now) return send(ws, { t: 'toast', text: 'You are in jail!' });
      if (p.inside) return send(ws, { t: 'toast', text: 'Go outside first' });
      let dest;
      if (m.place === 'home') { const h = myHouse(p); if (!h) return send(ws, { t: 'toast', text: 'You do not own a house yet' }); dest = { x: h.out.x, z: h.out.z, name: 'Home' }; }
      else dest = PLACES.find(q => q.id === m.place);
      const ride = RIDES[m.ride];
      if (!dest || !ride) return;
      const AIRP = PLACES.find(q => q.id === 'airport');
      if (m.ride === 'jet' && !(dist(p, AIRP) < 60 || dest.id === 'airport')) return send(ws, { t: 'toast', text: '✈️ Jets only fly to or from Lagos Airport' });
      const d = dist(p, dest);
      if (d < 25) return send(ws, { t: 'toast', text: 'You are already there' });
      const fare = Math.max(ride.min, Math.round(d * ride.rate));
      if (!charge(p, fare, ride.name + ' ride')) return;
      p.car = -1;
      const secs = Math.max(3, Math.min(25, Math.round(d / ride.speed)));
      p.travelUntil = now + secs * 1000; p.dest = { x: dest.x, z: dest.z };
      send(ws, { t: 'ride', ride: ride.name, secs, to: dest.name });
    } else if (m.t === 'job') {
      if (p.jailUntil > now) return;
      if (m.op === 'cancel') { p.job = null; send(ws, { t: 'job', job: null }); return send(ws, { t: 'toast', text: 'Job cancelled' }); }
      if (p.job) return send(ws, { t: 'toast', text: 'Finish your current job first' });
      newJob(p); send(ws, { t: 'job', job: jobInfo(p) }); send(ws, { t: 'toast', text: '📦 Delivery job started! Follow the yellow marker' });
    } else if (m.t === 'eat') {
      const hm = /^house(\d+)$/.exec(p.inside || '');
      if (p.inside === 'mall' && dist(p, FOODC) < 6) {
        if (!charge(p, 40, 'Mama Put food')) return;
        p.food = 100; send(ws, { t: 'toast', text: '🍲 Yummy! You are full again' });
      } else if (hm && ownsHouse(p, +hm[1]) && dist(p, { x: houseRoom(+hm[1]).x - 10.2, z: houseRoom(+hm[1]).z - 0.5 }) < 5) {
        if (!cooldown(p, 'fridge', 60000)) return send(ws, { t: 'toast', text: 'The fridge is empty, wait a bit' });
        p.food = 100; send(ws, { t: 'toast', text: '🍳 You ate at home (free!)' });
      } else send(ws, { t: 'toast', text: 'Go to a food counter or your fridge' });
    } else if (m.t === 'enter') {
      if (p.jailUntil > now || p.inside) return;
      const info = placeInfo(m.place);
      if (!info || dist(info.door, p) > 7) return send(ws, { t: 'toast', text: 'Walk up to the door first' });
      if (info.house && !ownsHouse(p, info.unit)) return send(ws, { t: 'toast', text: 'Only the tenant can go inside' });
      p.inside = m.place; p.car = -1; p.x = info.room.x; p.z = info.room.z + info.room.hd - 4;
      send(ws, { t: 'int', place: p.inside, x: p.x, z: p.z });
    } else if (m.t === 'exit') {
      if (!p.inside) return;
      const info = placeInfo(p.inside); p.inside = null;
      if (info) { p.x = info.out.x; p.z = info.out.z; send(ws, { t: 'tp', x: p.x, z: p.z }); }
    } else if (m.t === 'bank') {
      if (p.inside !== 'bank' || dist(p, ATM) > 7) return send(ws, { t: 'toast', text: 'Use an ATM inside the bank' });
      const a = m.amt === 'all' ? (m.op === 'dep' ? p.money : p.bank) : Math.floor(+m.amt);
      if (!(a > 0) || a > 1e9) return send(ws, { t: 'toast', text: 'Pick an amount' });
      if (m.op === 'dep') {
        if (a > p.money) return send(ws, { t: 'toast', text: 'Not enough cash on you' });
        p.money -= a; p.bank += a; send(ws, { t: 'toast', text: `🏦 Saved ₦${a} (thieves cannot take it)` });
      } else if (m.op === 'wd') {
        if (a > p.bank) return send(ws, { t: 'toast', text: 'Not enough in your account' });
        p.bank -= a; p.money += a; send(ws, { t: 'toast', text: `🏦 Took out ₦${a}` });
      }
    } else if (m.t === 'paint') {
      const mm = /^house(\d+)$/.exec(p.inside || ''); if (!mm) return;
      const id = +mm[1], pot = { x: houseRoom(id).x + 8.5, z: houseRoom(id).z + 5 };
      if (!ownsHouse(p, id)) return;
      if (dist(p, pot) > 6) return send(ws, { t: 'toast', text: 'Go to the paint pot' });
      if (!charge(p, 300, 'Repaint walls')) return;
      R.paint[id] = ((R.paint[id] || 0) + 1) % 6; send(ws, { t: 'toast', text: '🎨 Walls repainted!' });
    } else if (m.t === 'npc') {
      const n = NPCS.find(x => x.id === m.id); if (!n) return;
      if ((n.place || null) !== (p.inside || null) || dist(n, p) > 7) return send(ws, { t: 'toast', text: 'Walk closer to talk' });
      if (!cooldown(p, 'npc', 1200)) return;
      send(ws, { t: 'npcsay', id: n.id, name: n.name, title: n.title, text: npcLine(p, n) });
    } else if (m.t === 'speak') {
      if (p.jailUntil > now) return send(ws, { t: 'toast', text: 'No loudspeaker in jail 😅' });
      const text = String(m.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 100); if (!text) return;
      if (!cooldown(p, 'speak', 20000)) return send(ws, { t: 'toast', text: '📢 Wait a few seconds before using the loudspeaker again' });
      if (!charge(p, 200, 'Loudspeaker')) { p.cd.speak = 0; return; }
      broadcast(room, { t: 'speaker', name: p.name, path: p.path, text });
    } else if (m.t === 'shop') {
      shopOp(room, p, m);
    } else if (m.t === 'life') {
      lifeOp(room, p, m);
    } else if (m.t === 'action') {
      if (p.jailUntil > now) return send(ws, { t: 'toast', text: 'You are in jail!' });
      const say = text => broadcast(room, { t: 'toast', text });
      const me = text => send(ws, { t: 'toast', text });
      const free = q => q.jailUntil <= now && !(q.travelUntil > now);
      if (p.role === 'citizen') {
        return me('Open your phone → Jobs to pick a path: police, nurse, lawyer, taxi... or the dark side');
      } else if (p.role === 'police') {
        const t = nearest(room, p, q => q.role === 'thief' && free(q), 10);
        if (!t) return me('No thief close enough');
        const take = Math.floor(t.money * 0.25); t.money -= take; p.money += take + 200;
        jail(room, t, 15000); say(`🚔 ${p.name} arrested ${t.name}! (+₦${take + 200})`);
      } else if (p.role === 'thief') {
        if (p.inside === 'bank' && dist(p, VAULT) < 7) {
          if (!cooldown(p, 'vault', 60000)) return me('The vault is empty for now, wait...');
          p.money += 1200; crew(room, p, 1200); return say(`🚨 ${p.name} robbed the BANK VAULT! (+₦1200)`);
        }
        if (p.inside === 'mall' && dist(p, MALLCASH) < 8) {
          if (!cooldown(p, 'shop', 20000)) return me('Cashier was just robbed, wait...');
          p.money += 400; crew(room, p, 400); return say(`💰 ${p.name} robbed the Grand Market cashier! (+₦400)`);
        }
        const shop = !p.inside && SHOPS.find(s => dist(s, p) < 11);
        if (shop) {
          if (!cooldown(p, 'shop', 20000)) return me('Shop was just robbed, wait...');
          p.money += 400; crew(room, p, 400); say(`💰 ${p.name} robbed a shop! (+₦400)`);
        } else {
          const v = nearest(room, p, q => free(q) && q.money >= 50, 7);
          if (!v) return me('Go near a shop or a player to rob');
          if (!cooldown(p, 'rob', 8000)) return me('Wait a few seconds...');
          const loot = Math.min(500, Math.floor(v.money * 0.15)); v.money -= loot; p.money += loot; crew(room, p, loot);
          say(`💰 ${p.name} robbed ${v.name} of ₦${loot}!`);
        }
      } else if (p.role === 'nurse') {
        const t = nearest(room, p, free, 7);
        if (!t) return me('No patient nearby');
        if (!cooldown(p, 'heal', 5000)) return me('Wait a few seconds...');
        p.money += 150; say(`💉 ${p.name} healed ${t.name} (+₦150)`);
      } else if (p.role === 'lawyer') {
        const t = nearest(room, p, q => !free(q), 12);
        if (!t) return me('No one in jail nearby. Walk to the jail!');
        const fee = Math.min(100, t.money); t.money -= fee; p.money += 300 + fee; t.jailUntil = 0;
        t.x = 0; t.z = 8; t.inside = null; send(t.ws, { t: 'tp', x: 0, z: 8 });
        say(`⚖️ ${p.name} freed ${t.name} from jail! (+₦${300 + fee})`);
      } else if (p.role === 'taxi') {
        const t = nearest(room, p, q => free(q) && q.car < 0, 6);
        if (!t) return me('No passenger nearby');
        if (!cooldown(p, 'taxi', 8000)) return me('Wait a few seconds...');
        p.money += 100; say(`🚕 ${p.name} picked up ${t.name} (+₦100)`);
      }
    }
  });
  ws.on('close', () => {
    if (room && rooms[room]) {
      const p = rooms[room].players[id];
      savePlayer(room, p); flushSaves();
      delete rooms[room].players[id];
      if (p) broadcast(room, { t: 'toast', text: `${p.name} left` });
      if (!Object.keys(rooms[room].players).length) delete rooms[room];
    }
  });
}

setInterval(() => {
  const now = Date.now();
  for (const code in rooms) {
    const R = rooms[code];
    for (const p of Object.values(R.players)) {
      if (p.jailUntil && p.jailUntil <= now) { p.jailUntil = 0; p.x = 0; p.z = 8; p.inside = null; send(p.ws, { t: 'tp', x: 0, z: 8 }); send(p.ws, { t: 'toast', text: 'You are free!' }); }
    }
    for (const p of Object.values(R.players)) {
      if (p.travelUntil && p.travelUntil <= now) { p.travelUntil = 0; p.x = p.dest.x + (Math.random() - 0.5) * 3; p.z = p.dest.z + (Math.random() - 0.5) * 3; send(p.ws, { t: 'tp', x: p.x, z: p.z }); send(p.ws, { t: 'toast', text: '🛺 You have arrived' }); }
    }
    const owners = {}, occ = {};
    for (const id in tenants) { const t = activeTenant(id), u = UNITS[+id]; if (!t || !u) continue; const h = HOUSES[u.house]; occ[h.id] = (occ[h.id] || 0) + 1; if (h.units === 1) owners[h.id] = t.name; }
    const list = Object.values(R.players).map(p => ({
      id: p.id, name: p.name, role: p.role, x: p.x, z: p.z, ry: p.ry, moving: p.moving,
      car: p.car, money: p.money, bank: p.bank, food: p.food, look: p.look, hidden: p.travelUntil > now, jailed: p.jailUntil > now
    }));
    broadcast(code, { t: 'state', players: list, owners, occ, paint: R.paint });
  }
}, 66);

// ================= LIFE SIM: needs, careers, missions, money history =================
const WORK_CD = process.env.WORK_CD_MS !== undefined ? +process.env.WORK_CD_MS : 30000;
const C = (title, a, b, c) => ({ title, lv: [[a[0], a[1], 0], [b[0], b[1], 5], [c[0], c[1], 15]] });
const CAREERS = {
  mechanic: C('Mechanic', ['Apprentice', 150], ['Technician', 320], ['Master Mechanic', 650]),
  chef: C('Chef', ['Kitchen Hand', 140], ['Line Cook', 300], ['Head Chef', 620]),
  teacher: C('Teacher', ['Assistant Teacher', 160], ['Teacher', 330], ['Head Teacher', 640]),
  developer: C('Software Developer', ['Junior Dev', 200], ['Mid Dev', 420], ['Senior Dev', 850]),
  guard: C('Security Guard', ['Night Watch', 130], ['Guard', 280], ['Security Chief', 560]),
  shopkeeper: C('Shopkeeper', ['Sales Assistant', 140], ['Shop Manager', 310], ['Business Owner', 700]),
  driver: C('Driver', ['Delivery Driver', 150], ['Bus Driver', 300], ['Fleet Manager', 600])
};
const MISSIONS = [
  { id: 'buy1', name: 'Buy your first item', reward: 200, ok: p => p.life.bought > 0 },
  { id: 'tool', name: 'Own a work tool', reward: 800, ok: p => Object.keys(p.inv).some(id => ITEMS[id] && ITEMS[id].cat === 'tool') },
  { id: 'job', name: 'Get a career', reward: 300, ok: p => !!p.life.career || p.life.shifts > 0 },
  { id: 'shift3', name: 'Complete 3 shifts', reward: 600, ok: p => p.life.shifts >= 3 },
  { id: 'save5k', name: 'Save ₦5,000 in the bank', reward: 1000, ok: p => p.bank >= 5000 },
  { id: 'house', name: 'Rent a villa or penthouse (₦200,000+/week)', reward: 20000, ok: p => { const h = myHouse(p); return !!h && h.rent >= 200000; } },
  { id: 'empire', path: 'nepo', name: 'Grow the inheritance into ₦5,000,000', reward: 250000, ok: p => p.money + p.bank >= 5000000 },
  { id: 'ownname', path: 'lapo', name: 'Earn ₦300,000 from your own shifts and jobs', reward: 100000, ok: p => (p.life.earned || 0) >= 300000 },
  { id: 'promo', name: 'Get promoted', reward: 2000, ok: p => !!p.life.promoted },
  { id: 'rich', name: 'Hold ₦25,000 in total', reward: 5000, ok: p => p.money + p.bank >= 25000 }
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const newLife = () => ({ earned: 0, energy: 100, hygiene: 100, fun: 100, career: null, shifts: 0, bought: 0, promoted: false, done: {} });
function restoreLife(L, s) {
  L.energy = clamp(+s.energy || 0, 0, 100); L.hygiene = clamp(+s.hygiene || 0, 0, 100); L.fun = clamp(+s.fun || 0, 0, 100);
  if (s.career && CAREERS[s.career.id]) L.career = { id: s.career.id, xp: Math.max(0, Math.floor(+s.career.xp) || 0) };
  L.earned = Math.max(0, Math.floor(+s.earned) || 0); L.shifts = Math.max(0, Math.floor(+s.shifts) || 0); L.bought = Math.max(0, Math.floor(+s.bought) || 0); L.promoted = !!s.promoted; L.done = s.done && typeof s.done === 'object' ? s.done : {};
}
const levelOf = c => (c.xp >= 15 ? 2 : c.xp >= 5 ? 1 : 0);
function syncLedger(p) {
  if (p._m === undefined) p._m = p.money;
  if (p.money !== p._m) { (p.ledger = p.ledger || []).push({ d: p._why || 'Activity', amt: p.money - p._m, bal: p.money, at: Date.now() }); if (p.ledger.length > 30) p.ledger.shift(); p._m = p.money; p._why = null; }
}
function addMoney(p, amt, why) { syncLedger(p); p.money += amt; if (amt > 0 && p.life && /shift|delivery/i.test(why || '')) p.life.earned = (p.life.earned || 0) + amt; (p.ledger = p.ledger || []).push({ d: why, amt, bal: p.money, at: Date.now() }); if (p.ledger.length > 30) p.ledger.shift(); p._m = p.money; }
function checkMissions(p, R) {
  for (const x of MISSIONS) if ((!x.path || x.path === p.path) && !p.life.done[x.id] && x.ok(p, R)) {
    p.life.done[x.id] = true; addMoney(p, x.reward, 'Mission: ' + x.name);
    send(p.ws, { t: 'toast', text: `🏆 Mission complete: ${x.name} (+₦${x.reward})` });
  }
}
// ================= LIFE PATHS, DADDY'S MONEY, RENT, NPCS =================
const START = { nepo: 1000000, lapo: 100000 };      // starting cash
const DADDY = 0.6;                                    // Lapo babes: daddy pays 60% of every cost
const PATHS = {
  nepo: { name: 'Nepo baby', emoji: '👑', goal: 'Mummy and Daddy left you ₦1,000,000. Turn it into an empire: grow your wealth to ₦5,000,000 and make your own name in Lagos.' },
  lapo: { name: 'Lapo babe', emoji: '💖', goal: 'Born into a rich family. Daddy pays 60% of every bill you have: rent, food, rides and shopping. Live the soft life, then prove yourself: earn ₦300,000 from your own hustle.' }
};
const pKey = p => saveKey('CITY1', p);
const activeTenant = id => { const t = tenants[id]; return t && t.until > Date.now() ? t : null; };
function myUnit(p) { const k = pKey(p), now = Date.now(); for (const id in tenants) { const t = tenants[id]; if (t && t.key === k && t.until > now && UNITS[+id]) return UNITS[+id]; } return null; }
function myHouse(p) { const u = myUnit(p); return u ? HOUSES[u.house] : null; }
const ownsHouse = (p, unit) => { const t = activeTenant(+unit); return !!t && t.key === pKey(p); };
const freeUnit = h => { for (let k = 0; k < h.units; k++) if (!activeTenant(h.first + k)) return UNITS[h.first + k]; return null; };
const unitName = (h, u) => h.units > 1 ? `${h.name} · Unit ${u.k + 1}` : h.name;
const fmtN = n => '₦' + Math.round(n).toLocaleString('en-NG');
const fmtDate = ms => new Date(ms).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
function homeInfo(p) { const u = myUnit(p); if (!u) return null; const h = HOUSES[u.house]; return { unit: u.id, id: h.id, name: unitName(h, u), area: h.area, rent: h.rent, until: tenants[u.id].until }; }
function share(p, cost) { if (p.path !== 'lapo') return { mine: cost, daddy: 0 }; const daddy = Math.floor(cost * DADDY); return { mine: cost - daddy, daddy }; }
// pay a cost with cash. Lapo babes only pay 40%
function charge(p, cost, why) {
  const { mine, daddy } = share(p, cost);
  if (p.money < mine) { send(p.ws, { t: 'toast', text: `Need ${fmtN(mine)}${daddy ? ' (Daddy pays ' + fmtN(daddy) + ')' : ''}` }); return false; }
  addMoney(p, -mine, why + (daddy ? ` (Daddy paid ${fmtN(daddy)})` : ''));
  if (daddy) send(p.ws, { t: 'toast', text: `💖 Daddy paid ${fmtN(daddy)} (60%)` });
  return true;
}
function payRent(room, p, h, u, renew) {
  const now = Date.now(), t = tenants[u.id], base = renew && t && t.until > now ? t.until : now, nm = unitName(h, u);
  if (base + WEEK - now > 4 * WEEK) return send(p.ws, { t: 'toast', text: '🏠 Your rent is already paid far ahead (4 weeks max)' });
  const { mine, daddy } = share(p, h.rent);
  if (p.money + p.bank < mine) return send(p.ws, { t: 'toast', text: `🏠 ${nm}: rent is ${fmtN(h.rent)}/week. You need ${fmtN(mine)}${daddy ? ' (Daddy pays ' + fmtN(daddy) + ')' : ''}` });
  const fromCash = Math.min(p.money, mine);
  addMoney(p, -fromCash, 'Rent: ' + nm + (daddy ? ` (Daddy paid ${fmtN(daddy)})` : '')); p.bank -= mine - fromCash;
  const old = myUnit(p); if (old && old.id !== u.id) setTenant(old.id, { key: '', name: '', until: 0 });
  const until = base + WEEK; setTenant(u.id, { key: pKey(p), name: p.name, until });
  p._warn = 0; p._homeId = u.id;
  send(p.ws, { t: 'toast', text: `🏠 ${nm} is yours until ${fmtDate(until)} (${fmtN(h.rent)}/week)` });
  if (daddy) send(p.ws, { t: 'toast', text: `💖 Daddy paid ${fmtN(daddy)} of the rent` });
  if (!renew) broadcast(room, { t: 'toast', text: `🏠 ${p.name} moved into ${h.area}` });
  sendLife(p, rooms[room]);
}
const LINES = {
  cashier: ['Welcome to Grand Market! Open your 📱 phone and tap Shop to buy things.', 'Pure water, suya, soap, tools... we get am all!', 'No credit o! Cash only, my dear.', 'Thieves dey this city. Put your cash inside the bank!'],
  mamaput: ['Jollof and chicken, hot hot! Press ACTION at the counter to eat for ₦40.', 'Hungry? Sit down and chop, my pikin.', 'Amala today? Tomorrow, I go cook ewedu!'],
  mallguard: ['Good day, oga. No wahala inside this market.', 'Thieves must not enter here! 👀', 'You see anything suspicious? Tell me.'],
  bankguard: ['Welcome to Lagoon Bank. ATMs are on the left wall.', 'Keep your money safe, na so e dey go.', 'No be me you go rob o!'],
  agent: []
};
function npcLine(p, n) {
  if (n.id === 'teller') {
    const h = homeInfo(p);
    return `Hello ${p.name}! Your bank balance is ${fmtN(p.bank)} and you have ${fmtN(p.money)} cash. ` + (h ? `Your rent for ${h.name} is paid until ${fmtDate(h.until)}.` : 'You have no home. Rent one at any house door.') + ' Use the ATM to save your money.';
  }
  if (n.id === 'agent') {
    const h = homeInfo(p), left = h ? h.until - Date.now() : 0, d = Math.floor(left / 864e5), hr = Math.floor((left % 864e5) / 36e5);
    const tips = 'Rent is weekly (real time): Agege and Mushin are cheapest, Lekki and Ajah are posh, Ikoyi, Victoria Island and Eko Atlantic are the top.';
    return h ? `${tips} Your home ${h.name} costs ${fmtN(h.rent)}/week and runs out in ${d}d ${hr}h. Open your 📱 phone to renew.` : `${tips} Walk to any house door and tap RENT.`;
  }
  const L = LINES[n.id] || ['Hello!']; return L[Math.floor(Math.random() * L.length)];
}
function sendLife(p, R) {
  const L = p.life, c = L.career && CAREERS[L.career.id], lv = c ? levelOf(L.career) : 0;
  send(p.ws, { t: 'lifeinfo',
    needs: { food: Math.round(p.food), energy: Math.round(L.energy), hygiene: Math.round(L.hygiene), fun: Math.round(L.fun) },
    career: c ? { title: c.title, level: c.lv[lv][0], pay: c.lv[lv][1], xp: L.career.xp, next: c.lv[lv + 1] ? c.lv[lv + 1][2] : null } : null,
    careers: Object.entries(CAREERS).map(([id, x]) => ({ id, title: x.title, pay: x.lv[0][1] })),
    missions: MISSIONS.filter(x => !x.path || x.path === p.path).map(x => ({ name: x.name, reward: x.reward, done: !!L.done[x.id] })),
    garage: p.garage, role: p.role, path: { id: p.path, name: (PATHS[p.path] || {}).name, emoji: (PATHS[p.path] || {}).emoji, goal: (PATHS[p.path] || {}).goal }, home: homeInfo(p),
    log: (p.ledger || []).slice(-8).reverse(), inv: p.inv, atShop: atShop(p), cap: BAG_CAP });
}
function lifeOp(room, p, m) {
  const R = rooms[room], L = p.life, now = Date.now(), me = t => send(p.ws, { t: 'toast', text: t });
  if (p.jailUntil > now) return me('You are in jail!');
  const hm = /^house(\d+)$/.exec(p.inside || ''), ownHome = !!hm && ownsHouse(p, +hm[1]);
  if (m.op === 'apply') {
    const c = CAREERS[m.career]; if (!c) return;
    if (L.career) return me('Quit your current career first');
    L.career = { id: m.career, xp: 0 }; me(`💼 You are now a ${c.title} (${c.lv[0][0]})`);
  } else if (m.op === 'quit') { L.career = null; me('You quit your career');
  } else if (m.op === 'work') {
    if (!L.career) return me('Pick a career first');
    if (!cooldown(p, 'work', WORK_CD)) return me('Shift in progress, wait a bit');
    if (L.energy < 15) { p.cd.work = 0; return me('😴 Too tired. Sleep in your house first'); }
    if (L.hygiene < 10) { p.cd.work = 0; return me('🚿 Shower first, you cannot work like this'); }
    const c = CAREERS[L.career.id], lv = levelOf(L.career), perf = (L.energy + L.hygiene) / 200;
    const pay = Math.round(c.lv[lv][1] * (0.8 + 0.4 * perf) * (p.inv[TOOLS[L.career.id]] ? 1.15 : 1));
    addMoney(p, pay, c.title + ' shift');
    L.energy -= 15; L.fun -= 6; L.hygiene -= 8; p.food = Math.max(0, p.food - 8); L.career.xp++; L.shifts++;
    const nl = levelOf(L.career);
    if (nl > lv) { L.promoted = true; broadcast(room, { t: 'toast', text: `🎉 ${p.name} was promoted to ${c.lv[nl][0]} (${c.title})!` }); }
    else me(`💼 Shift done: +₦${pay}`);
  } else if (m.op === 'sleep') {
    if (!ownHome) return me('Go inside your own house to sleep 🛏️');
    if (!cooldown(p, 'sleep', 20000)) return me('You are not sleepy yet');
    L.energy += 50; me('😴 You slept. Energy restored');
  } else if (m.op === 'shower') {
    if (!ownHome) return me('Go inside your own house to shower 🚿');
    if (!cooldown(p, 'shower', 10000)) return me('Already clean');
    L.hygiene = 100; me('🚿 Fresh and clean');
  } else if (m.op === 'fun') {
    if (!(ownHome || p.inside === 'mall')) return me('Relax at home or in the Grand Market');
    if (!cooldown(p, 'fun', 10000)) return me('Take a short break first');
    if (!charge(p, 50, 'Entertainment')) return;
    L.fun += 30; me('🎮 That was fun!');
  }
  L.energy = clamp(L.energy, 0, 100); L.hygiene = clamp(L.hygiene, 0, 100); L.fun = clamp(L.fun, 0, 100);
  checkMissions(p, R); sendLife(p, R);
}
// ================= INVENTORY & SHOP =================
const BAG_CAP = 40;
const I = (name, icon, cat, price, desc, fx) => ({ name, icon, cat, price, desc, fx: fx || {} });
const ITEMS = {
  suya: I('Suya', '🍢', 'food', 60, 'Food +35', { food: 35 }),
  jollof: I('Jollof & Chicken', '🍛', 'food', 90, 'Food +55', { food: 55 }),
  zobo: I('Zobo', '🥤', 'food', 30, 'Food +10, Fun +8', { food: 10, fun: 8 }),
  water: I('Pure Water', '💧', 'food', 20, 'Food +5, Energy +3', { food: 5, energy: 3 }),
  energy: I('Energy Drink', '⚡', 'food', 80, 'Energy +30', { energy: 30 }),
  soap: I('Soap', '🧼', 'food', 50, 'Hygiene +40', { hygiene: 40 }),
  course: I('Online Course', '📘', 'book', 500, '+2 career XP', { xp: 2 }),
  toolbox: I('Toolbox', '🧰', 'tool', 800, 'Mechanic pay +15%'),
  laptop: I('Laptop', '💻', 'tool', 2500, 'Developer pay +15%'),
  knives: I('Knife Set', '🔪', 'tool', 600, 'Chef pay +15%'),
  textbooks: I('Textbooks', '📚', 'tool', 400, 'Teacher pay +15%'),
  whistle: I('Guard Whistle', '📣', 'tool', 200, 'Guard pay +15%'),
  register: I('Cash Register', '🧾', 'tool', 900, 'Shopkeeper pay +15%'),
  dashcam: I('Dashcam', '📷', 'tool', 700, 'Driver pay +15%')
};
const TOOLS = { mechanic: 'toolbox', developer: 'laptop', chef: 'knives', teacher: 'textbooks', guard: 'whistle', shopkeeper: 'register', driver: 'dashcam' };
const bagCount = p => Object.values(p.inv).reduce((a, b) => a + b, 0);
const atShop = p => p.inside === 'mall' || (!p.inside && SHOPS.some(s => dist(s, p) < 11));
function takeItem(p, id, n) { p.inv[id] -= n; if (p.inv[id] <= 0) delete p.inv[id]; }
function restoreInv(p, s) { p.inv = {}; if (!s || typeof s !== 'object') return; let tot = 0; for (const id in ITEMS) { const q = Math.floor(+s[id]) || 0; if (q > 0 && tot + q <= BAG_CAP) { p.inv[id] = ITEMS[id].cat === 'tool' ? 1 : q; tot += p.inv[id]; } } }
function shopOp(room, p, m) {
  const me = t => send(p.ws, { t: 'toast', text: t }), it = ITEMS[m.id], L = p.life, R = rooms[room];
  if (p.jailUntil > Date.now()) return me('You are in jail!');
  if (!it || typeof m.id !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, m.id)) return;
  const n = it.cat === 'tool' ? 1 : Math.max(1, Math.min(10, Math.floor(+m.qty) || 1));
  if (m.op === 'buy') {
    if (!atShop(p)) return me('Walk to a shop or the Grand Market first');
    if (it.cat === 'tool' && p.inv[m.id]) return me('You already own that');
    if (bagCount(p) + n > BAG_CAP) return me(`Bag full (${BAG_CAP} items)`);
    const cost = it.price * n;
    if (!charge(p, cost, 'Bought ' + it.name + (n > 1 ? ' x' + n : ''))) return;
    p.inv[m.id] = (p.inv[m.id] || 0) + n; L.bought++;
    me(`${it.icon} Bought ${it.name}${n > 1 ? ' x' + n : ''}`);
  } else if (m.op === 'sell') {
    if (!atShop(p)) return me('Walk to a shop or the Grand Market to sell');
    if ((p.inv[m.id] || 0) < n) return me('You do not have that');
    takeItem(p, m.id, n); addMoney(p, Math.floor(it.price / 2) * n, 'Sold ' + it.name + (n > 1 ? ' x' + n : '')); me(`💰 Sold ${it.name}`);
  } else if (m.op === 'use') {
    if (it.cat === 'tool') return me('Tools work automatically while you work');
    if ((p.inv[m.id] || 0) < 1) return me('You do not have that');
    takeItem(p, m.id, 1); const f = it.fx;
    if (f.food) p.food = Math.min(100, p.food + f.food);
    if (f.energy) L.energy += f.energy; if (f.hygiene) L.hygiene += f.hygiene; if (f.fun) L.fun += f.fun;
    if (f.xp) { if (!L.career) { p.inv[m.id] = (p.inv[m.id] || 0) + 1; return me('Pick a career first'); }
      const c = CAREERS[L.career.id], lv = levelOf(L.career); L.career.xp += f.xp; const nl = levelOf(L.career);
      if (nl > lv) { L.promoted = true; broadcast(room, { t: 'toast', text: `🎉 ${p.name} was promoted to ${c.lv[nl][0]} (${c.title})!` }); } }
    me(`${it.icon} Used ${it.name}`);
  } else return;
  L.energy = clamp(L.energy, 0, 100); L.hygiene = clamp(L.hygiene, 0, 100); L.fun = clamp(L.fun, 0, 100);
  checkMissions(p, R); sendLife(p, R);
}
// needs drain every 5s, ledger + missions + panel refresh every 1.5s
setInterval(() => { for (const code in rooms) for (const o of Object.values(rooms[code].players)) { const L = o.life; if (!L) continue; L.energy = clamp(L.energy - 0.6, 0, 100); L.hygiene = clamp(L.hygiene - 0.4, 0, 100); L.fun = clamp(L.fun - 0.5, 0, 100); } }, 5000);
setInterval(() => {
  for (const code in rooms) for (const p of Object.values(rooms[code].players)) {
    if (!p.life) continue;
    syncLedger(p);
    checkMissions(p, rooms[code]); sendLife(p, rooms[code]);
  }
}, 1500);

// hunger: -1 every 5 seconds
setInterval(() => { for (const code in rooms) for (const o of Object.values(rooms[code].players)) o.food = Math.max(0, o.food - 1); }, 5000);
// bank interest every 10s
setInterval(() => {
  for (const code in rooms) for (const o of Object.values(rooms[code].players)) if (o.bank > 0) o.bank += Math.min(100, Math.max(1, Math.floor(o.bank * 0.01)));
}, 10000);

// rent: warn before it ends, move people out when it has ended
setInterval(() => {
  const now = Date.now();
  for (const code in rooms) for (const p of Object.values(rooms[code].players)) {
    const u = myUnit(p);
    if (u) {
      const h = HOUSES[u.house]; p._homeId = u.id; const left = tenants[u.id].until - now;
      if (left < 3600e3 && (p._warn || 0) < 2) { p._warn = 2; send(p.ws, { t: 'toast', text: `⚠️ Rent for ${unitName(h, u)} ends in under 1 hour! Renew in your 📱 phone` }); }
      else if (left < 864e5 && (p._warn || 0) < 1) { p._warn = 1; send(p.ws, { t: 'toast', text: `⚠️ Rent for ${unitName(h, u)} ends in less than a day (${fmtN(h.rent)})` }); }
    } else if (p._homeId !== undefined) {
      const id = p._homeId; p._homeId = undefined; p._warn = 0;
      send(p.ws, { t: 'toast', text: '🏠 Your rent ran out and you lost your home. Rent a new one at any house door.' });
      if (p.inside === 'house' + id) { const hh = HOUSES[UNITS[id].house]; p.inside = null; p.x = hh.out.x; p.z = hh.out.z; send(p.ws, { t: 'tp', x: p.x, z: p.z }); }
    }
  }
}, 15000);

// autosave every 20 seconds
setInterval(() => { for (const code in rooms) for (const o of Object.values(rooms[code].players)) savePlayer(code, o); flushSaves(); }, 20000);

(async () => {
  await loadStore();
  server.listen(PORT, () => console.log('City game running on port ' + PORT + ' | storage: ' + (UP_ON ? (dbWritesOk ? 'Upstash (permanent)' : 'temporary files (Upstash unreachable)') : 'temporary files')));
})();
// Render sends SIGTERM when it restarts or redeploys: save everyone first
process.on('SIGTERM', async () => {
  try { for (const code in rooms) for (const o of Object.values(rooms[code].players)) savePlayer(code, o); flushSaves(); await dbFlush(); } catch (e) {}
  process.exit(0);
});
