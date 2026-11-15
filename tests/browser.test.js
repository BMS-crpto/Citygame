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
