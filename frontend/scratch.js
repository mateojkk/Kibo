import fs from 'fs';
const file = fs.readFileSync('node_modules/@privy-io/react-auth/dist/index.d.ts', 'utf8');
const lines = file.split('\n');
const hookStart = lines.findIndex(l => l.includes('useImportWallet'));
if (hookStart > -1) {
  console.log(lines.slice(Math.max(0, hookStart - 2), hookStart + 5).join('\n'));
} else {
  console.log('not found');
}
