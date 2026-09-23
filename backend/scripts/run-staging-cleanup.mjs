// Requires authenticated Supabase CLI. No service-role/DB keys are acquired.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const modes = process.argv.slice(2);
if (modes.length !== 1 || !['--preview', '--destructive'].includes(modes[0])) {
  console.error('Usage: node scripts/run-staging-cleanup.mjs --preview | --destructive'); process.exit(1);
}
const destructive = modes[0] === '--destructive';
const file = fileURLToPath(new URL(destructive ? './staging-cleanup.sql' : './staging-cleanup-preview.sql', import.meta.url));
const ref = 'xtehgpcekegoqpyqsxmo'; // Explicit staging allowlist; never inferred from a linked project.
const args = ['--yes', 'supabase@2.117.0', 'db', 'query', '--linked', '--project-ref', ref, '--file', file, '--output', 'json'];
console.log(`Staging ${ref}: executing ${destructive ? 'staging-cleanup.sql (COMMIT)' : 'staging-cleanup-preview.sql (ROLLBACK)'}`);
if (/["%&|<>^!\r\n]/.test(file)) throw new Error('Unsupported script path');
const result = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', `npx.cmd ${args.map(a => a === file ? `"${a}"` : a).join(' ')}`], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 })
  : spawnSync('npx', args, { encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
// Never echo raw CLI errors, debug output, credentials or environment values.
if (result.error || result.status !== 0) {
  console.error('FAIL: cleanup SQL execution failed. Check Supabase CLI authentication and database access. No clean-state claim is made.'); process.exit(1);
}
let rows;
try { rows = JSON.parse(result.stdout); } catch {
  console.error('FAIL: SQL result was not valid JSON; cleanup outcome is unverified.'); process.exit(1);
}
const records = Array.isArray(rows) ? rows : rows?.rows;
const report = records?.find(r => r.mode === (destructive ? 'COMMIT' : 'ROLLBACK') && r.cleanup_verified === true);
if (!report || ['synthetic_auth_users', 'synthetic_facilities', 'synthetic_operational_rows'].some(k => Number(report[k]) !== 0)) {
  console.error('FAIL: SQL did not return the required full cleanup verification.'); process.exit(1);
}
console.log(JSON.stringify({mode: report.mode, cleanup_verified: true,
  synthetic_auth_users: Number(report.synthetic_auth_users), synthetic_facilities: Number(report.synthetic_facilities),
  synthetic_operational_rows: Number(report.synthetic_operational_rows), selected_rows: Number(report.selected_rows)}));
console.log(destructive ? 'PASS: SQL committed; synthetic auth, facility, and captured operational roots verified zero.' : 'PASS: FK-aware cleanup executed and verified inside the transaction, then rolled back. Staging data was preserved.');
