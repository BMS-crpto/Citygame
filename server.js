const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const BUILD = require('./public/buildings.js');   // every building you can walk into (shared with the browser)
const BLD = BUILD.list();
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
    let ok = false;
    // Defensive verification: corrupted/legacy account records must not crash the auth request.
    if (a && typeof a.salt === 'string' && typeof a.hash === 'string') {
      try {
        const actual = Buffer.from(hashPw(pw, a.salt), 'hex');
        const expected = Buffer.from(a.hash, 'hex');
        ok = actual.length === expected.length && actual.length === 64 && crypto.timingSafeEqual(actual, expected);
      } catch (e) { ok = false; }
    }
    if (!ok) return out(401, { error: 'Wrong username or password' });
    out(200, { token: makeToken(u), username: u });
  });
}

// ---- authenticated player account/profile API ----
function accountFromRequest(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? readToken(match[1]) : null;
}
function accountSnapshot(username) {
  const a = accounts[username];
  if (!a) return null;
  const key = 'CITY1:a:' + username;
  const sv = saves[key] && typeof saves[key] === 'object' ? saves[key] : {};
  const ext = sv.ext && typeof sv.ext === 'object' ? sv.ext : {};
  const life = sv.life && typeof sv.life === 'object' ? sv.life : {};
  const career = life.career && typeof life.career === 'object' ? life.career : null;
  const careerDef = career && typeof CAREERS !== 'undefined' ? CAREERS[career.id] : null;
  const careerLevel = career && careerDef ? levelOf(career) : 0;
  const homeEntry = Object.entries(tenants).find(([, t]) => t && t.key === key && t.until > Date.now());
  const homeId = homeEntry ? homeEntry[0] : '';
  const homeUnit = homeId && typeof UNITS !== 'undefined' ? UNITS[+homeId] : null;
  const homeHouse = homeUnit && typeof HOUSES !== 'undefined' ? HOUSES[homeUnit.house] : null;
  const ownedBusinesses = Object.values(businesses).filter(b => b && b.ownerKey === key).map(b => ({
    id: b.id, name: b.name, kind: b.kind, area: b.area,
    locationName: String(b.locationName || ''), balance: Math.max(0, Math.floor(+b.balance || 0)),
    staffCount: Array.isArray(b.staff) ? b.staff.length : 0,
    customers: Math.max(0, Math.floor(+b.customers || 0))
  }));
  const decorInventory = ext.decorInv && typeof ext.decorInv === 'object' ? ext.decorInv : {};
  const homeDecor = homeId && ext.decor && Array.isArray(ext.decor[homeId]) ? ext.decor[homeId] : [];
  const homeFurniture = homeDecor.filter(item => item && DECOR[item.id]).slice(0, 60).map(item => ({
    id: String(item.id), name: DECOR[item.id].name, icon: DECOR[item.id].icon,
    x: Math.max(-8, Math.min(8, +item.x || 0)), z: Math.max(-8, Math.min(8, +item.z || 0)),
    rotation: Math.round((+item.ry || 0) * 100) / 100
  }));
  const furnitureInventory = Object.entries(decorInventory).filter(([id, count]) => DECOR[id] && +count > 0).map(([id, count]) => ({
    id, name: DECOR[id].name, icon: DECOR[id].icon, quantity: Math.min(200, Math.floor(+count || 0))
  }));
  const inventory = sv.inv && typeof sv.inv === 'object' ? sv.inv : {};
  const inventoryCount = Object.values(inventory).reduce((n, q) => n + Math.max(0, Math.floor(+q || 0)), 0);
  const needs = {
    food: Math.max(0, Math.min(100, +sv.food || 0)),
    energy: Math.max(0, Math.min(100, +life.energy || 0)),
    hygiene: Math.max(0, Math.min(100, +life.hygiene || 0)),
    fun: Math.max(0, Math.min(100, +life.fun || 0)),
    social: Math.max(0, Math.min(100, +life.social || 0)),
    bladder: Math.max(0, Math.min(100, +life.bladder || 0))
  };
  return {
    username,
    displayName: String((a.profile && a.profile.displayName) || a.name || username).slice(0, 30),
    bio: String((a.profile && a.profile.bio) || '').slice(0, 120),
    email: String(a.email || ''),
    createdAt: +a.created || 0,
    lastSavedAt: +sv.saved || 0,
    player: {
      money: Math.max(0, Math.floor(+sv.money || 0)),
      bank: Math.max(0, Math.floor(+sv.bank || 0)),
      food: needs.food, needs,
      path: String(sv.path || ''),
      look: Array.isArray((accounts[username].profile || {}).avatar && accounts[username].profile.avatar.look) ? accounts[username].profile.avatar.look.slice(0, 6) : (Array.isArray(sv.look) ? sv.look.slice(0, 6) : []),
      career: career ? { id: String(career.id || ''), title: String(careerDef && careerDef.title || career.id || ''), level: careerLevel + 1, xp: Math.max(0, Math.floor(+career.xp || 0)), skill: Math.max(0, Math.floor(+(life.skills && life.skills[career.id]) || 0)) } : null,
      skills: life.skills && typeof life.skills === 'object' ? Object.entries(life.skills).slice(0, 20).map(([id, level]) => ({ id: String(id), level: Math.max(0, Math.min(10, Math.floor(+level || 0))) })) : [],
      inventoryItems: inventoryCount,
      vehicles: Array.isArray(ext.cars) ? ext.cars.length : 0,
      vehicleIds: Array.isArray(ext.cars) ? ext.cars.slice(0, 30) : [],
      hasDriversLicense: !!ext.license,
      homeActive: !!homeEntry,
      home: homeEntry ? { id: homeId, name: String(homeUnit && homeHouse ? unitName(homeHouse, homeUnit) : homeHouse && homeHouse.name || 'Rented home'), area: String(homeHouse && homeHouse.area || ''), until: +homeEntry[1].until } : null,
      homeUntil: homeEntry ? +homeEntry[1].until : 0,
      homeFurniture,
      furnitureInventory,
      furniturePlacedCount: homeFurniture.length,
      homeRent: homeHouse ? Math.max(0, Math.floor(+homeHouse.rent || 0)) : 0,
      businesses: ownedBusinesses,
      dailyStreak: Math.max(0, Math.floor(+ext.streak || 0))
    }
  };
}
function accountApi(req, res) {
  const sendJson = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  const auth = accountFromRequest(req);
  if (!auth || !accounts[auth.acct]) return sendJson(401, { error: 'Please sign in again to access your player account.' });
  const username = auth.acct;
  if (req.method === 'GET') return sendJson(200, { ok: true, account: accountSnapshot(username), storage: UP_ON && dbWritesOk ? 'persistent' : 'local-fallback' });
  if (req.method !== 'PATCH' && req.method !== 'POST') return sendJson(405, { error: 'Method not allowed' });
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 3000) req.destroy(); });
  req.on('end', () => {
    let input;
    try { input = JSON.parse(body || '{}'); } catch (e) { return sendJson(400, { error: 'Invalid profile data.' }); }
    if (req.method === 'POST' && input.action === 'save-avatar') {
      const raw = input.look;
      if (!Array.isArray(raw) || raw.length !== 6 || raw.some((v, i) => !Number.isInteger(v) || v < 0 || v > [4,4,7,4,1,5][i])) return sendJson(400, { error: 'Invalid character appearance data.' });
      const appearance = input.appearance && typeof input.appearance === 'object' ? input.appearance : {};
      const safeAppearance = {};
      for (const field of ['skin','hair','style','shirt','pants','shoes']) {
        const value = String(appearance[field] || '');
        if (field === 'style' ? !['short','fade','afro'].includes(value) : !/^#[0-9a-fA-F]{6}$/.test(value)) return sendJson(400, { error: 'Invalid character appearance.' });
        safeAppearance[field] = value;
      }
      const a = accounts[username];
      a.profile = Object.assign({}, a.profile || {}, { avatar: { look: raw.slice(), appearance: safeAppearance, updatedAt: Date.now() }, updatedAt: Date.now() });
      saveAccounts();
      return persistAccount(username).then(() => sendJson(200, { ok: true, account: accountSnapshot(username) }))
        .catch(e => { console.log('account avatar save failed', username, e.message); sendJson(503, { error: 'Character appearance could not be saved. Please retry.' }); });
    }
    if (req.method === 'POST' && input.action === 'change-password') {
      const currentPassword = String(input.currentPassword || '');
      const newPassword = String(input.newPassword || '');
      const account = accounts[username];
      if (!currentPassword || !newPassword) return sendJson(400, { error: 'Enter your current and new passwords.' });
      if (newPassword.length < 10 || newPassword.length > 128 || WEAK.includes(newPassword.toLowerCase()) || newPassword.toLowerCase() === username) return sendJson(400, { error: 'Choose a stronger password with at least 10 characters.' });
      const actual = Buffer.from(hashPw(currentPassword, account.salt), 'hex');
      const expected = Buffer.from(String(account.hash || ''), 'hex');
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return sendJson(403, { error: 'Current password is incorrect.' });
      const salt = crypto.randomBytes(16).toString('hex');
      account.salt = salt;
      account.hash = hashPw(newPassword, salt);
      saveAccounts();
      return persistAccount(username).then(() => sendJson(200, { ok: true, message: 'Password updated successfully.' }))
        .catch(e => { console.log('account password save failed', username, e.message); sendJson(503, { error: 'Password could not be saved. Please retry.' }); });
    }
    if (req.method !== 'PATCH') return sendJson(400, { error: 'Unsupported account action.' });
    const displayName = String(input.displayName == null ? '' : input.displayName).trim();
    const bio = String(input.bio == null ? '' : input.bio).trim();
    if (displayName.length < 2 || displayName.length > 24 || !/^[\p{L}\p{N} _.'-]+$/u.test(displayName)) return sendJson(400, { error: 'Display name must be 2–24 letters, numbers or simple punctuation.' });
    if (bio.length > 120) return sendJson(400, { error: 'Bio must be 120 characters or fewer.' });
    const a = accounts[username];
    a.profile = Object.assign({}, a.profile || {}, { displayName, bio, updatedAt: Date.now() });
    saveAccounts();
    persistAccount(username).then(() => sendJson(200, { ok: true, account: accountSnapshot(username) }))
      .catch(e => { console.log('account profile save failed', username, e.message); sendJson(503, { error: 'Profile could not be saved. Please retry.' }); });
  });
}

const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  // Normalize the URL path once so query strings and trailing slashes do not
  // accidentally send API requests into the static-file handler.
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (e) { res.writeHead(400); return res.end(); }
  const route = url.replace(/[/]+$/, '') || '/';
  if (req.method === 'POST' && (route === '/api/register' || route === '/api/login')) return authApi(req, res);
  if (route === '/api/account' || route === '/api/account/profile') return accountApi(req, res);
  if (req.method === 'GET' && route === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ ok: true, storage: UP_ON ? (dbWritesOk ? 'upstash (accounts are permanent)' : 'upstash unreachable - using temporary files') : 'temporary file (accounts are WIPED when Render restarts or redeploys)', accounts: Object.keys(accounts).length - 1, lastError: dbLastError })); }
  if (req.method === 'GET' && route === '/api/world-status') {
    const activeRooms = Object.values(rooms || {});
    const onlinePlayers = activeRooms.reduce((n, room) => n + Object.keys(room.players || {}).length, 0);
    const businessCount = Object.keys(businesses || {}).length;
    const payload = {
      ok: true,
      world: 'CITY1',
      onlinePlayers,
      activeRooms: activeRooms.filter(room => Object.keys(room.players || {}).length).length,
      buildings: BLD.length,
      destinations: PLACES.length,
      playerBusinesses: businessCount,
      storage: UP_ON && dbWritesOk ? 'persistent' : 'local-fallback',
      uptimeSeconds: Math.floor(process.uptime())
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(JSON.stringify(payload));
  }
  if (req.method === 'GET' && route === '/config.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ googleClientId: GOOGLE_CLIENT_ID, turn: process.env.TURN_URL ? { urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' } : null })); }
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
  saves[k] = { money: p.money, bank: p.bank, food: p.food, life: p.life, inv: p.inv, houses: [], path: p.path, look: p.look, ext: p.ext, saved: Date.now() };
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
// Player-owned businesses are shared across the Lagos server and stored with saved game data.
const businesses = saves._businesses = (saves._businesses && typeof saves._businesses === 'object') ? saves._businesses : {};
function saveBusinesses() { saveDirty = true; dirtySaves.add('_businesses'); }
function businessQuality(b) { const staff=Array.isArray(b.staff)?b.staff:[]; let bonus=0; for(const x of staff){if(x.role==='manager')bonus+=0.08;else if(x.role==='cashier')bonus+=0.06;else if(x.role==='security')bonus+=0.025;else if(x.role==='cleaner')bonus+=0.02;else if((b.kind==='restaurant'&&x.role==='chef')||(b.kind==='salon'&&x.role==='stylist'))bonus+=0.12;} return Math.min(0.45,bonus); }
function businessList(viewerKey) { return Object.values(businesses).filter(b => b && BLD[+String(b.id).replace(/^b/, '')]).map(b => ({ id:b.id, name:b.name, kind:b.kind, icon:b.icon, area:b.area, locationName:b.locationName||b.name, x:b.x, z:b.z, owner:b.ownerName, isMine:b.ownerKey===viewerKey, balance:b.ownerKey===viewerKey?Math.max(0,Math.floor(+b.balance||0)):0, staff:b.ownerKey===viewerKey&&Array.isArray(b.staff)?b.staff:[], quality:b.ownerKey===viewerKey?Math.round(businessQuality(b)*100):0, customers:b.ownerKey===viewerKey?Math.max(0,Math.floor(+b.customers||0)):0, created:b.created||0 })); }
function sendBusinesses(p) { send(p.ws, { t:'x_businesses', businesses:businessList(pKey(p)) }); }
let lastCustomerSimulationMinute = 0;
function simulateBusinessCustomers(now) {
  const minute=Math.floor(now/60000); if(!minute||minute===lastCustomerSimulationMinute)return;
  lastCustomerSimulationMinute=minute;
  const active=Object.values(rooms).some(R=>R&&Object.keys(R.players||{}).length>0); if(!active)return;
  let changed=false;
  for(const b of Object.values(businesses)){
    if(!b||!b.ownerKey||now-(+b.lastCustomerAt||0)<55000)continue;
    const quality=businessQuality(b),staff=Array.isArray(b.staff)?b.staff.length:0;
    const chance=Math.min(.88,.28+quality*.9+(staff? .06:0)); if(Math.random()>chance)continue;
    const ticket=({restaurant:950,fashion:2400,tech:3100,supermarket:1250,salon:1800,lounge:2200,carwash:1500,pharmacy:1100})[b.kind]||1200;
    const sale=Math.round(ticket*(.65+Math.random()*.7)*(1+quality));
    b.balance=Math.min(1e9,Math.max(0,Math.floor(+b.balance||0))+sale);
    b.customers=Math.min(1e9,Math.max(0,Math.floor(+b.customers||0))+1);b.lastCustomerAt=now;changed=true;
    const owner=Object.values(rooms).flatMap(R=>Object.values(R.players||{})).find(p=>p&&pKey(p)===b.ownerKey);
    if(owner&&now-(+b.lastCustomerNoticeAt||0)>300000){send(owner.ws,{t:'toast',text:'🛍️ A customer visited '+b.name+' · '+fmtN(sale)+' added to company earnings'});b.lastCustomerNoticeAt=now;}
  }
  if(changed){saveBusinesses();for(const R of Object.values(rooms))if(R)for(const p of Object.values(R.players||{}))sendBusinesses(p);}
}
function broadcastBusinesses(room) { for(const p of Object.values(rooms[room].players)) sendBusinesses(p); }
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
const JAIL = { x: -533, z: 533 };   // moved to the new corner of the bigger map
// places you can walk into. Their insides are built far away from the city (x = 1000).
const BANK_DOOR = { x: 32, z: 43 }, BANK_OUT = { x: 32, z: 47 };
const MALL_DOOR = { x: 32, z: 174.5 }, MALL_OUT = { x: 32, z: 179 };
const DEALER_DOOR = { x: 32, z: 108.5 }, DEALER_OUT = { x: 32, z: 113 };
const ROOM = { bank: { x: 1000, z: 0, hd: 11 }, mall: { x: 1000, z: 200, hd: 16 }, dealer: { x: 1000, z: -200, hd: 16 } };
const houseRoom = id => ({ x: 1000, z: 400 + id * 40, hd: 9 });
const ATM = { x: 989, z: 0 }, VAULT = { x: 1009.5, z: -9.5 }, MALLCASH = { x: 1000, z: 187.5 };
const FOODC = { x: 1019, z: 192 };               // food counter inside the Grand Market
// named places on the city map (all on the road, so nobody lands inside a wall)
const PLACES = [
  { id: 'bank', name: 'Lagoon Bank', icon: '🏦', x: 32, z: 48 },
  { id: 'mall', name: 'Grand Market Hall', icon: '🛒', x: 32, z: 180 },
  { id: 'dealer', name: 'Elite Auto Gallery', icon: '🚘', x: 32, z: 113 },
  { id: 'vi', name: 'Victoria Island', icon: '🏙️', x: 0, z: -40 },
  { id: 'lekki', name: 'Lekki Estates', icon: '🏡', x: 128, z: 40 },
  { id: 'ikeja', name: 'Ikeja Offices', icon: '🏢', x: -192, z: -120 },
  { id: 'surulere', name: 'Surulere', icon: '🏘️', x: -192, z: 120 },
  { id: 'market', name: 'Mainland Market', icon: '🧺', x: 64, z: -200 },
  { id: 'ajah', name: 'Ajah', icon: '🏘️', x: 320, z: 128 }, { id: 'ikoyi', name: 'Ikoyi', icon: '🏛️', x: 320, z: -128 },
  { id: 'agege', name: 'Agege', icon: '🏚️', x: -320, z: -128 }, { id: 'mushin', name: 'Mushin', icon: '🏘️', x: -320, z: 128 },
  { id: 'yaba', name: 'Yaba', icon: '🎓', x: -128, z: -320 }, { id: 'oshodi', name: 'Oshodi', icon: '🚌', x: 128, z: -320 },
  { id: 'maryland', name: 'Maryland', icon: '🛍️', x: -64, z: 320 }, { id: 'eko', name: 'Eko Atlantic', icon: '🌆', x: 192, z: 320 },
  { id: 'airport', name: 'Lagos Airport', icon: '✈️', x: -192, z: 300 }, { id: 'jail', name: 'City Jail', icon: '⛓️', x: -526, z: 526 },
  { id: 'ikorodu', name: 'Ikorodu', icon: '🏭', x: -64, z: -448 }, { id: 'ojota', name: 'Ojota', icon: '🚏', x: 192, z: -448 },
  { id: 'epe', name: 'Epe', icon: '🐟', x: 448, z: 64 }, { id: 'lekki2', name: 'Lekki Phase 2', icon: '🏖️', x: 448, z: 320 },
  { id: 'ojo', name: 'Ojo', icon: '🌾', x: -448, z: -192 }, { id: 'festac', name: 'Festac Town', icon: '🏘️', x: -448, z: 192 },
  { id: 'apapa', name: 'Apapa Port', icon: '🚢', x: -320, z: 448 }, { id: 'badagry', name: 'Badagry Road', icon: '🛣️', x: 128, z: 448 }
];
const RIDES = { keke: { name: 'Keke', rate: 0.15, min: 30, speed: 28 }, danfo: { name: 'Danfo', rate: 0.07, min: 20, speed: 20 }, okada: { name: 'Okada', rate: 0.28, min: 60, speed: 42 }, jet: { name: 'Private Jet', rate: 0.2, min: 350, speed: 110 }, uber: { name: 'Uber', rate: 0.12, min: 50, speed: 32 } };
const MAXLOOK = [4, 4, 7, 4, 1, 5];   // skin, hair style, top, trousers, body (0 man / 1 woman), hair colour
// people you can talk to. place: null = outside in the city, otherwise the room they stand in
const NPCS = [
  { id: 'cashier', name: 'Auntie Chioma', title: 'Cashier', place: 'mall', x: 997.5, z: 186.1, ry: 0, look: [1, 0, 5, 3, 1, 0] },
  { id: 'mamaput', name: 'Mama Put', title: 'Food seller', place: 'mall', x: 1021.3, z: 192, ry: -Math.PI / 2, look: [2, 4, 3, 2, 1, 0] },
  { id: 'sales1', name: 'Chidi', title: 'Sales executive', place: 'dealer', x: 1000, z: -214.8, ry: 0, look: [3, 0, 4, 1, 0, 0] },
  { id: 'salesmgr', name: 'Mr Adeleke', title: 'Showroom manager', place: 'dealer', x: 1017.5, z: -189, ry: -Math.PI / 2, look: [1, 0, 4, 1, 0, 0] },
  { id: 'gallerysec', name: 'Officer Bala', title: 'Security', place: 'dealer', x: 1008, z: -187, ry: Math.PI, look: [4, 3, 7, 1, 0, 0] },
  { id: 'mallguard', name: 'Oga Musa', title: 'Security', place: 'mall', x: 1004.5, z: 212.6, ry: Math.PI, look: [4, 3, 7, 1, 0, 0] },
  { id: 'teller', name: 'Mr Segun', title: 'Bank teller', place: 'bank', x: 1003, z: -8.0, ry: 0, look: [1, 0, 4, 1, 0, 0] },
  { id: 'bankguard', name: 'Danladi', title: 'Bank security', place: 'bank', x: 991.5, z: 7.2, ry: 0.5, look: [3, 3, 7, 1, 0, 0] },
  { id: 'agent', name: 'Agent Kemi', title: 'Rent agent', place: null, x: 10, z: 12, ry: -2.5, look: [1, 0, 1, 3, 1, 1] }
];
// one staff member inside each kind of venue (rooms are built at x = 1300)
for (const k of BUILD.ORDER) { const t = BUILD.TYPES[k], n = t.npc; NPCS.push({ id: 'v_' + k, name: n.name, title: n.title, place: 'v_' + k, x: t.room.x + n.dx, z: t.room.z + n.dz, ry: n.ry, look: n.look }); }
// Every generated building is a real GPS and ride destination, not just scenery.
BLD.forEach(b => {
  const t = BUILD.TYPES[b.type];
  PLACES.push({ id: 'b' + b.id, name: b.name, icon: t.icon, type: b.type, area: b.area, x: Math.round(b.out.x), z: Math.round(b.out.z) });
});
const WORLD = { houses: HOUSES, shops: SHOPS, jail: JAIL, bankDoor: BANK_DOOR, mallDoor: MALL_DOOR, places: PLACES, rides: RIDES,
  npcs: NPCS.map(n => ({ id: n.id, name: n.name, title: n.title, place: n.place, x: n.x, z: n.z, ry: n.ry, look: n.look })) };
function newJob(p) {
  const shop = SHOPS[Math.floor(Math.random() * SHOPS.length)];
  const h = Math.random() < 0.5 ? HOUSES[Math.floor(Math.random() * HOUSES.length)] : null;
  const dl = PLACES.filter(q => q.id !== 'jail'), pl = dl[Math.floor(Math.random() * dl.length)];
  const pu = { x: shop.x, z: shop.z + 9 };
  const dr = h ? { x: h.door.x, z: h.door.z, name: 'House #' + (h.id + 1) } : { x: pl.x, z: pl.z, name: pl.name };
  p.job = { stage: 'pickup', pu, dr, pay: (120 + Math.round(dist(pu, dr) * 0.5)) * INCOME_MULT, until: Date.now() + 360000 };
}
function jobInfo(p) {
  if (!p.job) return null;
  const j = p.job, tg = j.stage === 'pickup' ? j.pu : j.dr;
  return { stage: j.stage, x: tg.x, z: tg.z, pay: j.pay, label: j.stage === 'pickup' ? 'Pick up the package at the shop' : 'Deliver the package to ' + j.dr.name, left: Math.max(0, Math.round((j.until - Date.now()) / 1000)) };
}
function placeInfo(place) {
  if (place === 'bank') return { door: BANK_DOOR, out: BANK_OUT, room: ROOM.bank };
  if (place === 'mall') return { door: MALL_DOOR, out: MALL_OUT, room: ROOM.mall };
  if (place === 'dealer') return { door: DEALER_DOOR, out: DEALER_OUT, room: ROOM.dealer };
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
function cooldown(p, key, ms) { const n = Date.now(); if ((p.cd[key] || 0) > n) return false; p.cd[key] = n + ms; return true; }

function onConnection(ws) {
  let id = null, room = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') { const go = (gu) => {
      room = 'CITY1'; // one shared world for every player
      const role = ROLES.includes(m.role) ? m.role : 'citizen';
      id = nextId++;
      rooms[room] = rooms[room] || { players: {}, owners: {}, paint: {}, feed: [] };
      rooms[room].feed = rooms[room].feed || [];
      rooms[room].players[id] = {
        ws, id, name: String(m.name || 'Player').slice(0, 14), role, money: 500, bank: 0, inside: null, food: 100, job: null, travelUntil: 0, dest: null, look: (Array.isArray(m.look) ? m.look : []).slice(0, 6).concat([0,0,0,0,0,0]).slice(0, 6).map((v, i) => Math.max(0, Math.min(MAXLOOK[i], Math.floor(+v) || 0))), car: -1, jailUntil: 0, cd: {},
        x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8, ry: 0, moving: false, floor: 0
      };
      const np = rooms[room].players[id]; if (gu) { np.email = gu.email; np.acct = gu.acct; if (gu.acct) { const profileName = accounts[gu.acct] && accounts[gu.acct].profile && accounts[gu.acct].profile.displayName; np.name = String(profileName || gu.acct).slice(0, 14); } else if (!m.name) np.name = String(gu.name).slice(0, 14); }
      const savedAvatar = gu && gu.acct && accounts[gu.acct].profile && accounts[gu.acct].profile.avatar;

      if (savedAvatar && Array.isArray(savedAvatar.look) && savedAvatar.look.length === 6) np.look = savedAvatar.look.slice();
const sv = saves[saveKey(room, np)];
      if (sv) {
        np.money = Math.max(0, Math.floor(+sv.money) || 0); np.bank = Math.max(0, Math.floor(+sv.bank) || 0); np.food = Math.max(0, Math.min(100, +sv.food || 100));
      }
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
      np.ext = loadExt(sv && sv.ext); ensureAcct(np); if (np.ext.role && ROLES.includes(np.ext.role)) np.role = np.ext.role;
      // Spawn the player inside their active home instead of at the random street position.
      const home = homeInfo(np);
      if (home) {
        const homePlace = placeInfo('house' + home.unit);
        if (homePlace) { np.inside = 'house' + home.unit; np.car = -1; np.x = homePlace.room.x; np.z = homePlace.room.z + homePlace.room.hd - 4; np.ry = Math.PI; }
      }
      send(ws, { t: 'welcome', id, room, world: WORLD, path: np.path, first, pathInfo: PATHS[np.path], start: START[np.path], starter: np.starter || null, home });
      if (np.inside && home) send(ws, { t: 'int', place: np.inside, x: np.x, z: np.z });
      if (sv && !first) send(ws, { t: 'toast', text: '💾 Welcome back! Progress restored' });
      send(ws, { t: 'catalog', items: Object.entries(ITEMS).map(([id, i]) => ({ id, name: i.name, icon: i.icon, cat: i.cat, price: i.price, desc: i.desc })) });
      sendLife(np, rooms[room]); sendExtras(np);
      broadcast(room, { t: 'toast', text: `${rooms[room].players[id].name} joined as ${np.role}` });
      }; if (m.token) { const a = readToken(m.token); if (!a) return send(ws, { t: 'authfail' }); go(a); } else if (m.idToken) verifyGoogle(m.idToken, go); else go(null); return;
    }
    if (!room || !rooms[room] || !rooms[room].players[id]) return;
    const p = rooms[room].players[id], R = rooms[room];
    const now = Date.now();
    if (p.travelUntil > now && m.t !== 'chat') return;
    if (m.t === 'customer_sale') {
      const bid=Number.isInteger(+p.bld)?+p.bld:-1;
      const venue=p.inside&&/^v_/.test(p.inside)?p.inside.slice(2):'';
      const venueMap={restaurant:'restaurant',fashion:'fashion',tech:'office',supermarket:'supermarket',salon:'salon',lounge:'lounge',carwash:'carwash',pharmacy:'pharmacy'};
      const business=bid>=0?businesses['b'+bid]:null;
      if(!business||venueMap[business.kind]!==venue)return;
      if(now-(+business.lastVisibleSaleAt||0)<22000)return;
      const ticket=({restaurant:950,fashion:2400,tech:3100,supermarket:1250,salon:1800,lounge:2200,carwash:1500,pharmacy:1100})[business.kind]||1200;
      const quality=businessQuality(business);
      const sale=Math.round(ticket*(0.9+Math.random()*0.2)*(1+quality));
      business.balance=Math.min(1e9,Math.max(0,Math.floor(+business.balance||0))+sale);
      business.customers=Math.min(1e9,Math.max(0,Math.floor(+business.customers||0))+1);
      business.lastVisibleSaleAt=now;
      saveBusinesses();
      for(const RR of Object.values(rooms))if(RR)for(const viewer of Object.values(RR.players||{}))sendBusinesses(viewer);
      const owner=Object.values(rooms).flatMap(RR=>Object.values(RR.players||{})).find(q=>q&&pKey(q)===business.ownerKey);
      if(owner)send(owner.ws,{t:'toast',text:'🧾 Customer purchase at '+business.name+' · '+fmtN(sale)+' added to company earnings'});
      return;
    }
    if (extraMsg(room, p, m, now)) return;
    if (m.t === 'move') {
      if (p.jailUntil > now) return;
      if (p.ride) return;                 // passengers are carried by the driver's car
      p.x = +m.x || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.moving = !!m.moving;
      if (!p.inside || !/^v_(office|tower)$/.test(p.inside)) p.floor = 0;
      p.car = Number.isInteger(m.car) && VEHICLES[m.car] && p.ext && p.ext.license && p.ext.cars.includes(m.car) ? m.car : -1;
      if (p.job && !p.inside) {
        const j = p.job;
        if (now > j.until) { p.job = null; send(ws, { t: 'job', job: null }); send(ws, { t: 'toast', text: '📦 Delivery job expired' }); }
        else if (dist(p, j.stage === 'pickup' ? j.pu : j.dr) < 6) {
          if (j.stage === 'pickup') { j.stage = 'drop'; send(ws, { t: 'toast', text: '📦 Package picked up! Now deliver it' }); send(ws, { t: 'job', job: jobInfo(p) }); }
          else { addMoney(p, j.pay, 'Delivery job'); send(ws, { t: 'toast', text: `📦 Delivered! +₦${j.pay}` }); p.job = null; send(ws, { t: 'job', job: null }); }
        }
      }
    } else if (m.t === 'ridejoin') {
      const RR = rooms[room], d = RR && Object.values(RR.players).find(q => String(q.id) === String(m.id));
      if (!d || d === p || p.ride || p.car >= 0 || p.inside || d.inside || d.car < 0 || d.ride) return send(ws, { t: 'toast', text: 'You cannot join that car' });
      if (dist(d, p) > 10) return send(ws, { t: 'toast', text: 'Walk up to the car first' });
      if (Object.values(RR.players).filter(q => q.ride === d.id).length >= 3) return send(ws, { t: 'toast', text: 'The car is full' });
      p.ride = d.id; p.moving = false;
      send(ws, { t: 'toast', text: "🚗 You joined " + d.name + "'s car. Use the quick-chat button to talk!" });
      send(d.ws, { t: 'toast', text: '🚗 ' + p.name + ' joined your car' });
    } else if (m.t === 'pose') {
      p.pose = ''; p.poseUntil = 0;               // the player got up
    } else if (m.t === 'rideend') {
      // taxi/jet arrival is timed by the server (p.travelUntil); the client's "we have arrived" ping needs no action
    } else if (m.t === 'ridestop') {
      if (!p.ride) return;
      const RR = rooms[room], d = RR && Object.values(RR.players).find(q => q.id === p.ride);
      p.ride = null; if (d) { p.x = d.x + 3; p.z = d.z + 1; }
      send(ws, { t: 'tp', x: p.x, z: p.z });
    } else if (m.t === 'social_get') {
      send(ws, { t: 'social_feed', posts: (R.feed || []).slice(-30).reverse().map(q => ({...q, likes:Array.isArray(q.likes)?q.likes:[], comments:Array.isArray(q.comments)?q.comments:[], likedByMe:Array.isArray(q.likes)&&q.likes.includes(p.id)})) });
    } else if (m.t === 'social_post') {
      const text = String(m.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 180);
      if (!text) return;
      if (!cooldown(p, 'social_post', 12000)) return send(ws, { t: 'toast', text: '📱 Wait a little before posting again' });
      R.feed = R.feed || []; const post = { id: Date.now() + '-' + p.id, name: p.name, text, ts: now, area: p.inside || 'Lagos City' };
      R.feed.push(post); if (R.feed.length > 50) R.feed.shift();
      p.ext.socialPosts = (p.ext.socialPosts || 0) + 1;
      post.likes = []; post.comments = [];
      broadcast(room, { t: 'social_new', post }); checkMissions(p, R); savePlayer(room, p);
    } else if (m.t === 'social_like') {
      const post = (R.feed || []).find(q => q.id === String(m.id || ''));
      if (!post) return send(ws, { t: 'toast', text: 'That post is no longer available' });
      post.likes = Array.isArray(post.likes) ? post.likes : [];
      const at = post.likes.indexOf(p.id);
      if (at >= 0) post.likes.splice(at, 1); else post.likes.push(p.id);
      for (const viewer of Object.values(R.players)) send(viewer.ws, { t: 'social_update', post: { ...post, likedByMe: post.likes.includes(viewer.id) } });
    } else if (m.t === 'social_reply') {
      const post = (R.feed || []).find(q => q.id === String(m.id || ''));
      const reply = String(m.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 140);
      if (!post || !reply) return;
      if (!cooldown(p, 'social_reply', 1800)) return send(ws, { t: 'toast', text: 'Please wait before replying again' });
      post.comments = Array.isArray(post.comments) ? post.comments : [];
      post.comments.push({ id: Date.now() + '-' + p.id, name: p.name, text: reply, ts: now });
      if (post.comments.length > 30) post.comments.shift();
      broadcast(room, { t: 'social_update', post });
    } else if (m.t === 'emote') {
      const em = ['wave','dance','cheer','laugh','heart','flex','sit']; if (!em.includes(m.id)) return;
      if (p.jailUntil > now || p.inside || p.travelUntil > now) return send(ws, { t: 'toast', text: 'You cannot emote right now' });
      if (!cooldown(p, 'emote', 1800)) return;
      p.ext.emotes = (p.ext.emotes || 0) + 1;
      broadcast(room, { t: 'emote_fx', id: p.id, name: p.name, emote: m.id, x: p.x, z: p.z, ry: p.ry });
      checkMissions(p, R); savePlayer(room, p);
    } else if (m.t === 'chat') {
      broadcast(room, { t: 'chat', name: p.name, text: String(m.text || '').slice(0, 80) });
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
      if (!dest) return send(ws, { t: 'toast', text: 'That destination is unavailable. Refresh the map and choose another place.' });
      if (!ride) return send(ws, { t: 'toast', text: 'That transport option is unavailable. Choose another ride.' });
      const AIRP = PLACES.find(q => q.id === 'airport');
      if (m.ride === 'jet' && !(dist(p, AIRP) < 60 || dest.id === 'airport')) return send(ws, { t: 'toast', text: '✈️ Jets only fly to or from Lagos Airport' });
      const d = dist(p, dest);
      if (d < 25) return send(ws, { t: 'toast', text: 'You are already there' });
      const fare = Math.max(ride.min, Math.round(d * ride.rate));
      if (!payRide(p, m, fare, ride.name + ' ride')) return;
      p.car = -1;
      const secs = Math.max(3, Math.min(25, Math.round(d / ride.speed)));
      p.travelUntil = now + secs * 1000; p.dest = { x: dest.x, z: dest.z };
      send(ws, { t: 'ride', ride: ride.name, secs, to: dest.name, dx: dest.x, dz: dest.z });
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
      const bm = /^b(\d+)$/.exec(String(m.place || ''));
      if (bm) {                                   // any ordinary building: restaurant, club, office, home...
        const b = BLD[+bm[1]];
        if (!b || dist(b.door, p) > 8) return send(ws, { t: 'toast', text: 'Walk up to the door first' });
        const ownedBusiness = businesses['b' + b.id];
        const businessVenue = { restaurant:'restaurant', fashion:'fashion', tech:'office', supermarket:'supermarket', salon:'salon', lounge:'lounge', carwash:'carwash', pharmacy:'pharmacy' };
        const venueType = ownedBusiness ? (businessVenue[ownedBusiness.kind] || b.type) : b.type;
        const vt = BUILD.TYPES[venueType];
        p.inside = 'v_' + venueType; p.bld = b.id; p.car = -1; p.x = vt.room.x; p.z = vt.room.z + vt.hd - 4;
        send(ws, { t: 'int', place: p.inside, x: p.x, z: p.z, name: ownedBusiness ? ownedBusiness.name : b.name });
        return;
      }
      const info = placeInfo(m.place);
      if (!info || dist(info.door, p) > 7) return send(ws, { t: 'toast', text: 'Walk up to the door first' });
      if (info.house && !ownsHouse(p, info.unit)) return send(ws, { t: 'toast', text: 'Only the tenant can go inside' });
      p.inside = m.place; p.car = -1; p.x = info.room.x; p.z = info.room.z + info.room.hd - 4;
      send(ws, { t: 'int', place: p.inside, x: p.x, z: p.z });
    } else if (m.t === 'floor') {
      const fm = /^v_(office|tower)$/.exec(p.inside || ''), ft = fm && BUILD.TYPES[fm[1]];
      if (!ft || (m.floor !== 0 && m.floor !== 1)) return send(ws, { t: 'toast', text: 'Floor access is not available here' });
      const stair = { x: ft.room.x + ft.hw - 3.2, z: ft.room.z + ft.hd - 4.2 }, lift = { x: ft.room.x - ft.hw + 3.2, z: ft.room.z - ft.hd + 3.2 };
      if (Math.min(dist(p, stair), dist(p, lift)) > 5) return send(ws, { t: 'toast', text: 'Walk to the stairs or elevator first' });
      p.floor = m.floor; p.moving = false;
    } else if (m.t === 'exit') {
      if (!p.inside) return;
      p.floor = 0;
      const vb = /^v_/.test(p.inside) && p.bld != null ? BLD[p.bld] : null;
      const info = vb ? { out: vb.out } : placeInfo(p.inside); p.inside = null; p.bld = null;
      if (info) { p.x = info.out.x; p.z = info.out.z; send(ws, { t: 'tp', x: p.x, z: p.z }); }
    } else if (m.t === 'venue') {
      const vm = /^v_(\w+)$/.exec(p.inside || ''), vt = vm && BUILD.TYPES[vm[1]];
      if (!vt) return send(ws, { t: 'toast', text: 'Nothing to do here' });
      if (dist(p, { x: vt.room.x + vt.spot.dx, z: vt.room.z + vt.spot.dz }) > vt.spot.r + 2) return send(ws, { t: 'toast', text: 'Walk up to the spot first' });
      if (!cooldown(p, 'venue_' + vm[1], vt.cd || 4000)) return send(ws, { t: 'toast', text: 'Give it a moment...' });
      if (vt.info) return send(ws, { t: 'toast', text: vt.info });
      const L = p.life;
      if (vt.minEnergy && L && L.energy < vt.minEnergy) return send(ws, { t: 'toast', text: '😴 You are too tired. Rest first.' });
      if (vt.cost && !charge(p, vt.cost, vt.label)) return;
      const vpay = vt.pay ? vt.pay * INCOME_MULT : 0;
      if (vpay) addMoney(p, vpay, 'Temp shift: ' + vt.label);
      // Customers support player-owned venues; earnings accrue safely to the owner's business wallet.
      const ownedVenue = p.bld != null && businesses['b' + p.bld];
      if (ownedVenue && ownedVenue.ownerKey !== pKey(p) && cooldown(p, 'biz_' + ownedVenue.id, 300000)) {
        const staffQuality = businessQuality(ownedVenue);
        const cut = Math.max(100, Math.min(3500, Math.round((vt.cost || 500) * (0.12 + staffQuality))));
        ownedVenue.balance = Math.min(1e9, (Math.floor(+ownedVenue.balance) || 0) + cut);
        ownedVenue.customers = Math.min(1e9, (Math.floor(+ownedVenue.customers) || 0) + 1);
        ownedVenue.lastCustomerAt = now;
        saveBusinesses();
        for (const RR of Object.values(rooms)) if (RR) for (const viewer of Object.values(RR.players || {})) sendBusinesses(viewer);
        const owner = Object.values(rooms).flatMap(RR => Object.values(RR.players || {})).find(q => pKey(q) === ownedVenue.ownerKey);
        if (owner) send(owner.ws, { t:'toast', text:'🏪 '+ownedVenue.name+' earned '+fmtN(cut)+' from a customer' });
      }
      const fx = vt.fx || {};
      if (fx.food) p.food = Math.max(0, Math.min(100, p.food + fx.food));
      if (L) for (const k of ['energy', 'hygiene', 'fun']) if (fx[k]) L[k] = Math.max(0, Math.min(100, L[k] + fx[k]));
      send(ws, { t: 'toast', text: vpay ? vt.msg.replace(/₦[\d,]+/, '₦' + vpay.toLocaleString('en-NG')) : vt.msg });
      sendLife(p, rooms[room]);
    } else if (m.t === 'bank') {
      if (p.inside !== 'bank' || dist(p, ATM) > 12) return send(ws, { t: 'toast', text: 'Use an ATM inside the bank' });
      const a = m.amt === 'all' ? (m.op === 'dep' ? p.money : p.bank) : Math.floor(+m.amt);
      if (!(a > 0) || a > 1e9) return send(ws, { t: 'toast', text: 'Pick an amount' });
      if (m.op === 'dep') {
        if (a > p.money) return send(ws, { t: 'toast', text: 'Not enough cash on you' });
        p.money -= a; p.bank += a; send(ws, { t: 'toast', text: `🏦 Saved ₦${a} (thieves cannot take it)` });
      } else if (m.op === 'wd') {
        if (a > p.bank) return send(ws, { t: 'toast', text: 'Not enough in your account' });
        p.bank -= a; p.money += a; send(ws, { t: 'toast', text: `🏦 Took out ₦${a}` });
      } else return send(ws, { t: 'toast', text: 'Choose deposit or withdrawal' });
      savePlayer(room, p);
    } else if (m.t === 'daily') {
      const E = p.ext, d = lagosDay();
      if (m.op === 'claim') {
        if (E.daily === d) return send(ws, { t: 'toast', text: '🎁 You already claimed today. Come back tomorrow!' });
        const streak = E.daily === d - 1 ? E.streak + 1 : 1, amt = 500 + Math.min(streak - 1, 6) * 250 + (streak % 7 === 0 ? 5000 : 0);
        addMoney(p, amt, 'Daily reward'); E.daily = d; E.streak = streak;
        send(ws, { t: 'toast', text: '🎁 Day ' + streak + ' reward: ' + fmtN(amt) + (streak % 7 === 0 ? ' 🎉 weekly bonus!' : '') });
      }
      send(ws, dailyInfo(p));
    } else if (m.t === 'gig') {
      const now_ = Date.now();
      if (m.op === 'list') return send(ws, { t: 'gig', op: 'list', list: Object.entries(GIGS).map(([id, g]) => ({ id, name: g.name, icon: g.icon, secs: g.secs, lo: g.pay[0], hi: g.pay[1] })) });
      if (p.jailUntil > now_) return send(ws, { t: 'toast', text: 'No jobs in jail 😅' });
      if (p.inside) return send(ws, { t: 'toast', text: 'Go outside to work' });
      if (m.op === 'start') {
        const g = GIGS[m.id]; if (!g) return;
        if (p.gig && p.gig.until > now_) return send(ws, { t: 'toast', text: 'Finish your current shift first' });
        if (!cooldown(p, 'gig_' + m.id, 40000)) return send(ws, { t: 'toast', text: 'You are tired of that job. Try another or wait a bit' });
        p.gig = { id: m.id, until: now_ + g.secs * 1000 };
        send(ws, { t: 'gig', op: 'started', id: m.id, secs: g.secs, name: g.name });
      } else if (m.op === 'done') {
        const q = p.gig; if (!q) return;
        if (now_ < q.until - 800) return send(ws, { t: 'toast', text: 'Shift is not finished yet' });
        const g = GIGS[q.id], amt = g.pay[0] + Math.floor(Math.random() * (g.pay[1] - g.pay[0] + 1));
        p.gig = null; addMoney(p, amt, 'Shift ' + g.name);
        send(ws, { t: 'gig', op: 'paid', amt, name: g.name }); send(ws, { t: 'toast', text: g.icon + ' ' + g.name + ' done: +' + fmtN(amt) });
      }
    } else if (m.t === 'wallet') {
      sendWallet(p);
    } else if (m.t === 'pin') {
      ensureAcct(p); const E = p.ext, np_ = String(m.pin || '');
      if (!/^\d{4}$/.test(np_)) return send(ws, { t: 'toast', text: 'PIN must be exactly 4 digits' });
      if (E.pinH && !pinCheck(p, m.old)) return;
      E.pinS = crypto.randomBytes(8).toString('hex'); E.pinH = pinHash(E, np_);
      send(ws, { t: 'toast', text: '🔐 Your 4-digit PIN is saved' }); sendWallet(p);
    } else if (m.t === 'xfer') {
      ensureAcct(p);
      const say = text => send(ws, { t: 'toast', text }), to = String(m.to || '').replace(/\D/g, ''), amt = Math.floor(+m.amt);
      if (!/^\d{10}$/.test(to)) return say('Enter a 10-digit account number');
      if (to === p.ext.acct) return say('You cannot send money to yourself');
      if (!(amt >= 1) || amt > 5e6) return say('Amount must be ₦1 to ₦5,000,000');
      if (!pinCheck(p, m.pin)) return;
      if (p.bank < amt) return say('Not enough in your wallet');
      if (!cooldown(p, 'xfer', 1500)) return say('Slow down a little');
      let rp = null, sv = null;
      for (const r in rooms) for (const id in rooms[r].players) { const q = rooms[r].players[id]; if (q.ext && q.ext.acct === to) rp = q; }
      if (!rp) { for (const k in saves) { const s = saves[k]; if (s && s.ext && s.ext.acct === to) { sv = k; break; } } }
      if (!rp && !sv) return say('Account not found. Check the number');
      p.bank -= amt;
      if (rp) { rp.bank += amt; send(rp.ws, { t: 'toast', text: '💳 ' + p.name + ' sent you ' + fmtN(amt) }); sendWallet(rp); }
      else { saves[sv].bank = (saves[sv].bank || 0) + amt; dirtySaves.add(sv); }
      say('✅ Sent ' + fmtN(amt) + ' to account ' + to.slice(0, 3) + '****' + to.slice(-3)); sendWallet(p);
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
      if (p.role === 'police') {
        const t = nearest(room, p, q => q.role === 'thief' && free(q), 10);
        if (!t) return me('No thief close enough');
        const take = Math.floor(t.money * 0.25); t.money -= take; p.money += take + 200;
        jail(room, t, 15000); say(`🚔 ${p.name} arrested ${t.name}! (+₦${take + 200})`);
      } else if (p.role === 'thief') {
        if (p.inside === 'bank' && dist(p, VAULT) < 7) {
          if (!cooldown(p, 'vault', 60000)) return me('The vault is empty for now, wait...');
          p.money += 1200; return say(`🚨 ${p.name} robbed the BANK VAULT! (+₦1200)`);
        }
        if (p.inside === 'mall' && dist(p, MALLCASH) < 8) {
          if (!cooldown(p, 'shop', 20000)) return me('Cashier was just robbed, wait...');
          p.money += 400; return say(`💰 ${p.name} robbed the Grand Market cashier! (+₦400)`);
        }
        const shop = !p.inside && SHOPS.find(s => dist(s, p) < 11);
        if (shop) {
          if (!cooldown(p, 'shop', 20000)) return me('Shop was just robbed, wait...');
          p.money += 400; say(`💰 ${p.name} robbed a shop! (+₦400)`);
        } else {
          const v = nearest(room, p, q => free(q) && q.money >= 50 && !(q.ext && q.ext.guardUntil > now), 7);
          if (!v) return me('Go near a shop or a player to rob');
          if (!cooldown(p, 'rob', 8000)) return me('Wait a few seconds...');
          const loot = Math.min(500, Math.floor(v.money * 0.15)); v.money -= loot; p.money += loot;
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
  simulateBusinessCustomers(now);
  for (const code in rooms) {
    const R = rooms[code];
    for (const p of Object.values(R.players)) {
      if (p.jailUntil && p.jailUntil <= now) { p.jailUntil = 0; p.x = 0; p.z = 8; p.inside = null; send(p.ws, { t: 'tp', x: 0, z: 8 }); send(p.ws, { t: 'toast', text: 'You are free!' }); }
    }
    for (const p of Object.values(R.players)) {
      if (p.travelUntil && p.travelUntil <= now) { p.travelUntil = 0; p.x = p.dest.x + (Math.random() - 0.5) * 3; p.z = p.dest.z + (Math.random() - 0.5) * 3; send(p.ws, { t: 'tp', x: p.x, z: p.z }); send(p.ws, { t: 'toast', text: '🛺 You have arrived' }); }
    }
    for (const p of Object.values(R.players)) if (p.ride) {
      const d = Object.values(R.players).find(q => q.id === p.ride);
      if (!d || d.car < 0 || d.inside || d.ride) { p.ride = null; if (d) { p.x = d.x + 3; p.z = d.z + 1; } send(p.ws, { t: 'tp', x: p.x, z: p.z }); send(p.ws, { t: 'toast', text: '🚪 You left the car' }); }
      else { p.x = d.x; p.z = d.z; p.ry = d.ry; p.car = -1; }
    }
    const owners = {}, occ = {};
    for (const id in tenants) { const t = activeTenant(id), u = UNITS[+id]; if (!t || !u) continue; const h = HOUSES[u.house]; occ[h.id] = (occ[h.id] || 0) + 1; if (h.units === 1) owners[h.id] = t.name; }
    const list = Object.values(R.players).map(p => ({
      id: p.id, name: p.name, role: p.role, x: p.x, z: p.z, ry: p.ry, moving: p.moving, floor: p.floor || 0,
      car: p.car, money: p.money, bank: p.bank, food: p.food, look: p.look, hidden: p.travelUntil > now, jailed: p.jailUntil > now, ride: p.ride || 0, bay: (p.ext && p.ext.cars) || [], phone: !!p.phone, mic: !!p.mic, guard: !!(p.ext && p.ext.guardUntil > now),
      pose: (p.poseUntil > now && p.pose) ? p.pose : ''
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
  { id: 'empire', path: 'nepo', name: 'Grow the inheritance into ₦250,000,000', reward: 250000, ok: p => p.money + p.bank >= 250000000 },   // 5x START.nepo; keep in step with it
  { id: 'ownname', path: 'lapo', name: 'Earn ₦300,000 from your own shifts and jobs', reward: 100000, ok: p => (p.life.earned || 0) >= 300000 },
  { id: 'promo', name: 'Get promoted', reward: 2000, ok: p => !!p.life.promoted },
  { id: 'rich', name: 'Hold ₦25,000 in total', reward: 5000, ok: p => p.money + p.bank >= 25000 },
  { id: 'garage', name: 'Own a vehicle', reward: 2500, ok: p => !!(p.ext && p.ext.cars.length) },
  { id: 'homeStyle', name: 'Place furniture in your 3D home', reward: 1500, ok: p => !!(p.ext && Object.values(p.ext.decor).some(a => a.length > 0)) },
  { id: 'social', name: 'Share 3 city feed posts', reward: 1000, ok: p => !!(p.ext && p.ext.socialPosts >= 3) },
  { id: 'emote', name: 'Use 5 character emotes', reward: 750, ok: p => !!(p.ext && p.ext.emotes >= 5) }
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// sleeping / watching TV is acted out: the client shows the character lying in a bed or sitting on a sofa, and everyone nearby sees it
function setPose(p, pose, ms) { p.pose = pose; p.poseUntil = Date.now() + ms; send(p.ws, { t: 'pose', pose, secs: ms / 1000 }); }
const newLife = () => ({ earned: 0, energy: 100, hygiene: 100, fun: 100, social: 100, bladder: 100, career: null, skills: {}, studySessions: 0, shifts: 0, bought: 0, promoted: false, done: {} });
function restoreLife(L, s) {
  L.energy = clamp(+s.energy || 0, 0, 100); L.hygiene = clamp(+s.hygiene || 0, 0, 100); L.fun = clamp(+s.fun || 0, 0, 100); L.social = s.social == null ? 100 : clamp(+s.social || 0, 0, 100); L.bladder = s.bladder == null ? 100 : clamp(+s.bladder || 0, 0, 100);
  if (s.career && CAREERS[s.career.id]) L.career = { id: s.career.id, xp: Math.max(0, Math.floor(+s.career.xp) || 0) };
  L.skills = {}; if (s.skills && typeof s.skills === 'object') for (const id of Object.keys(CAREERS)) L.skills[id] = clamp(Math.floor(+s.skills[id]) || 0, 0, 10);
  L.studySessions = Math.max(0, Math.floor(+s.studySessions) || 0);
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
const INCOME_MULT = 25;   // every shift/delivery pays 25x so the big cars are reachable. Lower it to make the game harder.
const START = { nepo: 50000000, lapo: 1500000 };      // starting cash
const DADDY = 0.6;                                    // Lapo babes: daddy pays 60% of every cost
const PATHS = {
  nepo: { name: 'Nepo baby', emoji: '👑', goal: 'Mummy and Daddy left you ₦50,000,000. Turn it into an empire: grow your wealth to ₦250,000,000 and make your own name in Lagos.' },
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
  sales1: ['Welcome to Elite Auto Gallery! Walk up to any car and press the button for price and specs.', 'You need a Driver\'s License first (Phone, ID & Certificates). Then pick your car!', 'The Chiron is our crown jewel, oga. Only for big boys.'],
  salesmgr: ['Every car here is brand new and comes with a full tank.', 'Your car will be waiting for you outside once you buy it.', 'No haggling, the price is the price.'],
  gallerysec: ['Please do not touch the cars without buying o.', 'Good day, sir. Enjoy your visit.'],
  mallguard: ['Good day, oga. No wahala inside this market.', 'Thieves must not enter here! 👀', 'You see anything suspicious? Tell me.'],
  bankguard: ['Welcome to Lagoon Bank. ATMs are on the left wall.', 'Keep your money safe, na so e dey go.', 'No be me you go rob o!'],
  agent: []
};
for (const k of BUILD.ORDER) LINES['v_' + k] = BUILD.TYPES[k].lines;
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
    needs: { food: Math.round(p.food), energy: Math.round(L.energy), hygiene: Math.round(L.hygiene), fun: Math.round(L.fun), social: Math.round(L.social), bladder: Math.round(L.bladder) },
    career: c ? { id: L.career.id, title: c.title, level: c.lv[lv][0], pay: c.lv[lv][1], xp: L.career.xp, next: c.lv[lv + 1] ? c.lv[lv + 1][2] : null, skill: L.skills[L.career.id] || 0 } : null,
    careers: Object.entries(CAREERS).map(([id, x]) => ({ id, title: x.title, pay: x.lv[0][1] })),
    missions: MISSIONS.filter(x => !x.path || x.path === p.path).map(x => ({ name: x.name, reward: x.reward, done: !!L.done[x.id] })),
    path: { id: p.path, name: (PATHS[p.path] || {}).name, emoji: (PATHS[p.path] || {}).emoji, goal: (PATHS[p.path] || {}).goal }, home: homeInfo(p),
    log: (p.ledger || []).slice(-8).reverse(), inv: p.inv, atShop: atShop(p), cap: BAG_CAP });
}
function cTitleFor(id) { return CAREERS[id] ? CAREERS[id].title : 'Career'; }
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
    const skillRank = L.skills[L.career.id] || 0;
    const skilledPay = Math.round(pay * (1 + skillRank * 0.025));
    addMoney(p, skilledPay, c.title + ' shift');
    L.energy -= 15; L.fun -= 6; L.hygiene -= 8; p.food = Math.max(0, p.food - 8); L.career.xp++; L.shifts++;
    const nl = levelOf(L.career);
    if (nl > lv) { L.promoted = true; broadcast(room, { t: 'toast', text: `🎉 ${p.name} was promoted to ${c.lv[nl][0]} (${c.title})!` }); }
    else me(`💼 Shift done: +₦${skilledPay}${skillRank ? ` (skill bonus +${skillRank * 2.5}%)` : ''}`);
  } else if (m.op === 'study') {
    if (!L.career) return me('Choose a career before enrolling in job training.');
    if (!(ownHome || p.inside === 'mall')) return me('Study at home or inside the Grand Market learning lounge.');
    if ((L.skills[L.career.id] || 0) >= 10) return me('Your professional skill is already at maximum level.');
    if (!cooldown(p, 'study', 15000)) return me('Take a short break before your next lesson.');
    if (L.energy < 8) { p.cd.study = 0; return me('You need more energy before studying.'); }
    if (!charge(p, 350, 'Career training')) return;
    L.skills[L.career.id] = (L.skills[L.career.id] || 0) + 1; L.studySessions++; L.energy -= 8;
    me(`📚 Training complete: ${cTitleFor(L.career.id)} skill level ${L.skills[L.career.id]}/10. Shift pay bonus +2.5%.`);
  } else if (m.op === 'sleep') {
    if (!ownHome) return me('Go inside your own house to sleep 🛏️');
    if (!cooldown(p, 'sleep', 20000)) return me('You are not sleepy yet');
    L.energy += 50; me('😴 You slept. Energy restored'); setPose(p, 'sleep', 9000);
  } else if (m.op === 'shower') {
    if (!ownHome) return me('Go inside your own house to shower 🚿');
    if (!cooldown(p, 'shower', 10000)) return me('Already clean');
    L.hygiene = 100; me('🚿 Fresh and clean');
  } else if (m.op === 'fun') {
    if (!(ownHome || p.inside === 'mall')) return me('Relax at home or in the Grand Market');
    if (!cooldown(p, 'fun', 10000)) return me('Take a short break first');
    if (!charge(p, 50, 'Entertainment')) return;
    L.fun += 30; me('🎮 That was fun!'); if (ownHome) setPose(p, 'sit', 12000);
  } else if (m.op === 'toilet') {
    if (!ownHome) return me('Use the toilet inside your own home 🚽');
    if (!cooldown(p, 'toilet', 8000)) return me('Give it a moment');
    L.bladder = 100; me('🚽 All sorted. You feel comfortable again.');
  } else if (m.op === 'social') {
    const friendNearby = Object.values(R.players).some(q => q.id !== p.id && q.jailUntil <= now && !q.travelUntil && dist(p, q) < 12);
    if (!friendNearby) return me('Find another player nearby and say hello first 👋');
    if (!cooldown(p, 'social', 12000)) return me('You just had a chat. Take a little break.');
    L.social += 35; L.fun += 5; me('👋 Nice conversation! Your social need improved.');
  }
  L.energy = clamp(L.energy, 0, 100); L.hygiene = clamp(L.hygiene, 0, 100); L.fun = clamp(L.fun, 0, 100); L.social = clamp(L.social, 0, 100); L.bladder = clamp(L.bladder, 0, 100);
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
    if (m.source !== 'phone' && !atShop(p)) return me('Walk to a shop or use the Lagos Market app');
    if (it.cat === 'tool' && p.inv[m.id]) return me('You already own that');
    if (bagCount(p) + n > BAG_CAP) return me(`Bag full (${BAG_CAP} items)`);
    const cost = it.price * n;
    if (!charge(p, cost, 'Bought ' + it.name + (n > 1 ? ' x' + n : ''))) return;
    p.inv[m.id] = (p.inv[m.id] || 0) + n; L.bought++;
    me(`${it.icon} Bought ${it.name}${n > 1 ? ' x' + n : ''}`);
  } else if (m.op === 'sell') {
    if (m.source !== 'phone' && !atShop(p)) return me('Walk to a shop or use the Lagos Market app to sell');
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
setInterval(() => { for (const code in rooms) for (const o of Object.values(rooms[code].players)) { const L = o.life; if (!L) continue; L.energy = clamp(L.energy - 0.6, 0, 100); L.hygiene = clamp(L.hygiene - 0.4, 0, 100); L.fun = clamp(L.fun - 0.5, 0, 100); L.social = clamp(L.social - 0.12, 0, 100); L.bladder = clamp(L.bladder - 0.35, 0, 100); } }, 5000);
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


// ================= v0.7 EXTRAS =================
// vehicles must be bought (and you need a Driver's License), certificates, invest, DMs, pay, food, hire, decor, voice chat signalling
// Naira prices follow the Lagos market list supplied by the game owner.
const VEHICLES = {
  8: { name: 'Okada Bike (Bajaj Boxer)', icon: '🏍️', price: 350000 },
  6: { name: 'Keke Napep', icon: '🛺', price: 450000 },
  0: { name: 'Toyota Corolla', icon: '🚗', price: 900000 },
  5: { name: 'Danfo Bus', icon: '🚌', price: 1500000 },
  3: { name: 'Honda Accord', icon: '🚗', price: 1800000 },
  4: { name: 'Lexus RX 350', icon: '🚙', price: 7500000 },
  11: { name: 'Fire Engine', icon: '🚒', price: 9000000 },
  1: { name: 'Toyota Prado SUV', icon: '🚙', price: 15000000 },
  13: { name: 'Dominus GT', icon: '🏎️', price: 60000000 },
  14: { name: 'Classic Coupe', icon: '🚘', price: 40000000 },
  10: { name: 'Dodge Challenger', icon: '🏎️', price: 1200000000 },
  2: { name: 'Nissan GT-R', icon: '🏎️', price: 1800000000 },
  9: { name: 'BMW M4 Competition', icon: '🚘', price: 3800000000 },
  7: { name: 'Lamborghini', icon: '🏎️', price: 6500000000 },
  12: { name: 'Bugatti Chiron', icon: '🏎️', price: 25000000000 }
};
const LICENSE_PRICE = 20000;
RIDES.driver = { name: 'Private Driver', rate: 0.12, min: 150, speed: 36 };
const MARKET = {
  dangote: { name: 'Dangote Cement', icon: '🏭', base: 38000, vol: 0.012 },
  mtn: { name: 'MTN Nigeria', icon: '📡', base: 25000, vol: 0.010 },
  gtb: { name: 'GTBank', icon: '🏦', base: 4500, vol: 0.014 },
  land: { name: 'Lekki Land Share', icon: '🏗️', base: 800000, vol: 0.006 },
  crypto: { name: 'Crypto Coin', icon: '🪙', base: 1500000, vol: 0.035 }
};
const mkHist = {};
for (const id in MARKET) { MARKET[id].price = MARKET[id].base; mkHist[id] = Array(30).fill(MARKET[id].base); }
setInterval(() => {
  for (const id in MARKET) {
    const a = MARKET[id], drift = (a.base - a.price) / a.base * 0.02;
    a.price = Math.round(Math.max(a.base * 0.25, Math.min(a.base * 4, a.price * (1 + drift + (Math.random() - 0.5) * 2 * a.vol))));
    const h = mkHist[id]; h.push(a.price); if (h.length > 30) h.shift();
  }
}, 8000);
const DECOR = {
  plant: { name: 'Potted Plant', icon: '🪴', price: 3500 }, lamp: { name: 'Floor Lamp', icon: '💡', price: 6500 },
  rug: { name: 'Persian Rug', icon: '🟥', price: 15000 }, sofa: { name: 'Leather Sofa', icon: '🛋️', price: 85000 },
  tv: { name: 'Smart TV', icon: '📺', price: 120000 }, bed: { name: 'King Bed', icon: '🛏️', price: 150000 },
  fridge: { name: 'Fridge', icon: '🧊', price: 95000 }, speaker: { name: 'Sound System', icon: '🔊', price: 60000 },
  chandelier: { name: 'Chandelier', icon: '🕯️', price: 250000 }, trophy: { name: 'Trophy', icon: '🏆', price: 20000 },
  painting: { name: 'Painting', icon: '🖼️', price: 40000 }, desk: { name: 'Work Desk', icon: '🖥️', price: 70000 },
  closet: { name: 'Wardrobe', icon: '🚪', price: 110000 }, dryer: { name: 'Washer-Dryer', icon: '🧺', price: 90000 },
  computer: { name: 'Gaming PC', icon: '💻', price: 180000 }
};
const clampN = (v, m) => Math.max(-m, Math.min(m, +v || 0));
function loadExt(s) {
  const e = { cars: [], storedCars: [], carPaint: {}, license: 0, since: Date.now(), stocks: {}, decorInv: {}, decor: {}, guardUntil: 0, role: '', acct: '', pinH: '', pinS: '', daily: 0, streak: 0, socialPosts: 0, emotes: 0 };
  if (!s || typeof s !== 'object') return e;
  e.cars = (Array.isArray(s.cars) ? s.cars.map(Number) : []).filter((c, i, a) => VEHICLES[c] && a.indexOf(c) === i);
  e.storedCars = (Array.isArray(s.storedCars) ? s.storedCars.map(Number) : []).filter((c, i, a) => VEHICLES[c] && e.cars.includes(c) && a.indexOf(c) === i);
  e.carPaint = {}; for (const [id,color] of Object.entries(s.carPaint || {})) { const col=+id; if (VEHICLES[col] && e.cars.includes(col) && /^#[0-9a-f]{6}$/i.test(String(color))) e.carPaint[col]=String(color).toLowerCase(); }
  e.license = +s.license || 0; e.since = +s.since || e.since;
  for (const id in MARKET) { const q = Math.floor(+(s.stocks || {})[id]) || 0; if (q > 0) e.stocks[id] = Math.min(q, 1e7); }
  for (const id in DECOR) { const q = Math.floor(+(s.decorInv || {})[id]) || 0; if (q > 0) e.decorInv[id] = Math.min(q, 200); }
  const d = s.decor && typeof s.decor === 'object' ? s.decor : {};
  for (const u in d) if (Array.isArray(d[u])) e.decor[u] = d[u].filter(x => x && DECOR[x.id]).slice(0, 60).map(x => ({ id: x.id, x: clampN(x.x, 8), z: clampN(x.z, 8), ry: +x.ry || 0 }));
  e.guardUntil = +s.guardUntil > Date.now() ? +s.guardUntil : 0;
  e.role = ROLES.includes(s.role) ? s.role : '';
  e.acct = /^\d{10}$/.test(String(s.acct || '')) ? String(s.acct) : '';
  e.pinH = /^[0-9a-f]{64}$/.test(String(s.pinH || '')) ? String(s.pinH) : ''; e.pinS = /^[0-9a-f]{0,32}$/.test(String(s.pinS || '')) ? String(s.pinS) : '';
  e.daily = Math.max(0, Math.floor(+s.daily) || 0); e.streak = Math.max(0, Math.min(9999, Math.floor(+s.streak) || 0)); e.socialPosts = Math.max(0, Math.floor(+s.socialPosts) || 0); e.emotes = Math.max(0, Math.floor(+s.emotes) || 0);
  return e;
}


// ================= DAILY REWARD + JOB BOARD =================
const GIGS = {
  okada: { name: 'Okada dispatch', icon: '🏍️', secs: 12, pay: [250, 400] },
  stall: { name: 'Market stall', icon: '🛍️', secs: 10, pay: [180, 320] },
  wash:  { name: 'Car wash', icon: '🚗', secs: 8, pay: [120, 220] },
  buka:  { name: 'Buka helper', icon: '🍲', secs: 10, pay: [200, 350] },
  tech:  { name: 'Phone repair', icon: '📱', secs: 15, pay: [400, 700] }
};
const lagosDay = () => Math.floor((Date.now() + 3600e3) / 864e5);   // Lagos is UTC+1
function dailyInfo(p) {
  const E = p.ext, d = lagosDay(), can = E.daily !== d, next = (E.daily === d - 1 || E.daily === d) ? E.streak + (can ? 1 : 0) : 1;
  const reward = n => 500 + Math.min(n - 1, 6) * 250 + (n % 7 === 0 ? 5000 : 0);
  return { t: 'daily', can, streak: can && !(E.daily === d - 1) ? 0 : E.streak, day: ((Math.max(1, next) - 1) % 7) + 1, reward: reward(Math.max(1, next)) };
}
// ================= WALLET: account number + 4-digit PIN (like Opay / PalmPay) =================
function ensureAcct(p) {
  const E = p.ext; if (!E) return '';
  if (E.acct) return E.acct;
  const used = new Set();
  try { for (const k in saves) { const a = saves[k] && saves[k].ext && saves[k].ext.acct; if (a) used.add(a); } } catch (e) {}
  for (const r in rooms) for (const id in rooms[r].players) { const q = rooms[r].players[id]; if (q.ext && q.ext.acct) used.add(q.ext.acct); }
  let a; do { a = ['70', '80', '81', '90', '91'][crypto.randomInt(5)] + String(crypto.randomInt(0, 1e8)).padStart(8, '0'); } while (used.has(a));
  E.acct = a; return a;
}
const pinHash = (E, pin) => crypto.createHash('sha256').update(E.pinS + ':' + pin + ':' + E.acct).digest('hex');
function pinCheck(p, pin) {
  const E = p.ext, now = Date.now(), say = text => send(p.ws, { t: 'toast', text });
  ensureAcct(p);
  if (!E.pinH) { say('Create your 4-digit PIN first (tap the 💳 Wallet button)'); return false; }
  if ((p.pinLock || 0) > now) { say('🔒 Too many wrong PINs. Try again in ' + Math.ceil((p.pinLock - now) / 1000) + 's'); return false; }
  if (!/^\d{4}$/.test(String(pin || ''))) { say('Enter your 4-digit PIN'); return false; }
  if (pinHash(E, String(pin)) !== E.pinH) {
    p.pinFail = (p.pinFail || 0) + 1;
    if (p.pinFail >= 3) { p.pinLock = now + 300000; p.pinFail = 0; say('🔒 Wrong PIN 3 times. Wallet locked for 5 minutes'); }
    else say('❌ Wrong PIN. ' + (3 - p.pinFail) + ' tries left');
    return false;
  }
  p.pinFail = 0; return true;
}
function sendWallet(p) { ensureAcct(p); send(p.ws, { t: 'wallet', acct: p.ext.acct, name: p.name, bank: p.bank, money: p.money, hasPin: !!p.ext.pinH }); }
// pay for a ride: cash, or from the bank account with the PIN
function payRide(p, m, fare, why) {
  if (m.pay === 'bank') {
    if (!pinCheck(p, m.pin)) return false;
    if (p.bank < fare) { send(p.ws, { t: 'toast', text: 'Not enough in your wallet (' + fmtN(fare) + ' needed)' }); return false; }
    p.bank -= fare; send(p.ws, { t: 'toast', text: '💳 Paid ' + fmtN(fare) + ' from your wallet' }); sendWallet(p); return true;
  }
  return charge(p, fare, why);
}
const idNo = p => 'LG-' + (parseInt(crypto.createHash('sha1').update(pKey(p)).digest('hex').slice(0, 8), 16) % 90000000 + 10000000);
function sendCert(p) { const E = p.ext; send(p.ws, { t: 'x_cert', id: idNo(p), name: p.name, since: E.since, license: E.license, role: p.role, path: p.path, price: LICENSE_PRICE }); }
function sendCars(p) { const E = p.ext, u = myUnit(p), h = u && HOUSES[u.house], capacity = !h ? 0 : h.kind === 'villa' ? 4 : h.kind === 'lobby' ? 3 : 2; send(p.ws, { t: 'x_cars', cars: E.cars, storedCars: E.storedCars || [], garage: h ? { home: unitName(h,u), area: h.area, capacity, used: (E.storedCars || []).length } : null, carPaint: E.carPaint || {}, license: !!E.license, list: Object.entries(VEHICLES).map(([c, v]) => ({ col: +c, name: v.name, icon: v.icon, price: v.price })) }); }
function sendMarket(p) { const E = p.ext, prices = {}; for (const id in MARKET) prices[id] = { name: MARKET[id].name, icon: MARKET[id].icon, price: MARKET[id].price, hist: mkHist[id] }; send(p.ws, { t: 'x_mk', prices, hold: E.stocks, cash: p.money }); }
function sendDecor(p) { const E = p.ext; send(p.ws, { t: 'x_decor', shop: Object.entries(DECOR).map(([id, d]) => ({ id, name: d.name, icon: d.icon, price: d.price })), inv: E.decorInv, placed: E.decor }); }
function sendExtras(p) { sendCert(p); sendCars(p); sendDecor(p); sendBusinesses(p); send(p.ws, { t: 'x_role', role: p.role }); }
function applyFx(p, f) {
  const L = p.life; if (!f || !L) return;
  if (f.food) p.food = Math.min(100, p.food + f.food);
  if (f.energy) L.energy = Math.min(100, L.energy + f.energy);
  if (f.hygiene) L.hygiene = Math.min(100, L.hygiene + f.hygiene);
  if (f.fun) L.fun = Math.min(100, L.fun + f.fun);
}
const HUSTLES = {
  recharge: { name: 'Sell recharge cards', icon: '📱', min: 200, max: 700, cd: 12000 },
  suya: { name: 'Roast suya at the junction', icon: '🍢', min: 400, max: 900, cd: 15000 },
  pos: { name: 'Run a POS stand', icon: '💳', min: 500, max: 1500, cd: 25000 },
  tutor: { name: 'Give lessons', icon: '📚', min: 800, max: 1200, cd: 40000 },
  content: { name: 'Post content online', icon: '🎬', min: 300, max: 3000, cd: 30000 }
};
const EXTRA = new Set(['getx', 'buycar', 'carpaint', 'garage', 'cert', 'setrole', 'inv', 'dm', 'pay', 'order', 'hire', 'decor', 'rtc', 'phone', 'mic', 'hustle', 'business']);
function extraMsg(room, p, m, now) {
  if (!EXTRA.has(m.t)) return false;
  const E = p.ext = p.ext || loadExt(null), R = rooms[room];
  const toast = t => send(p.ws, { t: 'toast', text: t });
  const jailed = p.jailUntil > now;
  if (m.t === 'business') {
    if (jailed) return toast('You cannot run a business while in jail'), true;
    const key = pKey(p), owned = Object.values(businesses).find(b => b && b.ownerKey === key);
    if (m.op === 'create') {
      if (owned) return toast('You already own a business. Manage it here.'), true;
      const kinds = { restaurant:['🍲','Restaurant'], fashion:['👗','Fashion store'], tech:['📱','Tech shop'], supermarket:['🛒','Supermarket'], salon:['💇🏾','Salon'], lounge:['🎶','Lounge'], carwash:['🚗','Car wash'], pharmacy:['💊','Pharmacy'] };
      const kind = kinds[String(m.kind||'restaurant')] ? String(m.kind) : 'restaurant';
      const name = String(m.name||'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,28);
      const area = String(m.area||'').trim().slice(0,48);
      const candidates = BLD.filter(q => q.area === area && q.type !== 'home' && q.type !== 'terminal');
      const b = candidates.find(q => !businesses['b'+q.id]);
      if (!b) return toast('That area has no available company location. Choose another area.'), true;
      if (name.length < 3) return toast('Business name must be at least 3 characters'), true;
      if (Object.values(businesses).some(x => x && x.name.toLowerCase() === name.toLowerCase())) return toast('That business name is already taken'), true;
      if (!charge(p, 150000, 'Started business: '+name)) return true;
      const [icon,label]=kinds[kind];
      businesses['b'+b.id]={id:'b'+b.id,ownerKey:key,ownerName:p.name,name,kind,icon,area:b.area,locationName:b.name,x:Math.round(b.out.x),z:Math.round(b.out.z),balance:0,staff:[],created:now};
      saveBusinesses(); broadcastBusinesses(room);
      broadcast(room,{t:'toast',text:'🏢 '+p.name+' registered '+name+' in '+b.area+'!'});
      savePlayer(room,p); return true;
    }
    if (!owned) return toast('You do not own a business yet'), true;
    if (m.op === 'collect') {
      const amount=Math.max(0,Math.floor(+owned.balance||0));
      if (!amount) return toast('Your business has no earnings to collect yet'), true;
      owned.balance=0;addMoney(p,amount,'Business earnings: '+owned.name);saveBusinesses();savePlayer(room,p);sendBusinesses(p);toast('💰 Collected '+fmtN(amount)+' from '+owned.name);return true;
    }
    if (m.op === 'rename') {
      const name=String(m.name||'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,28);
      if(name.length<3)return toast('Use at least 3 characters'),true;
      if(Object.values(businesses).some(x=>x&&x.id!==owned.id&&x.name.toLowerCase()===name.toLowerCase()))return toast('That business name is taken'),true;
      owned.name=name;saveBusinesses();broadcastBusinesses(room);savePlayer(room,p);toast('Business name updated');return true;
    }
    if (m.op === 'hire') {
      const staff = Array.isArray(owned.staff) ? owned.staff : (owned.staff=[]);
      const roles = { cashier:'Cashier', manager:'Manager', security:'Security', cleaner:'Cleaner', stylist:'Stylist', chef:'Chef' };
      const role = String(m.role||'cashier');
      if (!roles[role]) return toast('Choose a valid staff role'), true;
      if (staff.length >= 10) return toast('Your company has reached its 10 staff limit'), true;
      const fee = 10000;
      if (!charge(p, fee, 'Hired '+roles[role]+' for '+owned.name)) return true;
      staff.push({id:Date.now()+'-'+staff.length,role,name:roles[role]+' '+(staff.length+1),hired:now});
      saveBusinesses();savePlayer(room,p);sendBusinesses(p);toast('👥 '+roles[role]+' hired for ₦10,000');return true;
    }
    if (m.op === 'fire') {
      const staff = Array.isArray(owned.staff) ? owned.staff : [];
      const index = Math.floor(+m.index);
      if (!Number.isInteger(index) || index < 0 || index >= staff.length) return toast('Staff member not found'), true;
      const removed = staff.splice(index,1)[0];
      saveBusinesses();sendBusinesses(p);toast((removed.name||'Staff member')+' removed from your company');return true;
    }
    sendBusinesses(p);return true;
  }
  if (m.t === 'getx') {
    if (m.k === 'cert') sendCert(p); else if (m.k === 'cars') sendCars(p); else if (m.k === 'mk') sendMarket(p); else if (m.k === 'decor') sendDecor(p);
  } else if (m.t === 'hustle') {
    const h = HUSTLES[m.id]; if (!h) return true;
    if (jailed) return toast('You are in jail!'), true;
    if (p.inside) return toast('Go outside to hustle'), true;
    if (!cooldown(p, 'h_' + m.id, h.cd)) return toast('⏳ Wait a bit before doing that again'), true;
    const L = p.life; if (L && L.energy < 8) return toast('😴 Too tired. Rest first'), true;
    if (L) L.energy = Math.max(0, L.energy - 6);
    const amt = h.min + Math.floor(Math.random() * (h.max - h.min + 1));
    addMoney(p, amt, 'Hustle shift: ' + h.name); toast(`${h.icon} ${h.name}: +${fmtN(amt)}`); sendLife(p, R);
  } else if (m.t === 'phone') { p.phone = !!m.on;
  } else if (m.t === 'mic') { p.mic = !!m.on;
  } else if (m.t === 'rtc') {
    const q = R.players[m.to]; if (!q || q.id === p.id || !m.data) return true;
    if (JSON.stringify(m.data).length > 6000) return true;
    send(q.ws, { t: 'x_rtc', from: p.id, data: m.data });
  } else if (m.t === 'cert') {
    if (m.op === 'buy' && m.id === 'license') {
      if (E.license) return toast('You already have a Driver\'s License'), true;
      if (!charge(p, LICENSE_PRICE, "Driver's License")) return true;
      E.license = now; toast('🪪 Driver\'s License issued! You can now buy and drive vehicles.'); sendCert(p); sendCars(p); savePlayer(room, p);
    }
  } else if (m.t === 'garage') {
    if (jailed) return toast('You cannot use your garage while in jail'), true;
    if (p.inside || p.ride) return toast('Exit the building or passenger seat first'), true;
    const unit = myUnit(p), home = unit && HOUSES[unit.house];
    if (!home) return toast('Rent a home before using a private garage'), true;
    if (dist(p, home.out) > 18 && dist(p, home.door) > 18) return toast('Drive to your own home driveway first'), true;
    E.storedCars = Array.isArray(E.storedCars) ? E.storedCars : [];
    const capacity = home.kind === 'villa' ? 4 : home.kind === 'lobby' ? 3 : 2;
    if (m.op === 'store') {
      const col = Math.floor(+p.car);
      if (col < 0 || !E.cars.includes(col) || !VEHICLES[col]) return toast('Get into one of your own vehicles first'), true;
      if (E.storedCars.includes(col)) return toast('That vehicle is already in your garage'), true;
      if (E.storedCars.length >= capacity) return toast('Your home garage is full'), true;
      E.storedCars.push(col); p.car = -1;
      sendCars(p); send(p.ws, { t: 'garage_stored', col });
      toast('🏠 ' + VEHICLES[col].name + ' safely stored at ' + home.name);
      savePlayer(room, p); return true;
    }
    if (m.op === 'retrieve') {
      const col = Math.floor(+m.col);
      if (p.car >= 0) return toast('Park your current vehicle before retrieving another'), true;
      if (!E.storedCars.includes(col) || !E.cars.includes(col) || !VEHICLES[col]) return toast('That vehicle is not in your garage'), true;
      E.storedCars = E.storedCars.filter(x => x !== col);
      const x = home.out.x + 5.5, z = home.out.z + 2.5, ry = Math.PI;
      sendCars(p); send(p.ws, { t: 'garage_spawn', col, x, z, ry });
      toast('🔑 ' + VEHICLES[col].name + ' retrieved to your driveway');
      savePlayer(room, p); return true;
    }
    return true;
  } else if (m.t === 'carpaint') {
    const col=Math.floor(+m.col), color=String(m.color||'').toLowerCase(), palette=['#f5f5f5','#111827','#dc2626','#2563eb','#16a34a','#f59e0b','#a855f7','#ec4899'];
    if(!VEHICLES[col]||!E.cars.includes(col))return toast('You must own this vehicle before customising it'),true;
    if(!palette.includes(color))return toast('That paint finish is unavailable'),true;
    const price=75000;if(!charge(p,price,'Vehicle respray: '+VEHICLES[col].name))return true;
    E.carPaint=E.carPaint||{};E.carPaint[col]=color;sendCars(p);toast('🎨 Vehicle resprayed successfully');savePlayer(room,p);
  } else if (m.t === 'buycar') {
    const col = Math.floor(+m.col), v = VEHICLES[col];
    if (!v) return true;
    if (E.cars.includes(col)) return toast('You already own this vehicle'), true;
    if (!E.license) return toast("🪪 Get your Driver's License first (Phone → ID & Certificates)"), true;
    if (!charge(p, v.price, 'Bought ' + v.name)) return true;
    E.cars.push(col); sendCars(p); toast(`🔑 You bought a ${v.name}! Walk to one and press DRIVE`); savePlayer(room, p);
  } else if (m.t === 'setrole') {
    if (jailed) return toast('You are in jail!'), true;
    const role = String(m.role);
    if (!ROLES.includes(role) || role === p.role) return true;
    if (!cooldown(p, 'role', 3000)) return toast('Wait a few seconds...'), true;
    p.role = role; E.role = role; p.car = -1;
    if (role === 'thief' && m.crew) { const f = R.players[m.crew]; if (f && f.id !== p.id && f.role === 'thief') { send(f.ws, { t: 'toast', text: `🦹 ${p.name} joined your crew!` }); toast(`🦹 You joined ${f.name}'s crew. Rob together, watch for police!`); } }
    send(p.ws, { t: 'x_role', role }); broadcast(room, { t: 'toast', text: `${p.name} is now a ${role}` }); savePlayer(room, p);
  } else if (m.t === 'inv') {
    const a = MARKET[m.id], qty = Math.floor(+m.qty);
    if (!a || !(qty >= 1 && qty <= 100000)) return true;
    if (m.op === 'buy') {
      const cost = a.price * qty; if (p.money < cost) return toast(`Need ${fmtN(cost)}`), true;
      addMoney(p, -cost, 'Invest: bought ' + a.name); E.stocks[m.id] = Math.min(1e7, (E.stocks[m.id] || 0) + qty);
    } else if (m.op === 'sell') {
      if ((E.stocks[m.id] || 0) < qty) return toast('You do not own that many'), true;
      E.stocks[m.id] -= qty; if (E.stocks[m.id] <= 0) delete E.stocks[m.id];
      addMoney(p, a.price * qty, 'Invest: sold ' + a.name);
    }
    sendMarket(p);
  } else if (m.t === 'dm') {
    const q = R.players[m.to], text = String(m.text || '').slice(0, 200).trim();
    if (!q || q.id === p.id || !text) return true;
    if (!cooldown(p, 'dm', 400)) return true;
    send(q.ws, { t: 'x_dm', from: p.id, name: p.name, text, ts: now });
  } else if (m.t === 'pay') {
    const q = R.players[m.to], amt = Math.floor(+m.amt);
    if (!q || q.id === p.id || !(amt >= 1)) return true;
    if (jailed) return toast('You are in jail!'), true;
    if (!cooldown(p, 'pay', 1500)) return toast('Wait a moment...'), true;
    if (p.money < amt) return toast(`Need ${fmtN(amt)}`), true;
    addMoney(p, -amt, 'Sent to ' + q.name); addMoney(q, amt, 'Received from ' + p.name);
    toast(`💸 Sent ${fmtN(amt)} to ${q.name}`); send(q.ws, { t: 'toast', text: `💰 ${p.name} sent you ${fmtN(amt)}` });
    send(q.ws, { t: 'x_dm', from: p.id, name: p.name, text: `💸 Sent you ${fmtN(amt)}`, ts: now, sys: true });
  } else if (m.t === 'order') {
    const it = ITEMS[m.id]; if (!it || it.cat !== 'food') return true;
    if (!cooldown(p, 'order', 2500)) return toast('Slow down, one order at a time'), true;
    if (!charge(p, it.price + 150, 'Food delivery: ' + it.name)) return true;
    toast(`🛵 Rider is bringing your ${it.name}...`);
    setTimeout(() => { if (!R.players[p.id]) return; applyFx(p, it.fx); toast(`🍽️ ${it.name} delivered!`); sendLife(p, R); }, 6000);
  } else if (m.t === 'hire') {
    if (m.svc === 'cook') {
      if (!cooldown(p, 'cook', 20000)) return toast('Your cook is still cleaning the kitchen'), true;
      if (!charge(p, 800, 'Hired a cook')) return true;
      applyFx(p, { food: 70, fun: 6 }); toast('👩🏾‍🍳 Your cook made a hot meal. Food +70'); sendLife(p, R);
    } else if (m.svc === 'guard') {
      if (!charge(p, 3500, 'Hired a bodyguard')) return true;
      E.guardUntil = Math.min(now + 30 * 60000, Math.max(now, E.guardUntil) + 10 * 60000);
      toast('🕶️ Bodyguard hired. Thieves cannot rob you for ' + Math.round((E.guardUntil - now) / 60000) + ' min');
    }
  } else if (m.t === 'decor') {
    if (m.op === 'buy') {
      const d = DECOR[m.id]; if (!d) return true;
      if (!charge(p, d.price, 'Bought ' + d.name)) return true;
      E.decorInv[m.id] = Math.min(200, (E.decorInv[m.id] || 0) + 1); toast(`🛍️ ${d.name} bought. Go home and place it!`);
    } else if (m.op === 'place' || m.op === 'remove') {
      const info = p.inside && placeInfo(p.inside);
      if (!info || !info.house || !ownsHouse(p, info.unit)) return toast('Go inside your own home first'), true;
      const list = E.decor[info.unit] = E.decor[info.unit] || [];
      if (m.op === 'place') {
        if (!DECOR[m.id] || (E.decorInv[m.id] || 0) < 1) return toast('You do not own that item'), true;
        if (list.length >= 60) return toast('Your home is full'), true;
        list.push({ id: m.id, x: clampN(m.x, 8), z: clampN(m.z, 8), ry: +m.ry || 0 }); E.decorInv[m.id]--; if (E.decorInv[m.id] <= 0) delete E.decorInv[m.id];
      } else {
        const i = Math.floor(+m.n); if (!(i >= 0 && i < list.length)) return true;
        const [x] = list.splice(i, 1); E.decorInv[x.id] = (E.decorInv[x.id] || 0) + 1;
      }
    }
    sendDecor(p); savePlayer(room, p);
  }
  return true;
}

(async () => {
  await loadStore();
  server.listen(PORT, () => console.log('City game running on port ' + PORT + ' | storage: ' + (UP_ON ? (dbWritesOk ? 'Upstash (permanent)' : 'temporary files (Upstash unreachable)') : 'temporary files')));
})();
// Render sends SIGTERM when it restarts or redeploys: save everyone first
process.on('SIGTERM', async () => {
  try { for (const code in rooms) for (const o of Object.values(rooms[code].players)) savePlayer(code, o); flushSaves(); await dbFlush(); } catch (e) {}
  process.exit(0);
});
