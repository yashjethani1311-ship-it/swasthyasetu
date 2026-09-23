import assert from 'node:assert/strict';
import {csvRows,importPayload} from '../scripts/catalog-import.mjs';
assert.deepEqual(csvRows('source_code,generic_name,active,aliases\r\na,"Fixture, name",true,"[""Alias""]"\r\n'),[{source_code:'a',generic_name:'Fixture, name',active:true,aliases:['Alias']}]);
assert.throws(()=>csvRows('a,a\nx,y'),/HEADERS/);assert.throws(()=>csvRows('a,b\nx'),/COUNT/);assert.throws(()=>csvRows('a\n"unclosed'),/CSV/);assert.throws(()=>csvRows('active\nyes'),/BOOLEAN/);
const p=importPayload({kind:'MEDICINE',assurance:'DEMO'},[]);assert.equal(p.args.p_dry_run,true);assert.equal(p.rpc,'k1_import');
console.log('3 catalog importer tests passed');
