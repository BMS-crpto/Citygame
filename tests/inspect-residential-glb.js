#!/usr/bin/env node
'use strict';

// Inspect the residential GLB before wiring it into the live city.
// This deliberately does not assume that every scene root is an independent house.
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '../public/models/ajah_houses.glb');
if (!fs.existsSync(file)) throw new Error('Missing residential asset: ' + file);
const data = fs.readFileSync(file);
if (data.length < 20) throw new Error('GLB is too small to contain a valid header');

const magic = data.readUInt32LE(0);
const version = data.readUInt32LE(4);
const declaredLength = data.readUInt32LE(8);
if (magic !== 0x46546c67) throw new Error('Invalid GLB magic header');
if (version !== 2) throw new Error('Expected GLB version 2, received ' + version);
if (declaredLength !== data.length) {
  throw new Error('GLB length mismatch: header=' + declaredLength + ', actual=' + data.length);
}

let offset = 12;
let json = null;
while (offset + 8 <= data.length) {
  const chunkLength = data.readUInt32LE(offset);
  const chunkType = data.readUInt32LE(offset + 4);
  offset += 8;
  if (offset + chunkLength > data.length) throw new Error('GLB chunk exceeds file boundary');
  if (chunkType === 0x4e4f534a) {
    json = JSON.parse(data.subarray(offset, offset + chunkLength).toString('utf8').trim());
    break;
  }
  offset += chunkLength;
}
if (!json) throw new Error('GLB JSON chunk is missing');

const nodes = json.nodes || [];
const meshes = json.meshes || [];
const scenes = json.scenes || [];
const roots = scenes.flatMap(scene => scene.nodes || []);
const countSubtree = (index, seen = new Set()) => {
  if (seen.has(index)) return { nodes: 0, meshNodes: 0 };
  seen.add(index);
  const node = nodes[index];
  if (!node) throw new Error('Scene references missing node index ' + index);
  let result = { nodes: 1, meshNodes: node.mesh === undefined ? 0 : 1 };
  for (const child of node.children || []) {
    const sub = countSubtree(child, seen);
    result.nodes += sub.nodes;
    result.meshNodes += sub.meshNodes;
  }
  return result;
};
const rootReport = roots.map(index => {
  const node = nodes[index];
  const counts = countSubtree(index);
  return {
    index,
    name: node.name || '(unnamed)',
    nodes: counts.nodes,
    meshNodes: counts.meshNodes,
    children: (node.children || []).length
  };
});

console.log(JSON.stringify({
  asset: 'public/models/ajah_houses.glb',
  bytes: data.length,
  version,
  sceneCount: scenes.length,
  nodeCount: nodes.length,
  meshCount: meshes.length,
  materialCount: (json.materials || []).length,
  rootCount: roots.length,
  roots: rootReport
}, null, 2));
