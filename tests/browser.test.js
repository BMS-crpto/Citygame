const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

test('all inline browser scripts in the game page have valid JavaScript syntax', () => {
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  assert.ok(scripts.length > 0, 'expected inline game scripts in public/index.html');

  for (let index = 0; index < scripts.length; index++) {
    const source = scripts[index][1];
    assert.doesNotThrow(
      () => new vm.Script(source, { filename: 'public/index.html:inline-script-' + (index + 1) }),
      'inline script ' + (index + 1) + ' must parse'
    );
  }
});

test('every local JavaScript file referenced by the game page exists', () => {
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1])
    .filter(source => source.startsWith('/'));

  for (const source of sources) {
    const pathname = decodeURIComponent(source.split('?')[0]);
    const target = path.join(root, 'public', pathname.replace(/^\/+/, ''));
    assert.ok(fs.existsSync(target), 'missing local script: ' + source);
    assert.ok(fs.statSync(target).isFile(), 'script path is not a file: ' + source);
  }
});

test('phone Social app supports live likes, replies, and in-app post creation', () => {
  const socialPath = path.join(root, 'public', 'city3d-social-emotes.js');
  const social = fs.readFileSync(socialPath, 'utf8');
  for (const feature of [
    'bridge.X.socialPost',
    'bridge.X.socialPublish',
    "t:'social_post'",
    "t:'social_like'",
    "t:'social_reply'",
    "m.t==='social_update'",
    'data-x="socialLike"',
    'data-x="socialReply"'
  ]) {
    assert.ok(social.includes(feature), 'Social app is missing: ' + feature);
  }
});

test('server Social feed supports retrieving posts, publishing, likes, and replies', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  for (const event of ["m.t === 'social_get'", "m.t === 'social_post'", "m.t === 'social_like'", "m.t === 'social_reply'", "t: 'social_update'", "t: 'social_new'"]) {
    assert.ok(server.includes(event), 'server is missing Social event: ' + event);
  }
});


test('bank withdrawals persist balances and map travel reports invalid selections', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const bank = server.slice(server.indexOf("} else if (m.t === 'bank')"), server.indexOf("} else if (m.t === 'daily')"));
  assert.match(bank, /p\.bank -= a; p\.money \+= a/);
  assert.match(bank, /savePlayer\(room, p\)/);
  assert.match(bank, /dist\(p, ATM\) > 12/);
  const travel = server.slice(server.indexOf("if (m.t === 'travel')"), server.indexOf("} else if (m.t === 'job')"));
  assert.match(travel, /That destination is unavailable/);
  assert.match(travel, /That transport option is unavailable/);
});

test('city lighting keeps the original scene from becoming washed out', () => {
  const polish = fs.readFileSync(path.join(root, 'public', 'lagos-3d-polish.js'), 'utf8');
  const finish = fs.readFileSync(path.join(root, 'public', 'citygame-world-finish.js'), 'utf8');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(polish, /toneMappingExposure=1\.0/);
  assert.match(polish, /PointLight\(0x8bdde8,0\.08/);
  assert.match(finish, /HemisphereLight\(0xd9efff,0x675442,0\.10/);
  assert.match(finish, /DirectionalLight\(0xffe2b8,0\.06/);
  assert.match(html, /'Uber':0,'Private Jet':0/);
});


test('landscape phone overlay scrolls the full app content on mobile', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('Reliable Android landscape phone scrolling');
  const end = html.indexOf('#bigmap{position:fixed', start);
  assert.ok(start >= 0 && end > start, 'landscape scrolling override is present');
  const css = html.slice(start, end);
  assert.match(css, /#phone\s*\{[\s\S]*overflow-y:auto!important/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
  assert.match(css, /justify-content:flex-start/);
  assert.match(css, /#phone \.pbox\s*\{[\s\S]*height:auto!important/);
  assert.match(css, /#phone #appview\s*\{[\s\S]*overflow:visible!important/);
});


test('phone apps open as full-screen app views with in-app navigation', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /phone\.classList\.add\('app-open'\)/);
  assert.match(html, /class="phone-appbar"/);
  assert.match(html, /id="appBack"/);
  assert.match(html, /#phone\.app-open #pgrid[\s\S]*display:none!important/);
  assert.match(html, /#phone\.app-open #appview[\s\S]*flex:1/);
});

test('company registration works remotely and supports persistent staff management', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const client = fs.readFileSync(htmlPath, 'utf8');
  const start = server.indexOf("if (m.op === 'create')", server.indexOf("if (m.t === 'business')"));
  const end = server.indexOf("if (!owned) return toast", start);
  const create = server.slice(start, end);
  assert.match(create, /const candidates = BLD\.filter\(q => q\.area === area/);
  assert.match(create, /const area = String\(m\.area/);
  assert.doesNotMatch(create, /dist\(q\.door,p\)/);
  assert.match(server, /m\.op === 'hire'/);
  assert.match(server, /m\.op === 'fire'/);
  assert.match(server, /staff\.push\(/);
  assert.match(server, /saveBusinesses\(\);savePlayer\(room,p\);sendBusinesses\(p\)/);
  assert.match(client, /id="bizArea"/);
  assert.match(client, /id="bizHire"/);
  assert.match(client, /data-biz-fire/);
});


test('phone Chat is a full app screen with live room messaging', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /else if\(n==='Chat'\)\{appview\.innerHTML=/);
  assert.match(html, /id="phoneChatFeed"/);
  assert.match(html, /id="phoneChatSend"/);
  assert.match(html, /phoneChatAdd\(m\.name,m\.text\)/);
  assert.match(html, /appview\.dataset\.app=n/);
});


test('phone Market uses server-authoritative catalog, inventory, and remote shop transactions', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const module = fs.readFileSync(path.join(root, 'public', 'city-app-suite.js'), 'utf8');
  assert.match(server, /m\.source !== 'phone' && !atShop\(p\)/);
  assert.match(server, /m\.source !== 'phone' && !atShop\(p\)/);
  assert.match(module, /APPR\.Market/);
  assert.match(module, /t:'shop',op:'buy'.*source:'phone'/);
  assert.match(module, /t:'shop',op:'sell'.*source:'phone'/);
  assert.match(module, /m\.t==='lifeinfo'/);
  assert.match(module, /m\.t==='catalog'/);
});

test('phone Gallery captures and stores local city screenshots', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const module = fs.readFileSync(path.join(root, 'public', 'city-app-suite.js'), 'utf8');
  assert.match(html, /capturePhoto:\(\)=>/);
  assert.match(module, /APPR\.Gallery/);
  assert.match(module, /capturePhoto\(\)/);
  assert.match(module, /localStorage\.setItem/);
  assert.match(module, /data:image\/jpeg/);
});

test('phone News combines live community posts and player company updates', () => {
  const module = fs.readFileSync(path.join(root, 'public', 'city-app-suite.js'), 'utf8');
  assert.match(module, /APPR\.News/);
  assert.match(module, /m\.t==='social_new'/);
  assert.match(module, /m\.t==='x_businesses'/);
  assert.match(module, /Community headlines/);
});


test('all phone app shortcuts remain available and add-on apps use the full-screen shell', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  for (const app of ["'Business'","'Properties'","'GPS'","'Progress'","'Daily'","'Calculator'","'Account'","'Avatar'","'Yellow Pages'","'Life'"]) {
    assert.ok(html.includes(app), 'missing phone shortcut: ' + app);
  }
  assert.match(html, /if\(APPR\[n\]\)\{const ph=\$\('phone'\),view=\$\('appview'\);if\(ph\)ph\.classList\.add\('app-open'\)/);
  assert.match(html, /X\.phoneAppBack=/);
  assert.match(html, /class="phone-appbar"/);
});

 
test('landscape full-screen phone apps fit the viewport and scroll within app content', () => {
  const skin = fs.readFileSync(path.join(root, 'public', 'lagos-3d-skin.css'), 'utf8');
  const landscape = skin.slice(skin.indexOf('Landscape app viewport fix'));
  assert.match(landscape, /@media \(orientation:landscape\) and \(max-height:600px\)/);
  assert.match(landscape, /#phone\.app-open #appview\{[\s\S]*overflow-y:auto!important/);
  assert.match(landscape, /height:94dvh!important/);
  assert.match(landscape, /grid-template-columns:repeat\(8,minmax\(0,1fr\)\)!important/);
});


test('Unity mobile HUD exposes touch sprint and forwards held state to player motor', () => {
  const motor = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'Player', 'ThirdPersonMotor.cs'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'Game', 'CitygameRuntime.cs'), 'utf8');
  assert.match(motor, /private bool mobileSprintRequested;/);
  assert.match(motor, /mobileSprintRequested \|\| Input\.GetKey\(KeyCode\.LeftShift\)/);
  assert.match(motor, /public void SetMobileSprint\(bool value\) \{ mobileSprintRequested = value; \}/);
  assert.match(runtime, /GUI\.RepeatButton\([\s\S]*?"RUN"\);[\s\S]*?motor\.SetMobileSprint\(sprintHeld\);/);
  assert.match(runtime, /"JUMP"\)\)\s*motor\.MobileJump\(\);/);
});
