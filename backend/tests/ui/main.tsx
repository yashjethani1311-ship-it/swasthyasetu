import React from 'react'
import {createRoot} from 'react-dom/client'
import {LanguageProvider} from '../../src/lib/i18n'
import {AppShell} from '../../src/components/AppShell'
import {DiagnosticsPage} from '../../src/pages/DiagnosticsPage'
import {reportPdf} from '../../src/lib/diagnostics/report'
import '../../src/styles.css'
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(_s:unknown,error:(e:unknown)=>void)=>{const el=document.getElementById('location-test-status');if(el)el.textContent='Location calls: 1 (permission denied test)';error({code:1})}}})
async function renderReport(){const r={id:'TEST-RESULT',status:'VERIFIED',created_at:'2026-09-18T10:00:00Z',doctor_reviewed_at:null,doctor_reviewed_by:null,report_storage_path:null,verified_at:'2026-09-18T10:00:00Z',result_json:{sample_code:'TEST-SAMPLE',source:'MANUAL',observations:Array.from({length:12},(_,i)=>({parameter_name:`Parameter ${i+1} / नमूना जाँच`,parameter_code:`TEST${i}`,raw_value:String(i+1),unit:'unit',reference_range:'Reference range not configured',flag:'UNKNOWN'}))}};await fetch('http://127.0.0.1:54329/test-report',{method:'POST',body:await reportPdf(r,'Report rendering test','TEST-ORDER','Isolated test laboratory')});document.getElementById('pdf-status')!.textContent='Report captured'}
createRoot(document.getElementById('root')!).render(<LanguageProvider><p style={{background:'#fff4c2',padding:8}}>Isolated UI test fixtures — no live database</p><p id="location-test-status">Location calls: 0</p><button onClick={()=>void renderReport()}>Test report rendering</button><p id="pdf-status"/><AppShell><DiagnosticsPage/></AppShell></LanguageProvider>)
