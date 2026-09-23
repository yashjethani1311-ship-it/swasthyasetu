import {AppointmentsPage} from '../../src/pages/AppointmentsPage'
import {ConsentPage} from '../../src/pages/ConsentPage'
import React from 'react'
import {createRoot} from 'react-dom/client'
import {LanguageProvider} from '../../src/lib/i18n'
import {AppShell} from '../../src/components/AppShell'
import {CarePage} from '../../src/pages/CarePage'
import {PharmacyPage} from '../../src/pages/PharmacyPage'
import {WorkerPage} from '../../src/pages/WorkerPage'
import '../../src/styles.css'
const role=new URLSearchParams(location.search).get('role')
createRoot(document.getElementById('root')!).render(<LanguageProvider><p style={{background:'#fff4c2',padding:8}}>Isolated UI fixtures — no live database</p><AppShell>{new URLSearchParams(location.search).get('view')==='appointments'?<AppointmentsPage/>:new URLSearchParams(location.search).get('view')==='consent'?<ConsentPage/>:role==='PHARMACY'?<PharmacyPage/>:role==='WORKER'?<WorkerPage/>:<CarePage/>}</AppShell></LanguageProvider>)
