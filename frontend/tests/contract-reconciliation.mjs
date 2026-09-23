import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const LOCAL_CONTRACTS_PATH = path.resolve(__dirname, '../docs/RPC-CONTRACTS.json');
const CODEX_CONTRACTS_PATH = 'C:/Users/Yash/Documents/Codex/2026-09-18/files-pasted-by-the-user-you/work/swasthyasetu-clean-core/docs/RPC-CONTRACTS.json';
const BACKEND_CONTRACTS_PATH = fs.existsSync(LOCAL_CONTRACTS_PATH) ? LOCAL_CONTRACTS_PATH : CODEX_CONTRACTS_PATH;
const SRC_DIR = path.resolve(__dirname, '../src');

if (!fs.existsSync(BACKEND_CONTRACTS_PATH)) {
  console.error(`ERROR: Backend contracts file not found at ${LOCAL_CONTRACTS_PATH} or ${CODEX_CONTRACTS_PATH}`);
  process.exit(1);
}

const contractsData = JSON.parse(fs.readFileSync(BACKEND_CONTRACTS_PATH, 'utf-8'));
const backendRpcs = new Map();

for (const rpc of contractsData.rpcs || []) {
  const name = rpc.name;
  const argsStr = rpc.arguments || '';
  const args = new Map();

  if (argsStr.trim()) {
    // Parse arguments: comma separated, e.g. "p_patient uuid, p_offset integer DEFAULT 0"
    const parts = argsStr.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const tokens = part.split(/\s+/);
      const argName = tokens[0];
      const isDefault = part.toUpperCase().includes('DEFAULT');
      args.set(argName, {
        name: argName,
        isDefault,
        declaration: part
      });
    }
  }

  backendRpcs.set(name, {
    name,
    args,
    returns: rpc.returns,
    authenticated: rpc.authenticated,
    role: rpc.role
  });
}

console.log(`Loaded ${backendRpcs.size} backend RPC contracts from ${contractsData.migration}`);

function findFiles(dir, exts) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findFiles(fullPath, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = findFiles(SRC_DIR, ['.ts', '.tsx']);
let totalCalls = 0;
const uniqueRpcsUsed = new Set();
const issues = [];
const verifiedCalls = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isCallExpression(node)) {
      // Check for .rpc('rpc_name', ...)
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'rpc') {
        const args = node.arguments;
        if (args.length > 0 && ts.isStringLiteral(args[0])) {
          const rpcName = args[0].text;
          totalCalls++;
          uniqueRpcsUsed.add(rpcName);

          const backendRpc = backendRpcs.get(rpcName);
          if (!backendRpc) {
            issues.push({
              file: path.relative(SRC_DIR, file),
              rpc: rpcName,
              error: 'RPC does not exist in backend contract'
            });
            return;
          }

          function extractObjectKeys(objNode) {
            const keys = [];
            if (!objNode) return keys;
            let current = objNode;
            while (ts.isParenthesizedExpression(current)) current = current.expression;
            if (ts.isObjectLiteralExpression(current)) {
              for (const prop of current.properties) {
                if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
                  const key = prop.name.text || prop.name.escapedText;
                  if (key) keys.push(key);
                } else if (ts.isSpreadAssignment(prop)) {
                  let expr = prop.expression;
                  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
                  if (ts.isConditionalExpression(expr)) {
                    keys.push(...extractObjectKeys(expr.whenTrue));
                    keys.push(...extractObjectKeys(expr.whenFalse));
                  } else if (ts.isObjectLiteralExpression(expr)) {
                    keys.push(...extractObjectKeys(expr));
                  }
                }
              }
            } else {
              keys.push(`[non-object: ${current.getText(sourceFile)}]`);
            }
            return keys;
          }

          let passedArgs = [];
          if (args.length > 1) {
            passedArgs = extractObjectKeys(args[1]);
          }

          // Validate keys
          const invalidKeys = passedArgs.filter(k => !k.startsWith('...') && !k.startsWith('[') && !backendRpc.args.has(k));
          const missingRequired = [];
          for (const [argName, argDef] of backendRpc.args.entries()) {
            if (!argDef.isDefault && !passedArgs.includes(argName)) {
              missingRequired.push(argName);
            }
          }

          if (invalidKeys.length > 0 || missingRequired.length > 0) {
            issues.push({
              file: path.relative(SRC_DIR, file),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              rpc: rpcName,
              passedArgs,
              expectedArgs: Array.from(backendRpc.args.keys()),
              invalidKeys,
              missingRequired
            });
          } else {
            verifiedCalls.push({
              file: path.relative(SRC_DIR, file),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              rpc: rpcName,
              passedArgs
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

console.log(`\n=== FRONTEND RPC RECONCILIATION SUMMARY ===`);
console.log(`Total call sites analyzed: ${totalCalls}`);
console.log(`Unique RPCs called: ${uniqueRpcsUsed.size}`);
console.log(`Strictly verified call sites: ${verifiedCalls.length}`);
console.log(`Call sites with discrepancies: ${issues.length}`);

if (issues.length > 0) {
  console.error('\nDISCREPANCIES FOUND:');
  for (const issue of issues) {
    console.error(JSON.stringify(issue, null, 2));
  }
  process.exit(1);
} else {
  console.log('\nALL FRONTEND RPC CALLS ARE 100% RECONCILED WITH BACKEND 050!');
  process.exit(0);
}
