// Shared by the browser (index.html) and the server (server.js): the list of every building you can walk into.
// Both sides build the SAME list from the same rules, so doors, names and prices always match.
// Block (bx,bz) has its centre at bx*64+32. All building fronts face +z.
(function (root) {
  'use strict';
  const BLOCK = 64, GN = 8;
  const AIR = { bx0: -6, bx1: -4, bz0: 4, bz1: 5 };
  const isAir = (bx, bz) => bx >= AIR.bx0 && bx <= AIR.bx1 && bz >= AIR.bz0 && bz <= AIR.bz1;
  const inCore = (bx, bz) => bx >= -4 && bx <= 3 && bz >= -4 && bz <= 3;
  function outerStyle(bx, bz) {          // same rules as index.html outerInfo()
    if (bx >= 6) return bz < 0 ? 'market' : 'lekki';
    if (bx <= -7) return bz < 0 ? 'ikeja' : 'surulere';
    if (bz <= -7) return bx < 0 ? 'ikeja' : 'market';
    if (bz >= 6) return bx < 0 ? 'surulere' : 'vi';
    if (bx >= 4) return bz < 0 ? 'vi' : 'lekki';
    if (bx <= -5) return bz < 0 ? 'ikeja' : 'surulere';
    if (bz <= -5) return bx < 0 ? 'ikeja' : 'market';
    return bx < 0 ? 'market' : 'vi';
  }
  function districtOf(bx, bz) {
    if (isAir(bx, bz)) return 'airport';
    if (!inCore(bx, bz)) return outerStyle(bx, bz);
    if (Math.abs(bx + 0.5) < 2 && Math.abs(bz + 0.5) < 2) return 'vi';
    if (bx >= 2) return 'lekki';
    if (bx <= -3) return bz <= -1 ? 'ikeja' : 'surulere';
    return 'market';
  }

  // ---- what each kind of building is like inside ----
  // room: where the interior is built (far from the city). hw/hd/h = half width, half depth, height.
  // spot: where you stand to use it (relative to the room centre). act = button text. cost/pay/fx/msg/cd = what happens (server).
  const T = {
    restaurant: { icon: '🍲', label: 'Restaurant', bg: '#b71c1c', hw: 11, hd: 9, h: 5, floor: 'wood', wall: 0xf1e4c8,
      names: ['Amala Shitta', 'Mama Cass Kitchen', 'Buka Express', 'Iya Basira Joint', 'Jollof Palace'],
      spot: { dx: 0, dz: -4.2, r: 4 }, act: '🍲 EAT AMALA ₦600', cost: 600, fx: { food: 100, fun: 5 }, msg: '🍲 Amala and ewedu! You are full and happy.', cd: 4000,
      npc: { name: 'Auntie Bisi', title: 'Buka owner', dx: 4, dz: -7.8, ry: 0, look: [2, 4, 3, 2, 1, 0] },
      lines: ['Amala and gbegiri, hot hot! Press the button at the counter.', 'Sit down and chop, my pikin.', 'Shitta amala na the best in Lagos!'] },
    club: { icon: '🪩', label: 'Nightclub', bg: '#6a1b9a', hw: 13, hd: 11, h: 6, floor: 'checker', wall: 0x2a1b3d,
      names: ['Quilox', 'Club Cubana', 'Escape Lounge', 'Sky Lounge', 'Pulse Nightclub'],
      spot: { dx: 0, dz: 0, r: 5 }, act: '🪩 PARTY ₦8,000', cost: 8000, fx: { fun: 60, energy: -12, hygiene: -10 }, msg: '🪩 What a night! Your fun is way up.', cd: 8000, minEnergy: 15,
      npc: { name: 'DJ Fatty', title: 'DJ', dx: 0, dz: -9, ry: 0, look: [4, 3, 7, 1, 0, 0] },
      lines: ['Make some noise! Amapiano all night 🔊', 'Table service is for big boys o.', 'Hold your phone tight, pickpockets dey here.'] },
    pharmacy: { icon: '💊', label: 'Pharmacy', bg: '#2e7d32', hw: 9, hd: 8, h: 4.5, floor: 'tile', wall: 0xeaf4ea,
      names: ['Ikeja Pharmacy', 'Healthplus Chemist', 'Medico Pharmacy', 'Dayspring Chemist'],
      spot: { dx: 0, dz: -3.4, r: 3.6 }, act: '💊 BUY VITAMINS ₦1,200', cost: 1200, fx: { energy: 25, hygiene: 5 }, msg: '💊 You took your vitamins. More energy!', cd: 6000,
      npc: { name: 'Pharm. Ngozi', title: 'Pharmacist', dx: 3, dz: -6.4, ry: 0, look: [1, 0, 4, 1, 1, 0] },
      lines: ['Take your drugs as prescribed, no self-medication!', 'Vitamins for energy, my dear.', 'Malaria? Come, I have something for you.'] },
    supermarket: { icon: '🛒', label: 'Supermarket', bg: '#1565c0', hw: 12, hd: 10, h: 5, floor: 'tile', wall: 0xf3f1e8,
      names: ['City Mart', 'Mega Mart', 'Alpha Supermarket', 'Value Plus Stores'],
      spot: { dx: 7, dz: 5, r: 4 }, act: '🛒 BUY GROCERIES ₦900', cost: 900, fx: { food: 45, fun: 3 }, msg: '🛒 You bought groceries and ate some snacks.', cd: 5000,
      npc: { name: 'Cashier Femi', title: 'Cashier', dx: 9.2, dz: 6.8, ry: Math.PI, look: [3, 0, 5, 1, 0, 0] },
      lines: ['Welcome! Bag your own items o.', 'No change? Then no purchase!', 'Everything is on sale today.'] },
    gym: { icon: '🏋️', label: 'Gym', bg: '#ef6c00', hw: 12, hd: 10, h: 5.5, floor: 'checker', wall: 0xe8eaed,
      names: ['Iron Temple Gym', 'FitLagos', 'Muscle Factory', 'Alpha Fitness'],
      spot: { dx: 0, dz: -1, r: 5 }, act: '🏋️ WORKOUT ₦1,500', cost: 1500, fx: { energy: -14, fun: 12, hygiene: -8 }, msg: '🏋️ Great workout! You feel strong.', cd: 6000, minEnergy: 20,
      npc: { name: 'Coach Tunde', title: 'Trainer', dx: -8, dz: 5, ry: Math.PI / 2, look: [4, 3, 6, 1, 0, 0] },
      lines: ['No pain, no gain!', 'Hydrate, my friend.', 'Leg day is every day.'] },
    church: { icon: '⛪', label: 'Church', bg: '#4e342e', hw: 11, hd: 14, h: 8, floor: 'wood', wall: 0xf3efe6,
      names: ['Grace Chapel', 'Redeemed Assembly', 'Divine Mercy Church', 'Faith Tabernacle'],
      spot: { dx: 0, dz: -7, r: 4 }, act: '🙏 JOIN SERVICE (offering ₦200)', cost: 200, fx: { fun: 18, energy: 5 }, msg: '🙏 A peaceful service. You feel renewed.', cd: 30000,
      npc: { name: 'Pastor Emeka', title: 'Pastor', dx: 0, dz: -11.5, ry: 0, look: [4, 3, 7, 1, 0, 0] },
      lines: ['God bless you, my child.', 'Come and worship with us!', 'Peace be with you.'] },
    salon: { icon: '💈', label: 'Salon & Barber', bg: '#ad1457', hw: 9, hd: 8, h: 4.5, floor: 'tile', wall: 0xf6e3ec,
      names: ['Surulere Barber', 'Glow Salon', 'Ade Fashion & Hair', 'Crown Cuts'],
      spot: { dx: 0, dz: -2, r: 4 }, act: '💈 GET FRESH ₦1,000', cost: 1000, fx: { hygiene: 100, fun: 8 }, msg: '💈 Fresh and clean! Looking good.', cd: 6000,
      npc: { name: 'Sis Joy', title: 'Stylist', dx: -3, dz: -5, ry: 0, look: [2, 4, 3, 2, 1, 0] },
      lines: ['Sit down, I go fix you!', 'Fresh cut, fresh life.', 'Braids or low cut?'] },
    office: { icon: '🏢', label: 'Office', bg: '#455a64', hw: 12, hd: 9, h: 4.5, floor: 'checker', wall: 0xe9eef0,
      names: ['Zenith Plaza', 'Ikeja Tech Hub', 'Alpha Consult', 'Premier Insurance', 'Metro Accounting'],
      spot: { dx: 0, dz: -4.5, r: 4 }, act: '💼 DO A TEMP SHIFT (+₦1,800)', pay: 1800, fx: { energy: -10, fun: -4 }, msg: '💼 Shift done. You got paid ₦1,800.', cd: 40000, minEnergy: 15,
      npc: { name: 'Mr Bankole', title: 'Office manager', dx: 4, dz: -7, ry: 0, look: [3, 0, 4, 1, 0, 0] },
      lines: ['We always need hands. Take a temp shift.', 'Deadlines, deadlines...', 'Do not touch my stapler.'] },
    tower: { icon: '🏙️', label: 'Corporate Tower', bg: '#37474f', hw: 14, hd: 11, h: 7, floor: 'checker', wall: 0xdfe5ea,
      names: ['Eko Plaza', 'Marina Tower', 'Naija Trust', 'Island Mall', 'Unity Bank', 'Apex Towers'],
      spot: { dx: 0, dz: -6.2, r: 4 }, act: '💼 BUSINESS CENTER JOB (+₦3,500)', pay: 3500, fx: { energy: -8, fun: -2 }, msg: '💼 Contract done. You earned ₦3,500.', cd: 45000, minEnergy: 15,
      npc: { name: 'Receptionist Ada', title: 'Receptionist', dx: 3, dz: -8.2, ry: 0, look: [1, 0, 4, 1, 1, 0] },
      lines: ['Good day, welcome to the lobby.', 'The business center is at the desk.', 'Do you have an appointment?'] },
    hotel: { icon: '🏨', label: 'Hotel', bg: '#00695c', hw: 12, hd: 10, h: 5, floor: 'wood', wall: 0xf2e9dc,
      names: ['Atlantic Hotel', 'Harbour Suites', 'Lagoon Inn', 'Marina Suites'],
      spot: { dx: 0, dz: -5.4, r: 4 }, act: '🛏️ BOOK A NAP ₦6,000', cost: 6000, fx: { energy: 70, hygiene: 40, fun: 5 }, msg: '🛏️ A lovely nap. You are fully rested!', cd: 20000,
      npc: { name: 'Concierge Paul', title: 'Concierge', dx: 4, dz: -7.6, ry: 0, look: [3, 0, 4, 1, 0, 0] },
      lines: ['Welcome to the hotel, sir/madam.', 'A room for the night?', 'Breakfast is included.'] },
    home: { icon: '🏠', label: 'Family Home', bg: '#6d4c41', hw: 9, hd: 8, h: 4.5, floor: 'wood', wall: 0xf1e4c8,
      names: ['Adebayo Family Home', 'Okafor Residence', 'Bello House', 'Eze Family Home', 'Mama Tunde Home', 'Lekki Villa Residence'],
      spot: { dx: -3, dz: -2, r: 3.6 }, act: '🛋️ REST ON THE SOFA', fx: { energy: 12, fun: 4 }, msg: '🛋️ The family let you rest a while.', cd: 60000,
      npc: { name: 'Mama Tunde', title: 'Resident', dx: 4, dz: -4, ry: Math.PI, look: [2, 4, 3, 2, 1, 0] },
      lines: ['Come in, come in! Sit down.', 'You want water? Take.', 'Our children are at school.'] },
    market: { icon: '🧺', label: 'Market Hall', bg: '#e65100', hw: 16, hd: 12, h: 5.5, floor: 'tile', wall: 0xefe3c8,
      names: ['MAINLAND MARKET', 'Fresh Produce', 'Fabric Row'],
      spot: { dx: 11, dz: -5, r: 4 }, act: '🥜 BUY SNACKS ₦150', cost: 150, fx: { food: 18, fun: 3 }, msg: '🥜 Groundnut and plantain chips. Yum.', cd: 3000,
      npc: { name: 'Mama Nkechi', title: 'Trader', dx: 14.4, dz: -5, ry: -Math.PI / 2, look: [2, 4, 3, 2, 1, 0] },
      lines: ['Buy am, buy am! Price is friendly!', 'Fresh tomatoes, fresh pepper!', 'Oga, what you wan buy?'] },
    terminal: { icon: '✈️', label: 'Airport Terminal', bg: '#0b5d3b', hw: 20, hd: 12, h: 8, floor: 'checker', wall: 0xe3e8ee,
      names: ['LAGOS INTERNATIONAL'],
      spot: { dx: 0, dz: -7, r: 5 }, act: '✈️ FLIGHT DESK', info: '✈️ Flights: open 📱 Phone > Map, pick a far place and choose Private Jet.', cd: 3000,
      npc: { name: 'Officer Hauwa', title: 'Check-in', dx: 3, dz: -9.2, ry: 0, look: [3, 0, 4, 1, 1, 0] },
      lines: ['Passport and ticket, please.', 'Private jets leave from the apron.', 'Your flight is boarding.'] }
  };
  const ORDER = Object.keys(T);
  ORDER.forEach((k, i) => { T[k].key = k; T[k].room = { x: 1300, z: i * 70 }; });

  const hash = (a, b, c) => { let h = Math.imul(a + 100, 73856093) ^ Math.imul(b + 100, 19349663) ^ Math.imul(c + 7, 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) >>> 5; };
  const VI = [['Atlantic Hotel', 'hotel'], ['Eko Plaza', 'tower'], ['Marina Tower', 'tower'], ['Naija Trust', 'tower'], ['Island Mall', 'tower'], ['Harbour Suites', 'hotel'], ['Unity Bank', 'tower'], ['Apex Towers', 'tower']];
  const STRIP = ['restaurant', 'pharmacy', 'supermarket', 'gym', 'club'];
  const KIOSK = ['restaurant', 'salon', 'supermarket', 'church'];
  // blocks whose tower already has a rentable lobby (Ikoyi, Victoria Island, Eko Atlantic penthouses)
  const LOBBY = new Set(['4,-3', '5,-2', '4,-1', '-1,-1', '1,-1', '-2,1', '0,4', '2,5', '3,4']);

  let LIST = null; const MAP = {};
  function build() {
    const out = [];
    const add = (bx, bz, slot, type, name, x, z, dz, outDz) => {
      const o = { id: out.length, bx, bz, slot, type, name, door: { x, z: z + dz }, out: { x, z: z + dz + (outDz === undefined ? 2.4 : outDz) } };
      out.push(o); MAP[bx + ',' + bz + ',' + slot] = o; return o;
    };
    for (let bx = -GN; bx < GN; bx++) for (let bz = -GN; bz < GN; bz++) {
      if (isAir(bx, bz) || (bx === 0 && (bz === 0 || bz === 1 || bz === 2))) continue;
      const dk = districtOf(bx, bz), cx = bx * BLOCK + BLOCK / 2, cz = bz * BLOCK + BLOCK / 2;
      if (dk === 'vi') {
        if (LOBBY.has(bx + ',' + bz)) continue;
        const v = VI[hash(bx, bz, 0) % VI.length]; add(bx, bz, 0, v[1], v[0], cx, cz, 16.6);
      } else if (dk === 'lekki') {
        add(bx, bz, 1, 'home', T.home.names[hash(bx, bz, 1) % T.home.names.length], cx - 13, cz + 12, 11.0);
        const rental = inCore(bx, bz) && bx >= 2;       // (cx+13, cz-12) in the core Lekki blocks is a rentable villa
        if (!rental) add(bx, bz, 2, 'home', T.home.names[hash(bx, bz, 2) % T.home.names.length], cx + 13, cz - 12, 11.0);
      } else if (dk === 'ikeja') {
        add(bx, bz, 1, 'office', T.office.names[hash(bx, bz, 1) % T.office.names.length], cx - 13, cz + 12, 9.3);
        const ty = STRIP[hash(bx, bz, 2) % STRIP.length];
        add(bx, bz, 2, ty, T[ty].names[hash(bx, bz, 2) % T[ty].names.length], cx + 13, cz - 12, 10.0);
      } else if (dk === 'surulere') {
        add(bx, bz, 1, 'home', T.home.names[hash(bx, bz, 1) % T.home.names.length], cx - 13, cz + 12, 10.6);
        const ty = KIOSK[hash(bx, bz, 2) % KIOSK.length];
        add(bx, bz, 2, ty, T[ty].names[hash(bx, bz, 2) % T[ty].names.length], cx + 13, cz - 12, 8.6);
      } else if (dk === 'market') {
        add(bx, bz, 0, 'market', T.market.names[(bx + bz + 8) % 3], cx, cz, 24.8, 1.6);
      }
    }
    add(-5, 4, 0, 'terminal', 'LAGOS INTERNATIONAL', -278, 347, 0, -4);   // the airport terminal door (out = 4 units toward the runway)
    return out;
  }
  const api = {
    BLOCK, GN, TYPES: T, ORDER,
    list() { return LIST || (LIST = build()); },
    get(bx, bz, slot) { api.list(); return MAP[bx + ',' + bz + ',' + slot] || null; },
    byId(id) { return api.list()[id] || null; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Buildings = api;
})(typeof window !== 'undefined' ? window : this);
