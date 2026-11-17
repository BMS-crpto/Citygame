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


test('Social app renderer does not call an undefined appbar helper', () => {
  const social = fs.readFileSync(path.join(root, 'public', 'city3d-social-emotes.js'), 'utf8');
  assert.doesNotMatch(social, /appbar\s*\(/);
  assert.match(social, /bridge\.appview\.innerHTML=/);
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


test('Unity follow camera supports right-side touch orbit with pitch bounds', () => {
  const camera = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'Player', 'FollowCamera.cs'), 'utf8');
  assert.match(camera, /touchOrbitSensitivity/);
  assert.match(camera, /Input\.touchCount == 1/);
  assert.match(camera, /touch\.position\.x > Screen\.width \* 0\.45f/);
  assert.match(camera, /orbitYaw \+= touch\.deltaPosition\.x \* touchOrbitSensitivity/);
  assert.match(camera, /Mathf\.Clamp\(orbitPitch - touch\.deltaPosition\.y \* touchOrbitSensitivity, minimumPitch, maximumPitch\)/);
  assert.match(camera, /Physics\.SphereCast/);
});

test('Unity follow camera supports bounded two-finger pinch zoom', () => {
  const camera = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'Player', 'FollowCamera.cs'), 'utf8');
  assert.match(camera, /pinchZoomSensitivity/);
  assert.match(camera, /minimumZoomDistance/);
  assert.match(camera, /maximumZoomDistance/);
  assert.match(camera, /Input\.touchCount >= 2/);
  assert.match(camera, /Vector2\.Distance\(first\.position, second\.position\)/);
  assert.match(camera, /Mathf\.Clamp\(offset\.z \+ pinchDelta \* pinchZoomSensitivity,[\s\S]*-maximumZoomDistance, -minimumZoomDistance\)/);
});


test('Unity follow camera exposes adjustable player focus height and mobile pinch zoom bounds', () => {
  const camera = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'Player', 'FollowCamera.cs'), 'utf8');
  assert.match(camera, /\[SerializeField, Min\(0f\)\] private float targetFocusHeight = 1\.4f;/);
  assert.match(camera, /Vector3 focus = target\.position \+ Vector3\.up \* targetFocusHeight;/);
  assert.match(camera, /pinchZoomSensitivity/);
  assert.match(camera, /Mathf\.Clamp\(offset\.z \+ pinchDelta \* pinchZoomSensitivity,[\s\S]*-maximumZoomDistance, -minimumZoomDistance\)/);
  assert.match(camera, /orbitPitch = Mathf\.Clamp\([\s\S]*minimumPitch, maximumPitch\)/);
});


test('Unity procedural city reuses color materials to reduce mobile render allocations', () => {
  const generator = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'LagosBlockGenerator.cs'), 'utf8');
  assert.match(generator, /Dictionary<Color, Material> MaterialCache/);
  assert.match(generator, /MaterialCache\.TryGetValue\(color, out Material cached\)/);
  assert.match(generator, /MaterialCache\[color\] = material/);
  assert.match(generator, /material\.name = "Citygame shared material " \+ color/);
});

 
test('Unity procedural city reuses a single tropical skybox material across rebuilds', () => {
  const generator = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'LagosBlockGenerator.cs'), 'utf8');
  assert.match(generator, /private static Material tropicalSkyMaterial;/);
  assert.match(generator, /if \(tropicalSkyMaterial == null\)/);
  assert.match(generator, /tropicalSkyMaterial = new Material\(skyShader\)/);
  assert.match(generator, /RenderSettings\.skybox = tropicalSkyMaterial/);
  assert.match(generator, /Citygame tropical sky/);
});

 
test('Unity sidewalk pedestrians clamp movement to walkable endpoints', () => {
  const pedestrian = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'SidewalkPedestrian.cs'), 'utf8');
  assert.match(pedestrian, /Vector3 nextPosition = transform\.position \+ step/);
  assert.match(pedestrian, /if \(nextPosition\.x >= maxX\)[\s\S]*nextPosition\.x = maxX[\s\S]*direction = -1/);
  assert.match(pedestrian, /else if \(nextPosition\.x <= minX\)[\s\S]*nextPosition\.x = minX[\s\S]*direction = 1/);
  assert.match(pedestrian, /transform\.position = nextPosition/);
});

 
test('Unity tropical rain particle budget is reduced on mobile', () => {
  const weather = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'LagosWeatherSystem.cs'), 'utf8');
  assert.match(weather, /mobileRainMultiplier = 0\.45f/);
  assert.match(weather, /main\.maxParticles = Application\.isMobilePlatform \? 600 : 1800/);
  assert.match(weather, /emission\.rateOverTime = Application\.isMobilePlatform \? rainRate \* mobileRainMultiplier : rainRate/);
});


test('Unity business interiors vary by business category and spawn ambient indoor NPCs', () => {
  const interior = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'BusinessInterior.cs'), 'utf8');
  const npc = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'InteriorNpc.cs'), 'utf8');
  for (const category of ['Barbershop','FashionStore','Restaurant','Supermarket','Lounge','CarWash','Pharmacy','Technology']) {
    assert.match(interior, new RegExp('case BusinessCategory\\.' + category + ':'));
  }
  assert.match(interior, /SpawnInteriorNpcs\(root\.transform, npcCount\)/);
  assert.match(interior, /npc\.name = i == 0 \? "Interior staff NPC" : "Interior customer NPC " \+ i/);
  assert.match(interior, /npc\.AddComponent<InteriorNpc>\(\)/);
  assert.match(npc, /Vector3\.MoveTowards/);
  assert.match(npc, /Mathf\.Clamp\(position\.x, roomXBounds\.x, roomXBounds\.y\)/);
  assert.match(npc, /Mathf\.Clamp\(position\.z, roomZBounds\.x, roomZBounds\.y\)/);
});


test('Unity Lagos map buildings have framed entrances aligned to business interaction points', () => {
  const map = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'LagosBlockGenerator.cs'), 'utf8');
  assert.match(map, /ground floor left frontage/);
  assert.match(map, /ground floor right frontage/);
  assert.match(map, /entrance lintel/);
  assert.match(map, /entrance door/);
  assert.match(map, /door handle/);
  assert.match(map, /storefront glass left/);
  assert.match(map, /storefront glass right/);
  assert.match(map, /position\.x, position\.y, frontZ - 1\.1f/);
  assert.match(map, /spot\.Configure\(name, category\)/);
});


test('Unity Lagos map connects the main, market and southern streets with north-south connectors', () => {
  const map = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'LagosBlockGenerator.cs'), 'utf8');
  assert.match(map, /Balogun Connector Street/);
  assert.match(map, /Adeniran Connector Street/);
  assert.match(map, /South District Street/);
  assert.match(map, /Balogun Connector edge west/);
  assert.match(map, /Adeniran Connector edge east/);
  assert.ok(map.indexOf('Material laneWhite =') < map.indexOf('Balogun Connector edge west'));
});

test('shared phone bridge is initialized after its phone app registry', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const plus = html.indexOf('<script id="plus">');
  const registry = html.indexOf('const APPR={};', plus);
  const mainBridge = html.indexOf('window.LAGOS_PHONE =', plus);
  assert.ok(plus >= 0 && registry > plus && mainBridge > registry);
  assert.match(html.slice(mainBridge, mainBridge + 180), /\{ APPR, X, PX, S, phoneOpen,/);
});

test('Company phone app is wired to the real server business protocol', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const company = fs.readFileSync(path.join(root, 'public', 'citygame-company-app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /citygame-company-app\.js/);
  assert.match(html, /CGCompanyReceive\(m\.businesses\)/);
  for (const op of ['create','collect','rename','hire','fire']) {
    assert.ok(company.includes("op:'" + op + "'"), 'Company app missing operation: ' + op);
    assert.ok(server.includes("m.op === '" + op + "'"), 'server missing operation: ' + op);
  }
  assert.match(company, /bridge\.APPR\.Company/);
  assert.match(company, /dataset\.app='Company'/);
});

test('downloadable asset packs only list models that exist in the repository', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'asset-packs.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.packs) && manifest.packs.length >= 3);
  for (const pack of manifest.packs) {
    assert.ok(Array.isArray(pack.assets) && pack.assets.length > 0, pack.id + ' must list files');
    for (const file of pack.assets) {
      const target = path.join(root, 'public', file.slice(1));
      assert.ok(fs.existsSync(target), 'missing asset pack file: ' + file);
    }
  }
});

 
test('premium stylesheet does not shrink the full-screen phone in landscape', () => {
  const index = fs.readFileSync(htmlPath, 'utf8');
  const premium = fs.readFileSync(path.join(root, 'public', 'citygame-premium-ui.css'), 'utf8');
  const skinLink = index.indexOf('/lagos-3d-skin.css');
  const premiumLink = index.indexOf('/citygame-premium-ui.css');
  assert.ok(skinLink >= 0 && premiumLink > skinLink, 'premium stylesheet loads after the base skin');
  const narrowRule = premium.lastIndexOf('@media(max-height:520px) and (orientation:landscape)');
  const override = premium.lastIndexOf('Final landscape cascade override');
  assert.ok(narrowRule >= 0 && override > narrowRule, 'final override follows the narrow landscape rule');
  const finalRules = premium.slice(override);
  assert.match(finalRules, /#phone\.app-open \.pbox\{width:min\(96vw,900px\)!important/);
  assert.match(finalRules, /#phone\.app-open #appview\{[\s\S]*overflow-y:auto!important/);
  assert.match(finalRules, /#phone:not\(\.app-open\) #pgrid\{grid-template-columns:repeat\(8,minmax\(0,1fr\)\)!important/);
});

test('rideable vehicle physics uses the fixed timestep while steering visuals remain frame responsive', () => {
  const car = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'RideableCar.cs'), 'utf8');
  const updateStart = car.indexOf('private void Update()');
  const fixedStart = car.indexOf('private void FixedUpdate()');
  const suspensionStart = car.indexOf('private void UpdateSuspension()');
  assert.ok(updateStart >= 0 && fixedStart > updateStart && suspensionStart > fixedStart);
  const update = car.slice(updateStart, fixedStart);
  const fixed = car.slice(fixedStart, suspensionStart);
  assert.match(update, /driveInput = Vector2\.ClampMagnitude/);
  assert.match(update, /steeringWheel\.localRotation/);
  assert.doesNotMatch(update, /body\.Move(Position|Rotation)/);
  assert.match(fixed, /Time\.fixedDeltaTime/);
  assert.match(fixed, /body\.MovePosition/);
  assert.match(fixed, /body\.MoveRotation/);
});


test('Unity rideable car reuses suspension raycast buffers and preserves dashboard line breaks', () => {
  const car = fs.readFileSync(path.join(root, 'unity', 'Assets', 'Scripts', 'World', 'RideableCar.cs'), 'utf8');
  assert.ok(car.includes('private readonly RaycastHit[] suspensionHits = new RaycastHit[16];'));
  assert.ok(car.includes('int hitCount = Physics.RaycastNonAlloc(origin, -transform.up, suspensionHits, 0.95f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore);'));
  assert.ok(car.includes('for (int h = 0; h < hitCount; h++)'));
  assert.ok(!car.includes('Physics.RaycastAll('));
  assert.ok(car.includes('" km/h\\n" + currentGear'));
});
