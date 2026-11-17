'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const port = Number(process.env.CITYGAME_TEST_PORT || 4173);
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, [path.join(root, 'server.js')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), ACC_FILE: path.join(root, '.citygame-e2e-accounts.json') },
  stdio: 'ignore'
});

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Citygame server exited before becoming ready.');
    try {
      const response = await fetch(origin);
      if (response.ok) return;
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw lastError || new Error('Citygame server did not become ready.');
}

(async () => {
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
    });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));

    const response = await page.goto(origin, { waitUntil: 'commit', timeout: 30000 });
    assert.ok(response && response.ok(), 'game page must return a successful HTTP response');
    // Third-party CDN scripts can delay DOMContentLoaded in restricted CI networks.
    // The game shell is served locally, so wait for its real entry screen instead.
    await page.locator('#login, #menu').first().waitFor({ state: 'attached', timeout: 15000 });

    // Give deferred scripts, the Three.js scene and first render a chance to initialize.
    await page.waitForTimeout(9000);
    const state = await page.evaluate(() => ({
      title: document.title,
      hasCanvas: !!document.querySelector('canvas'),
      hasEntryScreen: !!document.querySelector('#menu, #login'),
      bodyText: (document.body && document.body.innerText || '').slice(0, 500)
    }));

    assert.ok(state.hasEntryScreen, 'the game entry screen must be present');
    assert.ok(state.hasCanvas, 'the 3D game or character-preview canvas must initialize');

    const phoneApps = await page.evaluate(() => {
      const bridge = window.LAGOS_PHONE;
      const names = ['Company', 'Social', 'Emotes', 'News', 'Gallery', 'Market'];
      const companyScript = [...document.scripts].find(script => script.src.includes('citygame-company-app.js'));
      return {
        bridgeReady: !!bridge && !!bridge.APPR && !!bridge.X && !!bridge.appview,
        registered: names.filter(name => typeof bridge?.APPR?.[name] === 'function'),
        tiles: names.filter(name => !!document.querySelector('#pgrid [data-app="' + name + '"]')),
        companyScript: companyScript?.src || null,
        companyReceive: typeof window.CGCompanyReceive,
        companyErrors: [...document.querySelectorAll('script')].filter(s => s.src.includes('citygame-company-app.js')).map(s => ({src:s.src,loaded:!!s.dataset.loaded}))
      };
    });
    assert.ok(phoneApps.bridgeReady, 'the in-game phone bridge must initialize');
    assert.deepEqual(phoneApps.registered.sort(), ['Company', 'Emotes', 'Gallery', 'Market', 'News', 'Social'].sort(),
      'all separately loaded phone app renderers must register; diagnostics: ' + JSON.stringify(phoneApps));
    assert.deepEqual(phoneApps.tiles.sort(), ['Company', 'Emotes', 'Gallery', 'Market', 'News', 'Social'].sort(),
      'all phone app launch tiles must be present');

    // Verify that each registered app actually opens inside the full-screen phone
    // app view, rather than merely existing as a launcher tile.
    const appLaunches = await page.evaluate(() => {
      const bridge = window.LAGOS_PHONE;
      const names = ['Company', 'Social', 'Emotes', 'News', 'Gallery', 'Market'];
      return names.map(name => {
        bridge.openApp(name);
        const phone = document.querySelector('#phone');
        const view = document.querySelector('#appview');
        return {
          name,
          opened: !!phone?.classList.contains('app-open'),
          selected: view?.dataset.app === name,
          hasContent: !!view && view.innerText.trim().length > 0
        };
      });
    });
    assert.ok(appLaunches.every(x => x.opened && x.selected && x.hasContent),
      'each phone app must open a populated full-screen app view: ' + JSON.stringify(appLaunches));

    const companyNavigation = await page.evaluate(() => {
      const bridge = window.LAGOS_PHONE;
      let destination = null;
      window.setGps = id => { destination = id; };
      window.CGCompanyReceive([{ id: 'b123', isMine: true, name: 'Mainland Foods', kind: 'restaurant', area: 'Yaba' }]);
      bridge.APPR.Company();
      bridge.X.companyNavigate();
      return {
        destination,
        friendlyType: bridge.appview.innerText.includes('Restaurant')
      };
    });
    assert.equal(companyNavigation.destination, 123,
      'Company Find company must pass the numeric building ID to GPS');
    assert.equal(companyNavigation.friendlyType, true,
      'Company details must show a readable business type');

    const registrationRecovery = await page.evaluate(() => {
      const bridge = window.LAGOS_PHONE;
      // The navigation test above injects an owned company. Clear it so this
      // assertion exercises the first-time registration form, not the owner view.
      window.CGCompanyReceive([]);
      bridge.APPR.Company();
      const before = !!bridge.appview.querySelector('#cgCoName');
      const originalSend = bridge.S;
      let sent = null;
      bridge.appview.querySelector('#cgCoName').value = 'Test Mainland Motors';
      bridge.S = message => { sent = message; };
      bridge.X.companyCreate();
      bridge.S = originalSend;
      return {
        before,
        after: !!bridge.appview.querySelector('#cgCoName'),
        request: sent && sent.t === 'business' && sent.op === 'create'
      };
    });
    assert.equal(registrationRecovery.before, true, 'Company registration form must render');
    assert.equal(registrationRecovery.after, true,
      'registration form must remain available while server response is pending or rejected');
    assert.equal(registrationRecovery.request, true,
      'Company registration must send the expected create request');

    const dealership = await page.evaluate(() => {
      const bridge = window.LAGOS_PHONE;
      const px = bridge.PX;
      Object.assign(px, {
        carList: [
          { col: 0, name: 'Toyota Corolla', icon: '🚗', price: 900000 },
          { col: 1, name: 'Honda Accord', icon: '🚘', price: 1800000 }
        ],
        cars: [], storedCars: [], garage: null, license: true, cert: null,
        carQ: '', carCat: 'all', carSort: '', carPaint: {}
      });
      bridge.APPR.Cars();
      const searchExists = !!bridge.appview.querySelector('#cq');
      const initialCards = bridge.appview.querySelectorAll('.eg-car').length;
      const search = bridge.appview.querySelector('#cq');
      if (search) {
        search.value = 'Honda';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const filtered = bridge.appview.querySelectorAll('.eg-car').length;
      const filteredName = bridge.appview.querySelector('.eg-car-name')?.textContent || '';
      px.carQ = '';
      bridge.APPR.Cars();
      bridge.appview.querySelector('[data-x="carinfo"]')?.click();
      return {
        searchExists, initialCards, filtered, filteredName,
        detailOpened: !!document.querySelector('#epicCarDetails'),
        detailHasVehicle: document.querySelector('#epicCarDetails')?.innerText.includes('Toyota Corolla') || false
      };
    });
    assert.equal(dealership.searchExists, true, 'Elite Auto Gallery search field must render');
    assert.equal(dealership.initialCards, 2, 'dealership must render every supplied showroom vehicle');
    assert.equal(dealership.filtered, 1, 'dealership search must filter the vehicle catalogue');
    assert.equal(dealership.filteredName, 'Honda Accord', 'search must show the matching vehicle');
    assert.equal(dealership.detailOpened, true, 'vehicle details preview must open');
    assert.equal(dealership.detailHasVehicle, true, 'vehicle details must identify the selected model');

    assert.deepEqual(runtimeErrors, [], 'browser runtime must not throw uncaught JavaScript errors');
    process.stdout.write('Browser startup passed: ' + JSON.stringify(state) + '\\n');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
