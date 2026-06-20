import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
const vercelOutput = path.join(__dirname, '..', '.vercel', 'output', 'static');

if (process.env.VERCEL && fs.existsSync(distPath)) {
  fs.rmSync(vercelOutput, { recursive: true, force: true });
  fs.mkdirSync(vercelOutput, { recursive: true });
  fs.cpSync(distPath, vercelOutput, { recursive: true });
  console.log('Copied dist to .vercel/output/static');
}
