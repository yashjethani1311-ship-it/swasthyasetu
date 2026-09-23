// Offline preparation only. Send the emitted RPC payload using an authenticated governance session.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function csvRows(text){
 if(text.length>1000000)throw Error('IMPORT_TOO_LARGE');
 const records=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue}
  if(c==='"'){if(field||closed)throw Error('INVALID_CSV');quoted=true;continue}
  if(c===','||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;records.push(row);row=[]}continue}
  if(closed)throw Error('INVALID_CSV');field+=c;
 }
 if(quoted)throw Error('INVALID_CSV');if(field||row.length||closed){row.push(field);records.push(row)}
 const headers=records.shift()?.map(x=>x.replace(/^\uFEFF/,''));if(!headers?.length||new Set(headers).size!==headers.length||headers.some(x=>!x||['__proto__','constructor','prototype'].includes(x)))throw Error('INVALID_HEADERS');
 return records.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==headers.length)throw Error('COLUMN_COUNT');return Object.fromEntries(headers.flatMap((k,i)=>{let v=r[i];if(v==='')return [];if(['active','nlem'].includes(k)){if(!['true','false'].includes(v))throw Error('INVALID_BOOLEAN');v=v==='true'}if(['aliases','panel_components'].includes(k)){v=JSON.parse(v);if(!Array.isArray(v))throw Error('INVALID_ARRAY')}return [[k,v]]}))});
}
export function importPayload(manifest,rows){
 if(!['MEDICINE','DIAGNOSTIC'].includes(manifest.kind)||!['DEMO','SOURCE_RECORDED'].includes(manifest.assurance))throw Error('INVALID_MANIFEST');
 return {rpc:manifest.kind==='MEDICINE'?'k1_import':'k2_import',args:{p_source:manifest.source,p_version:manifest.version,p_reference:manifest.reference,p_assurance:manifest.assurance,p_effective:manifest.effective_date,p_rows:rows,p_request:manifest.request_key,p_dry_run:true}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [manifestPath,rowsPath,outputPath]=process.argv.slice(2);if(!manifestPath||!rowsPath||!outputPath)throw Error('Usage: node scripts/catalog-import.mjs manifest.json rows.csv|json output.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));const raw=fs.readFileSync(rowsPath,'utf8');if(raw.length>1000000)throw Error('IMPORT_TOO_LARGE');const rows=rowsPath.toLowerCase().endsWith('.csv')?csvRows(raw):JSON.parse(raw);
 fs.writeFileSync(outputPath,JSON.stringify(importPayload(manifest,rows),null,2)+'\n',{flag:'wx'});
}
