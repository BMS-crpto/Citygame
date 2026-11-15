const { test } = require('node:test');
const assert = require('node:assert/strict');
const Buildings = require('../public/buildings.js');

test('building catalogue is populated with unique IDs and names', () => {
  const list = Buildings.list();
  assert.ok(list.length > 100, 'expected a substantial generated Lagos city');
  assert.equal(new Set(list.map(item => item.id)).size, list.length);
  assert.equal(new Set(list.map(item => item.name)).size, list.length);
});

test('every generated building has a valid type and usable entrance coordinates', () => {
  const list = Buildings.list();
  for (const building of list) {
    assert.ok(Buildings.TYPES[building.type], 'unknown type: ' + building.type);
    assert.equal(typeof building.name, 'string');
    assert.ok(building.name.length > 0);
    for (const axis of ['x', 'z']) {
      assert.ok(Number.isFinite(building.door[axis]), 'invalid door ' + axis + ' for ' + building.name);
      assert.ok(Number.isFinite(building.out[axis]), 'invalid exit ' + axis + ' for ' + building.name);
    }
    assert.equal(typeof building.area, 'string');
    assert.ok(building.area.length > 0);
  }
});

test('catalogue lookup methods return the same generated building', () => {
  const list = Buildings.list();
  const sample = list[Math.floor(list.length / 2)];
  assert.equal(Buildings.byId(sample.id), sample);
  assert.equal(Buildings.get(sample.bx, sample.bz, sample.slot), sample);
  assert.equal(Buildings.byId(-1), null);
  assert.equal(Buildings.get(999, 999, 999), null);
});

test('all building types have the minimum interior and interaction metadata', () => {
  for (const key of Buildings.ORDER) {
    const type = Buildings.TYPES[key];
    assert.equal(type.key, key);
    assert.ok(type.label, key + ' needs a label');
    assert.ok(type.icon, key + ' needs an icon');
    assert.ok(type.names.length > 0, key + ' needs venue names');
    assert.ok(Number.isFinite(type.hw) && type.hw > 0, key + ' needs interior width');
    assert.ok(Number.isFinite(type.hd) && type.hd > 0, key + ' needs interior depth');
    assert.ok(type.spot && Number.isFinite(type.spot.dx) && Number.isFinite(type.spot.dz), key + ' needs an activity spot');
  }
});
