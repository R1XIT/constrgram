import { readFileSync } from 'node:fs';
import { generate } from '../src/generator/index.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/generate.mjs <project.json>');
  process.exit(1);
}
const project = JSON.parse(readFileSync(path, 'utf8'));
process.stdout.write(generate(project));
