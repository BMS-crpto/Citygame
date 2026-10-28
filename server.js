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
function limited(ip) { const n = Date.now(); hits[ip] = (hits[ip] || []).filter(t => n - t < 60000); hits[ip].push(n); return hits[ip].length > 12; }
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
      saveAccounts(); return out(200, { token: makeToken(u), username: u });
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
const saveKey = (room, p) => room + ':' + (p.acct ? 'a:' + p.acct : p.email ? 'g:' + p.email : String(p.name).toLowerCase());
function savePlayer(room, p) {
  const R = rooms[room]; if (!R || !p) return;
  const houses = Object.keys(R.owners).filter(h => R.owners[h] === p.id).map(Number);
  saves[saveKey(room, p)] = { money: p.money, bank: p.bank, food: p.food, life: p.life, inv: p.inv, houses, saved: Date.now() };
  saveDirty = true;
}
function flushSaves() {
  if (!saveDirty) return; saveDirty = false;
  try { fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(saves)); fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE); } catch (e) { console.log('save failed', e.message); }
}
const rooms = {}; // code -> { players:{}, owners:{houseId:playerId} }
let nextId = 1;
const ROLES = ['police', 'thief', 'nurse', 'lawyer', 'taxi'];

// ---- world layout (same for every room) ----
// v0.5: blocks are 64m wide. Block (bx,bz) has its centre at bx*64+32.
const cx = b => b * 64 + 32;
const HOUSES = [];
for (const bx of [2, 3]) for (let bz = -4; bz < 4; bz++) {
  const id = HOUSES.length, x = cx(bx) + 13, z = cx(bz) - 12;
  HOUSES.push({ id, x, z, price: 3000 + (bz + 4) * 1000 + (bx - 2) * 2000, door: { x, z: z + 8.9 }, out: { x, z: z + 13 } });
}
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
const MAXLOOK = [4, 4, 7, 4];
const WORLD = { houses: HOUSES, shops: SHOPS, jail: JAIL, bankDoor: BANK_DOOR, mallDoor: MALL_DOOR, places: PLACES, rides: RIDES };
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
  const m = /^house(\d+)$/.exec(place || ''); const h = m && HOUSES[+m[1]];
  return h ? { door: h.door, out: h.out, room: houseRoom(h.id), house: h } : null;
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
      const role = ROLES.includes(m.role) ? m.role : 'thief';
      id = nextId++;
      rooms[room] = rooms[room] || { players: {}, owners: {}, paint: {} };
      rooms[room].players[id] = {
        ws, id, name: String(m.name || 'Player').slice(0, 14), role, money: 500, bank: 0, inside: null, food: 100, job: null, travelUntil: 0, dest: null, look: (Array.isArray(m.look) ? m.look : []).slice(0, 4).concat([0,0,0,0]).slice(0, 4).map((v, i) => Math.max(0, Math.min(MAXLOOK[i], Math.floor(+v) || 0))), car: -1, jailUntil: 0, cd: {},
        x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8, ry: 0, moving: false
      };
      const np = rooms[room].players[id]; if (gu) { np.email = gu.email; np.acct = gu.acct; if (gu.acct) np.name = gu.acct; else if (!m.name) np.name = String(gu.name).slice(0, 14); }
      const sv = saves[saveKey(room, np)];
      if (sv) {
        np.money = Math.max(0, Math.floor(+sv.money) || 0); np.bank = Math.max(0, Math.floor(+sv.bank) || 0); np.food = Math.max(0, Math.min(100, +sv.food || 100));
        for (const h of (sv.houses || [])) if (HOUSES[h] && !rooms[room].owners[h]) rooms[room].owners[h] = id;
      }
      np.life = newLife(); if (sv && sv.life) restoreLife(np.life, sv.life); restoreInv(np, sv && sv.inv);
      send(ws, { t: 'welcome', id, room, world: WORLD });
      if (sv) send(ws, { t: 'toast', text: '💾 Welcome back! Progress restored' });
      send(ws, { t: 'catalog', items: Object.entries(ITEMS).map(([id, i]) => ({ id, name: i.name, icon: i.icon, cat: i.cat, price: i.price, desc: i.desc })) });
      sendLife(np, rooms[room]);
      broadcast(room, { t: 'toast', text: `${rooms[room].players[id].name} joined as ${role}` });
      }; if (m.token) { const a = readToken(m.token); if (!a) return send(ws, { t: 'authfail' }); go(a); } else if (m.idToken) verifyGoogle(m.idToken, go); else go(null); return;
    }
    if (!room || !rooms[room] || !rooms[room].players[id]) return;
    const p = rooms[room].players[id], R = rooms[room];
    const now = Date.now();
    if (p.travelUntil > now && m.t !== 'chat') return;
    if (m.t === 'move') {
      if (p.jailUntil > now) return;
      p.x = +m.x || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.moving = !!m.moving;
      p.car = Number.isInteger(m.car) && m.car >= 0 && m.car < 8 ? m.car : -1;
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
    } else if (m.t === 'buy') {
      if (p.jailUntil > now) return;
      if (p.inside) return;
      const h = HOUSES.find(h => dist(h.door, p) < 8);
      if (!h) return send(ws, { t: 'toast', text: 'No house nearby' });
      if (R.owners[h.id]) return send(ws, { t: 'toast', text: 'Already owned' });
      if (p.money < h.price) return send(ws, { t: 'toast', text: `Need ₦${h.price}` });
      addMoney(p, -h.price, 'Bought house #' + (h.id + 1)); R.owners[h.id] = p.id;
      broadcast(room, { t: 'toast', text: `🏠 ${p.name} bought a house! (earns rent)` });
    } else if (m.t === 'travel') {
      if (p.jailUntil > now) return send(ws, { t: 'toast', text: 'You are in jail!' });
      if (p.inside) return send(ws, { t: 'toast', text: 'Go outside first' });
      let dest;
      if (m.place === 'home') { const h = HOUSES.find(h => R.owners[h.id] === p.id); if (!h) return send(ws, { t: 'toast', text: 'You do not own a house yet' }); dest = { x: h.out.x, z: h.out.z, name: 'Home' }; }
      else dest = PLACES.find(q => q.id === m.place);
      const ride = RIDES[m.ride];
      if (!dest || !ride) return;
      const AIRP = PLACES.find(q => q.id === 'airport');
      if (m.ride === 'jet' && !(dist(p, AIRP) < 60 || dest.id === 'airport')) return send(ws, { t: 'toast', text: '✈️ Jets only fly to or from Lagos Airport' });
      const d = dist(p, dest);
      if (d < 25) return send(ws, { t: 'toast', text: 'You are already there' });
      const fare = Math.max(ride.min, Math.round(d * ride.rate));
      if (p.money < fare) return send(ws, { t: 'toast', text: `${ride.name} fare is ₦${fare}` });
      p.money -= fare; p.car = -1;
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
        if (p.money < 40) return send(ws, { t: 'toast', text: 'Food costs ₦40' });
        p.money -= 40; p.food = 100; send(ws, { t: 'toast', text: '🍲 Yummy! You are full again' });
      } else if (hm && R.owners[+hm[1]] === p.id && dist(p, { x: houseRoom(+hm[1]).x - 10.2, z: houseRoom(+hm[1]).z - 0.5 }) < 5) {
        if (!cooldown(p, 'fridge', 60000)) return send(ws, { t: 'toast', text: 'The fridge is empty, wait a bit' });
        p.food = 100; send(ws, { t: 'toast', text: '🍳 You ate at home (free!)' });
      } else send(ws, { t: 'toast', text: 'Go to a food counter or your fridge' });
    } else if (m.t === 'enter') {
      if (p.jailUntil > now || p.inside) return;
      const info = placeInfo(m.place);
      if (!info || dist(info.door, p) > 7) return send(ws, { t: 'toast', text: 'Walk up to the door first' });
      if (info.house && R.owners[info.house.id] !== p.id) return send(ws, { t: 'toast', text: 'Only the owner can go inside' });
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
      if (R.owners[id] !== p.id) return;
      if (dist(p, pot) > 6) return send(ws, { t: 'toast', text: 'Go to the paint pot' });
      if (p.money < 300) return send(ws, { t: 'toast', text: 'Painting costs ₦300' });
      p.money -= 300; R.paint[id] = ((R.paint[id] || 0) + 1) % 6; send(ws, { t: 'toast', text: '🎨 Walls repainted!' });
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
          const v = nearest(room, p, q => free(q) && q.money >= 50, 7);
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
      for (const h in rooms[room].owners) if (rooms[room].owners[h] === id) delete rooms[room].owners[h];
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
    const owners = {};
    for (const h in R.owners) { const o = R.players[R.owners[h]]; if (o) owners[h] = o.name; }
    const list = Object.values(R.players).map(p => ({
      id: p.id, name: p.name, role: p.role, x: p.x, z: p.z, ry: p.ry, moving: p.moving,
      car: p.car, money: p.money, bank: p.bank, food: p.food, look: p.look, hidden: p.travelUntil > now, jailed: p.jailUntil > now
    }));
    broadcast(code, { t: 'state', players: list, owners, paint: R.paint });
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
  { id: 'house', name: 'Own a house', reward: 1500, ok: (p, R) => Object.values(R.owners).includes(p.id) },
  { id: 'promo', name: 'Get promoted', reward: 2000, ok: p => !!p.life.promoted },
  { id: 'rich', name: 'Hold ₦25,000 in total', reward: 5000, ok: p => p.money + p.bank >= 25000 }
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const newLife = () => ({ energy: 100, hygiene: 100, fun: 100, career: null, shifts: 0, bought: 0, promoted: false, done: {} });
function restoreLife(L, s) {
  L.energy = clamp(+s.energy || 0, 0, 100); L.hygiene = clamp(+s.hygiene || 0, 0, 100); L.fun = clamp(+s.fun || 0, 0, 100);
  if (s.career && CAREERS[s.career.id]) L.career = { id: s.career.id, xp: Math.max(0, Math.floor(+s.career.xp) || 0) };
  L.shifts = Math.max(0, Math.floor(+s.shifts) || 0); L.bought = Math.max(0, Math.floor(+s.bought) || 0); L.promoted = !!s.promoted; L.done = s.done && typeof s.done === 'object' ? s.done : {};
}
const levelOf = c => (c.xp >= 15 ? 2 : c.xp >= 5 ? 1 : 0);
function syncLedger(p) {
  if (p._m === undefined) p._m = p.money;
  if (p.money !== p._m) { (p.ledger = p.ledger || []).push({ d: p._why || 'Activity', amt: p.money - p._m, bal: p.money, at: Date.now() }); if (p.ledger.length > 30) p.ledger.shift(); p._m = p.money; p._why = null; }
}
function addMoney(p, amt, why) { syncLedger(p); p.money += amt; (p.ledger = p.ledger || []).push({ d: why, amt, bal: p.money, at: Date.now() }); if (p.ledger.length > 30) p.ledger.shift(); p._m = p.money; }
function checkMissions(p, R) {
  for (const x of MISSIONS) if (!p.life.done[x.id] && x.ok(p, R)) {
    p.life.done[x.id] = true; addMoney(p, x.reward, 'Mission: ' + x.name);
    send(p.ws, { t: 'toast', text: `🏆 Mission complete: ${x.name} (+₦${x.reward})` });
  }
}
function sendLife(p, R) {
  const L = p.life, c = L.career && CAREERS[L.career.id], lv = c ? levelOf(L.career) : 0;
  send(p.ws, { t: 'lifeinfo',
    needs: { food: Math.round(p.food), energy: Math.round(L.energy), hygiene: Math.round(L.hygiene), fun: Math.round(L.fun) },
    career: c ? { title: c.title, level: c.lv[lv][0], pay: c.lv[lv][1], xp: L.career.xp, next: c.lv[lv + 1] ? c.lv[lv + 1][2] : null } : null,
    careers: Object.entries(CAREERS).map(([id, x]) => ({ id, title: x.title, pay: x.lv[0][1] })),
    missions: MISSIONS.map(x => ({ name: x.name, reward: x.reward, done: !!L.done[x.id] })),
    log: (p.ledger || []).slice(-8).reverse(), inv: p.inv, atShop: atShop(p), cap: BAG_CAP });
}
function lifeOp(room, p, m) {
  const R = rooms[room], L = p.life, now = Date.now(), me = t => send(p.ws, { t: 'toast', text: t });
  if (p.jailUntil > now) return me('You are in jail!');
  const hm = /^house(\d+)$/.exec(p.inside || ''), ownHome = !!hm && R.owners[+hm[1]] === p.id;
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
    if (p.money < 50) return me('That costs ₦50');
    addMoney(p, -50, 'Entertainment'); L.fun += 30; me('🎮 That was fun!');
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
    const cost = it.price * n; if (p.money < cost) return me(`Need ₦${cost}`);
    addMoney(p, -cost, 'Bought ' + it.name + (n > 1 ? ' x' + n : '')); p.inv[m.id] = (p.inv[m.id] || 0) + n; L.bought++;
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
// house rent every 10s
setInterval(() => {
  for (const code in rooms) for (const h in rooms[code].owners) {
    const o = rooms[code].players[rooms[code].owners[h]]; if (o) { o._why = 'House rent income'; o.money += Math.round(HOUSES[h].price / 150); }
  }
  for (const code in rooms) for (const o of Object.values(rooms[code].players)) if (o.bank > 0) o.bank += Math.min(100, Math.max(1, Math.floor(o.bank * 0.01)));
}, 10000);

// autosave every 20 seconds
setInterval(() => { for (const code in rooms) for (const o of Object.values(rooms[code].players)) savePlayer(code, o); flushSaves(); }, 20000);

server.listen(PORT, () => console.log('City game running on port ' + PORT));
