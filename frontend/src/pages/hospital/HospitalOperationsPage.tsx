import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card } from '@/components/kit'
import { useAuth } from '@/lib/auth'
import { resolveFacilityId } from '@/lib/facility'
import { rpc, errorText } from '@/lib/diagnostics/service'

export function HospitalOperationsPage({ moduleKey }: { moduleKey: string }) {
  const { profile } = useAuth()
  const [facility, setFacility] = useState<string | null>(null)
  const [setup, setSetup] = useState<any>({departments: []})
  const [staff, setStaff] = useState<any[]>([])
  const [operations, setOperations] = useState<any>({duties: [], store_items: []})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [head, setHead] = useState('')
  const [active, setActive] = useState(true)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [code, setCode] = useState('')
  const [unit, setUnit] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const id = await resolveFacilityId(profile?.id)
      if (!id) throw new Error('No operational facility access is available for this account.')
      setFacility(id)
      setStaff(await rpc<any[]>('h4_staff', {p_facility: id, p_offset: offset}))
      if (moduleKey === 'departments') setSetup(await rpc('h1_setup', {p_facility: id, p_offset: offset}))
      else setOperations(await rpc('h4_operations', {p_facility: id, p_from: new Date(Date.now()-7*86400000).toISOString(), p_until: new Date(Date.now()+14*86400000).toISOString()}))
    } catch (e) { setError(errorText(e)) } finally { setLoading(false) }
  }, [profile?.id, moduleKey, offset, revision])
  useEffect(() => { void load() }, [load])
  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError(''); setNotice('')
    try { await fn(); setNotice('Saved and acknowledged by the server.'); setRevision(x => x+1) }
    catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const inputClass = 'w-full rounded-lg border border-border bg-background p-2 text-sm'
  const members = staff.filter(x => x.active)
  const memberName = (id: string) => staff.find(x => x.user_id === id)?.full_name ?? 'Staff name not in this page'
  return <div className="space-y-5">
    <h1 className="text-2xl font-bold">{moduleKey === 'departments' ? 'Departments' : moduleKey === 'schedules' ? 'Duty roster' : 'Hospital supplies'}</h1>
    {loading && <p role="status">Loading facility operations…</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <Button variant="outline" onClick={() => void load()}>Refresh</Button>
    {!loading && !error && facility && <>
      {moduleKey === 'departments' && <>
        <Card className="space-y-3"><h2 className="font-semibold">{selected ? 'Edit department' : 'Create department'}</h2>
          <label>Name<input className={inputClass} value={name} maxLength={160} onChange={e => setName(e.target.value)} /></label>
          {selected && <><label>Specialty / service<input className={inputClass} value={specialty} maxLength={160} onChange={e => setSpecialty(e.target.value)} /></label><label>Head of department<select className={inputClass} value={head} onChange={e => setHead(e.target.value)}><option value="">Not recorded</option>{members.filter(x=>x.staff_role==='CLINICIAN').map(x=><option key={x.id} value={x.user_id}>{x.full_name}</option>)}</select></label><label className="flex gap-2"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} />Active</label></>}
          <Button disabled={busy || !name.trim()} onClick={() => void action(async () => {
            if (selected) await rpc('h1_update_department', {p_department:selected,p_name:name,p_specialty:specialty,p_head:head||null,p_active:active})
            else await rpc('h1_department', {p_facility:facility,p_name:name})
            setSelected(''); setName('')
          })}>Save department</Button><Button variant="outline" onClick={()=>{setSelected('');setName('')}}>New department</Button>
        </Card>
        {setup.departments.length === 0 && <Card>No departments recorded on this page.</Card>}
        {setup.departments.map((d:any)=><Card key={d.id} className="flex items-center justify-between"><div><strong>{d.name}</strong><p>{d.specialty || 'Specialty not recorded'}</p><Badge>{d.active?'Active':'Inactive'}</Badge></div><Button variant="outline" onClick={()=>{setSelected(d.id);setName(d.name);setSpecialty(d.specialty??'');setHead(d.head_user_id??'');setActive(d.active)}}>Edit</Button></Card>)}
      </>}
      {moduleKey === 'schedules' && <>
        <Card className="space-y-3"><h2 className="font-semibold">Assign duty</h2><label>Current staff member<select className={inputClass} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose staff</option>{members.map(x=><option key={x.id} value={x.user_id}>{x.full_name} · {x.staff_role}</option>)}</select></label><label>Start (local time)<input type="datetime-local" className={inputClass} value={start} onChange={e=>setStart(e.target.value)} /></label><label>End (local time)<input type="datetime-local" className={inputClass} value={end} onChange={e=>setEnd(e.target.value)} /></label><Button disabled={busy||!selected||!start||!end} onClick={()=>void action(()=>rpc('h4_duty',{p_facility:facility,p_user:selected,p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_request:crypto.randomUUID()}))}>Save duty</Button></Card>
        <p className="text-sm text-muted-foreground">Recorded duties within the last 7 and next 14 days, up to 100 entries. Overlapping assignments are rejected by the server.</p>
        {!operations.duties.length && <Card>No duties recorded in this window.</Card>}
        {operations.duties.map((d:any)=><Card key={d.id}><strong>{memberName(d.user_id)}</strong><p>{new Date(d.starts_at).toLocaleString()} – {new Date(d.ends_at).toLocaleString()}</p><Badge>{d.membership_current?'Current member':'Membership ended'}</Badge></Card>)}
      </>}
      {moduleKey === 'inventory' && <>
        <p className="text-sm text-muted-foreground">Non-medicine supplies. Stock changes require a quantity, reason and source reference. Up to 100 items are shown.</p>
        <Card className="space-y-3"><h2 className="font-semibold">Register supply item</h2><label>Item code<input className={inputClass} value={code} onChange={e=>setCode(e.target.value)} /></label><label>Name<input className={inputClass} value={name} onChange={e=>setName(e.target.value)} /></label><label>Unit<input className={inputClass} value={unit} onChange={e=>setUnit(e.target.value)} /></label><Button disabled={busy||!code||!name||!unit} onClick={()=>void action(()=>rpc('h4_store_item',{p_facility:facility,p_code:code,p_name:name,p_unit:unit}))}>Register item</Button></Card>
        <Card className="space-y-3"><h2 className="font-semibold">Receive / issue supplies</h2><label>Item<select className={inputClass} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose supply</option>{operations.store_items.map((x:any)=><option key={x.id} value={x.id}>{x.name} · {x.quantity} {x.unit}</option>)}</select></label><label>Quantity change (positive receipt, negative issue)<input type="number" className={inputClass} value={delta} onChange={e=>setDelta(e.target.value)} /></label><label>Reason<input className={inputClass} value={reason} onChange={e=>setReason(e.target.value)} /></label><label>Receipt / issue reference<input className={inputClass} value={reference} onChange={e=>setReference(e.target.value)} /></label><Button disabled={busy||!selected||!Number(delta)||!reason||!reference} onClick={()=>void action(()=>rpc('h4_store_move',{p_item:selected,p_delta:Number(delta),p_reason:reason,p_reference:reference,p_request:crypto.randomUUID()}))}>Record movement</Button></Card>
        {!operations.store_items.length && <Card>No supplies registered.</Card>}
        {operations.store_items.map((x:any)=><Card key={x.id}><strong>{x.name}</strong><p>{x.quantity} {x.unit}</p><p className="text-xs">Updated {new Date(x.updated_at).toLocaleString()}</p></Card>)}
      </>}
      <div className="flex gap-2"><Button disabled={offset===0||busy} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous {moduleKey==='departments'?'departments / ':''}staff</Button><Button disabled={busy||(staff.length<50&&(setup.departments?.length??0)<50)||offset>=9950} onClick={()=>setOffset(offset+50)}>Next {moduleKey==='departments'?'departments / ':''}staff</Button></div>
    </>}
  </div>
}
