const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'public', 'index.html');
const server = http.createServer((req, res) => {
  fs.readFile(INDEX, (e, d) => { if (e) { res.writeHead(500); return res.end('index.html missing'); } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(d); });
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

const rooms = {}; // code -> { players:{}, owners:{houseId:playerId} }
let nextId = 1;
const ROLES = ['police', 'thief', 'nurse', 'lawyer', 'taxi'];

// ---- world layout (same for every room) ----
const cx = b => b * 40 + 20;
const HOUSES = [[-4,-4],[-3,-4],[2,-4],[3,-4],[-4,2],[3,2]].map(([bx,bz],i) => ({ id: i, x: cx(bx)+9, z: cx(bz)+6, price: 30000 + i*15000 }));
const SHOPS = [[-4,-3],[3,-3],[-4,3],[3,3]].map(([bx,bz],i) => ({ id: i, x: cx(bx)-9, z: cx(bz)-6 }));
const JAIL = { x: -175, z: 175 };
// ---- life-sim: needs, jobs, shops, bank (all prices in naira) ----
const NEEDS = ['energy', 'hunger', 'hygiene', 'fun'];
const OPT = {};
const def = (id, o) => { OPT[id] = Object.assign({ id }, o); return id; };
const act = (id, label, cost, secs, busy, fx, extra = {}) => def(id, Object.assign({ kind: 'act', label, cost, secs, busy, fx }, extra));
const food = (id, label, cost, h, f = 0) => act(id, label, cost, 4, 'Eating', { hunger: h, fun: f });
const job = (id, label, pay, req, fx, extra = {}) => def(id, Object.assign({ kind: 'work', label, pay, secs: 20, req, busy: 'Working', fx }, extra));
const buy = (id, label, cost, item, desc) => def(id, { kind: 'buy', label, cost, item, desc });
const bank = (id, label, o) => def(id, Object.assign({ kind: 'bank', label }, o));

const ITEMS = {
  phone: { pay: 0.05 }, laptop: { desk: 0.10 }, clothes: { pay: 0.08 },
  shoes: { speed: 0.12 }, watch: { pay: 0.12 }, gen: { gen: true }
};

const SP = (id, icon, name, bx, bz, opts, dx = -1.5, dz = 12.6) => ({ id, icon, name, x: cx(bx) + dx, z: cx(bz) + dz, opts });
const SPOTS = [
  SP('amala', '🍲', 'Amala Shitta', -4, 1, [
    food('amala1', '🍲 Amala & Ewedu', 500, 35), food('amala2', '🍲 Amala & Gbegiri', 600, 40),
    food('yam', '🍛 Pounded Yam & Egusi', 800, 50), food('jollof', '🍚 Jollof Rice', 1000, 45, 5),
    food('suya', '🍢 Suya', 1500, 30, 10),
    job('j_chef', '👨‍🍳 Work: Chef', 3000, 0, { energy: -18, hunger: -10, hygiene: -10, fun: -8 })]),
  SP('club', '🎉', 'Quilox Club', 0, -2, [
    act('party', '🥂 Party all night', 5000, 15, 'Partying', { fun: 60, energy: -15, hygiene: -10, hunger: -10 }),
    job('j_dj', '🎧 Work: DJ', 4500, 3, { energy: -20, hunger: -10, hygiene: -8, fun: 10 }, { power: true })], 8),
  SP('bank', '🏦', 'GTBank', -1, 0, [
    bank('dep5', '⬇️ Deposit ₦5,000', { dep: 5000 }), bank('depall', '⬇️ Deposit all', { dep: -1 }),
    bank('with5', '⬆️ Withdraw ₦5,000', { wd: 5000 }), bank('withall', '⬆️ Withdraw all', { wd: -1 })], 8),
  SP('corp', '🏢', 'Marina Towers', -2, -1, [
    job('j_banker', '💼 Work: Banker', 8000, 6, { energy: -20, hunger: -12, hygiene: -6, fun: -12 }, { power: true, desk: true }),
    job('j_exec', '👔 Work: Executive', 12000, 12, { energy: -22, hunger: -12, hygiene: -6, fun: -15 }, { power: true, desk: true })], 8),
  SP('market', '🛍️', 'Balogun Market', -1, -3, [
    buy('b_clothes', '👕 Designer clothes', 50000, 'clothes', '+8% pay'),
    buy('b_shoes', '👟 Jordan 1s', 40000, 'shoes', 'Run 12% faster'),
    buy('b_watch', '⌚ Rolex', 200000, 'watch', '+12% pay'),
    buy('b_gen', '🔌 Generator', 60000, 'gen', 'Beat NEPA'),
    job('j_trader', '📦 Work: Market trader', 2000, 0, { energy: -18, hunger: -12, hygiene: -12, fun: -6 })], -1.5, -12.6),
  SP('cv', '💻', 'Computer Village', -3, -3, [
    buy('b_phone', '📱 iPhone 15', 30000, 'phone', '+5% pay'),
    buy('b_laptop', '💻 MacBook Pro', 80000, 'laptop', '+10% desk-job pay')]),
  SP('hosp', '🏥', 'Hospital', -3, -1, [
    act('treat', '💊 Treatment', 3000, 8, 'Being treated', { energy: 40, hunger: 40, hygiene: 40, fun: 10 })]),
  SP('gym', '💪', 'Gym', 2, -1, [
    act('gym', '🏋️ Work out', 1500, 10, 'Working out', { energy: -12, hunger: -12, hygiene: -15, fun: 25 })]),
  SP('church', '⛪', 'Church', -4, 3, [
    act('church', '🙏 Attend service', 0, 8, 'Praying', { fun: 15, energy: 5 })]),
  SP('hostel', '🛏️', 'Mushin Hostel', -3, 1, [
    act('h_sleep', '😴 Sleep in a bunk', 300, 12, 'Sleeping', { energy: 70, hygiene: -5, hunger: -8 }),
    act('h_wash', '🚿 Bucket shower', 150, 5, 'Showering', { hygiene: 80 }, { water: true })]),
  SP('office', '🖥️', 'Ikeja Office Park', -4, -2, [
    job('j_office', '🖥️ Work: Office worker', 5500, 2, { energy: -18, hunger: -10, hygiene: -6, fun: -12 }, { power: true, desk: true }),
    job('j_delivery', '🛵 Work: Delivery rider', 1800, 0, { energy: -16, hunger: -14, hygiene: -12, fun: -6 })]),
  SP('danfo', '🚌', 'Oshodi Motor Park', 1, -4, [
    job('j_taxi', '🚕 Work: Taxi / danfo driver', 2500, 0, { energy: -16, hunger: -10, hygiene: -8, fun: -6 })], -1.5, -12.6)
];
const HOME_OPTS = [
  act('home_sleep', '😴 Sleep in your bed', 0, 10, 'Sleeping', { energy: 80, hunger: -8 }),
  act('home_wash', '🚿 Take a shower', 0, 4, 'Showering', { hygiene: 85 }, { water: true }),
  act('home_tv', '📺 Watch TV', 0, 8, 'Watching TV', { fun: 30, energy: -2 }, { power: true }),
  act('home_cook', '🍳 Cook jollof', 600, 5, 'Cooking', { hunger: 40, fun: 3 })
];
const describe = o => ({ id: o.id, kind: o.kind, label: o.label, cost: o.cost || 0, pay: o.pay || 0, secs: o.secs || 0, req: o.req || 0, power: !!(o.power || o.water), item: o.item || null, desc: o.desc || '' });
const clampN = v => Math.max(0, Math.min(100, v));
const applyFx = (p, fx) => { for (const k of NEEDS) if (fx[k]) p.n[k] = clampN(p.n[k] + fx[k]); };
function perks(p) {
  let pay = 1, desk = 0, speed = 1, gen = false;
  for (const k in p.items) { const it = ITEMS[k]; if (!it) continue; pay += it.pay || 0; desk += it.desk || 0; speed += it.speed || 0; if (it.gen) gen = true; }
  return { pay, desk, speed, gen };
}
const lowNeeds = p => NEEDS.filter(k => p.n[k] < 25).length;
const naira = n => '₦' + Math.round(n).toLocaleString('en-US');

const WORLD = { houses: HOUSES, shops: SHOPS, jail: JAIL, spots: SPOTS.map(s => ({ id: s.id, icon: s.icon, name: s.name, x: s.x, z: s.z, opts: s.opts.map(i => describe(OPT[i])) })), homeOpts: HOME_OPTS.map(i => describe(OPT[i])) };

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
  p.jailUntil = Date.now() + ms; p.busy = null;
  p.x = JAIL.x + (Math.random() - 0.5) * 6; p.z = JAIL.z + (Math.random() - 0.5) * 6; p.car = -1;
  send(p.ws, { t: 'tp', x: p.x, z: p.z });
}
function cooldown(p, key, ms) { const n = Date.now(); if ((p.cd[key] || 0) > n) return false; p.cd[key] = n + ms; return true; }

function sendMe(p, now = Date.now()) {
  const pk = perks(p);
  send(p.ws, { t: 'me', n: { energy: Math.round(p.n.energy), hunger: Math.round(p.n.hunger), hygiene: Math.round(p.n.hygiene), fun: Math.round(p.n.fun) },
    money: p.money, bank: p.bank, items: Object.keys(p.items), shifts: p.shifts, speed: pk.speed, low: lowNeeds(p),
    busy: p.busy ? { label: p.busy.label, left: Math.max(0, p.busy.until - now), total: p.busy.total } : null });
}
function collapse(room, p) {
  const fee = Math.min(3000, p.money); p.money -= fee;
  for (const k of NEEDS) p.n[k] = Math.max(p.n[k], 40);
  const h = SPOTS.find(s => s.id === 'hosp'); p.busy = null; p.car = -1;
  p.x = h.x + 3.2; p.z = h.z; send(p.ws, { t: 'tp', x: p.x, z: p.z });
  broadcast(room, { t: 'toast', text: `🚑 ${p.name} collapsed and was rushed to hospital (-${naira(fee)})` });
  sendMe(p);
}

function onConnection(ws) {
  let id = null, room = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      room = String(m.room || 'LOBBY').toUpperCase().slice(0, 8);
      const role = ROLES.includes(m.role) ? m.role : 'thief';
      id = nextId++;
      rooms[room] = rooms[room] || { players: {}, owners: {}, tickN: 0 };
      rooms[room].players[id] = {
        ws, id, name: String(m.name || 'Player').slice(0, 14), role, money: 20000, car: -1, jailUntil: 0, cd: {},
        n: { energy: 90, hunger: 80, hygiene: 90, fun: 70 }, bank: 0, items: {}, shifts: 0, busy: null,
        x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8, ry: 0, moving: false
      };
      send(ws, { t: 'welcome', id, room, world: WORLD });
      sendMe(rooms[room].players[id]);
      broadcast(room, { t: 'toast', text: `${rooms[room].players[id].name} joined as ${role}` });
      return;
    }
    if (!room || !rooms[room] || !rooms[room].players[id]) return;
    const p = rooms[room].players[id], R = rooms[room];
    const now = Date.now();
    if (m.t === 'move') {
      if (p.jailUntil > now || p.busy) return;
      p.x = +m.x || 0; p.z = +m.z || 0; p.ry = +m.ry || 0; p.moving = !!m.moving;
      p.car = Number.isInteger(m.car) && m.car >= 0 && m.car < 7 ? m.car : -1;
    } else if (m.t === 'chat') {
      broadcast(room, { t: 'chat', name: p.name, text: String(m.text || '').slice(0, 80) });
    } else if (m.t === 'buy') {
      if (p.jailUntil > now) return;
      const h = HOUSES.find(h => dist(h, p) < 9);
      if (!h) return send(ws, { t: 'toast', text: 'No house nearby' });
      if (R.owners[h.id]) return send(ws, { t: 'toast', text: 'Already owned' });
      if (p.money < h.price) return send(ws, { t: 'toast', text: `Need ${naira(h.price)}` });
      p.money -= h.price; R.owners[h.id] = p.id;
      broadcast(room, { t: 'toast', text: `🏠 ${p.name} bought a house! (earns rent)` });
    } else if (m.t === 'use') {
      const tell = text => send(ws, { t: 'toast', text });
      if (p.jailUntil > now) return;
      if (p.busy) return tell('You are busy...');
      const o = OPT[m.opt]; if (!o) return;
      const near = SPOTS.some(s => s.opts.includes(o.id) && dist(s, p) < 9) ||
        (HOME_OPTS.includes(o.id) && HOUSES.some(h => R.owners[h.id] === p.id && dist(h, p) < 10));
      if (!near) return tell('Too far from here');
      const pk = perks(p), dark = R.nepa > now && !pk.gen;
      if ((o.power || o.water) && dark) return tell(o.water ? '🚰 No water — NEPA took light' : '⚡ NEPA took light — come back later');
      if (o.kind === 'buy') {
        if (p.items[o.item]) return tell('You already own this');
        if (p.money < o.cost) return tell(`Need ${naira(o.cost)}`);
        p.money -= o.cost; p.items[o.item] = 1; tell(`🛍️ Bought ${o.label.replace(/^\S+\s/, '')}`);
      } else if (o.kind === 'bank') {
        if (o.dep) { const a = o.dep < 0 ? p.money : o.dep; if (a <= 0 || p.money < a) return tell('Not enough cash'); p.money -= a; p.bank += a; tell(`🏦 Deposited ${naira(a)}`); }
        else { const a = o.wd < 0 ? p.bank : o.wd; if (a <= 0 || p.bank < a) return tell('Not enough in bank'); p.bank -= a; p.money += a; tell(`🏦 Withdrew ${naira(a)}`); }
      } else {
        if (o.cost && p.money < o.cost) return tell(`Need ${naira(o.cost)}`);
        if (o.kind === 'work') {
          if (p.shifts < o.req) return tell(`You need ${o.req} shifts of experience first`);
          if (p.n.energy < 10 || p.n.hunger < 10) return tell('You are too tired or hungry to work');
        }
        p.money -= o.cost || 0;
        p.busy = { until: now + o.secs * 1000, total: o.secs * 1000, label: o.busy, opt: o }; p.moving = false;
      }
      sendMe(p, now);
    } else if (m.t === 'send') {
      const to = R.players[+m.to], amt = [1000, 5000].includes(+m.amt) ? +m.amt : 0;
      if (!to || to.id === p.id || !amt || !cooldown(p, 'send', 1500)) return;
      if (p.money < amt) return send(ws, { t: 'toast', text: `Need ${naira(amt)}` });
      p.money -= amt; to.money += amt;
      send(ws, { t: 'toast', text: `💸 Sent ${naira(amt)} to ${to.name}` });
      send(to.ws, { t: 'toast', text: `💸 ${p.name} sent you ${naira(amt)}` });
    } else if (m.t === 'action') {
      if (p.jailUntil > now) return send(ws, { t: 'toast', text: 'You are in jail!' });
      const say = text => broadcast(room, { t: 'toast', text });
      const me = text => send(ws, { t: 'toast', text });
      const free = q => q.jailUntil <= now;
      if (p.role === 'police') {
        const t = nearest(room, p, q => q.role === 'thief' && free(q), 10);
        if (!t) return me('No thief close enough');
        const take = Math.floor(t.money * 0.25), bonus = (t.wantedUntil || 0) > now ? 2000 : 0; t.money -= take; t.wantedUntil = 0; p.money += take + 2000 + bonus;
        jail(room, t, 15000); say(`🚔 ${p.name} arrested ${t.name}! (+${naira(take + 2000 + bonus)}${bonus ? ' wanted bonus' : ''})`);
      } else if (p.role === 'thief') {
        const shop = SHOPS.find(s => dist(s, p) < 8);
        if (shop) {
          if (!cooldown(p, 'shop', 20000)) return me('Shop was just robbed, wait...');
          p.wantedUntil = now + 45000; p.money += 4000; say(`💰 ${p.name} robbed a shop! (+₦4,000)`);
        } else {
          const v = nearest(room, p, q => free(q) && q.money >= 500, 7);
          if (!v) return me('Go near a shop or a player to rob');
          if (!cooldown(p, 'rob', 8000)) return me('Wait a few seconds...');
          const loot = Math.min(5000, Math.floor(v.money * 0.15)); v.money -= loot; p.money += loot; p.wantedUntil = now + 45000;
          say(`💰 ${p.name} robbed ${v.name} of ${naira(loot)}!`);
        }
      } else if (p.role === 'nurse') {
        const t = nearest(room, p, free, 7);
        if (!t) return me('No patient nearby');
        if (!cooldown(p, 'heal', 5000)) return me('Wait a few seconds...');
        p.money += 1500; for (const k of NEEDS) t.n[k] = clampN(t.n[k] + 25); sendMe(t); say(`💉 ${p.name} healed ${t.name} (+₦1,500)`);
      } else if (p.role === 'lawyer') {
        const t = nearest(room, p, q => !free(q), 12);
        if (!t) return me('No one in jail nearby. Walk to the jail!');
        const fee = Math.min(1000, t.money); t.money -= fee; p.money += 3000 + fee; t.jailUntil = 0;
        t.x = 0; t.z = 8; send(t.ws, { t: 'tp', x: 0, z: 8 });
        say(`⚖️ ${p.name} freed ${t.name} from jail! (+${naira(3000 + fee)})`);
      } else if (p.role === 'taxi') {
        const t = nearest(room, p, q => free(q) && q.car < 0, 6);
        if (!t) return me('No passenger nearby');
        if (!cooldown(p, 'taxi', 8000)) return me('Wait a few seconds...');
        p.money += 1000; say(`🚕 ${p.name} picked up ${t.name} (+₦1,000)`);
      }
    }
  });
  ws.on('close', () => {
    if (room && rooms[room]) {
      const p = rooms[room].players[id];
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
      if (p.jailUntil && p.jailUntil <= now) { p.jailUntil = 0; p.x = 0; p.z = 8; send(p.ws, { t: 'tp', x: 0, z: 8 }); send(p.ws, { t: 'toast', text: 'You are free!' }); }
    }
    if (!R.nextNepa) { R.nepa = 0; R.rain = 0; R.nextNepa = now + 90000 + Math.random() * 120000; R.nextRain = now + 60000 + Math.random() * 90000; }
    if (R.nepa <= now && R.nepaOn) { R.nepaOn = false; broadcast(code, { t: 'toast', text: '💡 Light don come! NEPA has restored power' }); }
    if (!R.nepaOn && now >= R.nextNepa) { R.nepa = now + 40000 + Math.random() * 30000; R.nextNepa = R.nepa + 120000 + Math.random() * 180000; R.nepaOn = true; broadcast(code, { t: 'toast', text: '⚡ NEPA don take light! Offices and showers are down' }); }
    if (R.rain <= now && now >= R.nextRain) { R.rain = now + 50000 + Math.random() * 60000; R.nextRain = R.rain + 90000 + Math.random() * 150000; }
    for (const p of Object.values(R.players)) {
      if (p.busy && p.busy.until <= now) {
        const o = p.busy.opt; p.busy = null; applyFx(p, o.fx || {});
        if (o.kind === 'work') {
          const pk = perks(p), mult = pk.pay * (o.desk ? 1 + pk.desk : 1) * Math.max(0.6, 1 - 0.1 * lowNeeds(p));
          const pay = Math.round(o.pay * mult / 50) * 50; p.money += pay; p.shifts++;
          send(p.ws, { t: 'toast', text: `💵 Shift done: +${naira(pay)}` });
        } else send(p.ws, { t: 'toast', text: `✔ ${o.label.replace(/^\S+\s/, '')} done` });
        sendMe(p, now);
      }
    }
    if (++R.tickN % 8 === 0) for (const p of Object.values(R.players)) sendMe(p, now);
    const owners = {};
    for (const h in R.owners) { const o = R.players[R.owners[h]]; if (o) owners[h] = o.name; }
    const list = Object.values(R.players).map(p => ({
      id: p.id, name: p.name, role: p.role, x: p.x, z: p.z, ry: p.ry, moving: p.moving,
      car: p.car, money: p.money, jailed: p.jailUntil > now, wanted: (p.wantedUntil || 0) > now
    }));
    broadcast(code, { t: 'state', players: list, owners, nepa: R.nepa > now, weather: R.rain > now ? 'rain' : 'sunny' });
  }
}, 66);

// needs drain every second; collapse at zero
setInterval(() => {
  for (const code in rooms) for (const p of Object.values(rooms[code].players)) {
    p.n.energy = clampN(p.n.energy - 0.07); p.n.hunger = clampN(p.n.hunger - 0.11);
    p.n.hygiene = clampN(p.n.hygiene - 0.05); p.n.fun = clampN(p.n.fun - 0.08);
    if (p.n.energy <= 0 || p.n.hunger <= 0) collapse(code, p);
  }
}, 1000);
// bank interest every minute (2%, capped)
setInterval(() => {
  for (const code in rooms) for (const p of Object.values(rooms[code].players)) {
    const i = Math.min(2000, Math.floor(p.bank * 0.02));
    if (i > 0) { p.bank += i; send(p.ws, { t: 'toast', text: `🏦 Bank interest: +${naira(i)}` }); }
  }
}, 60000);

// house rent every 10s
setInterval(() => {
  for (const code in rooms) for (const h in rooms[code].owners) {
    const o = rooms[code].players[rooms[code].owners[h]]; if (o) o.money += 250;
  }
}, 10000);

server.listen(PORT, () => console.log('City game running on port ' + PORT));
