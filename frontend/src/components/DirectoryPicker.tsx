import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from './kit'

export function DirectoryPicker({kind,label,value,onChange,facilityId,disabled=false}: {
  kind: 'doctor' | 'facility'; label: string; value: string; onChange: (id: string) => void; facilityId?: string; disabled?: boolean
}) {
  const [search,setSearch]=useState('')
  const [offset,setOffset]=useState(0)
  const [rows,setRows]=useState<{id:string;name:string}[]>([])
  const [count,setCount]=useState(0)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  useEffect(()=>{
    let active=true
    const timer=setTimeout(async()=>{
      setError('')
      if (!search.trim() && !facilityId) {setRows([]);setCount(0);return}
      setLoading(true)
      const filters: Record<string,string>={}
      if(search.trim())filters.search=search.trim()
      if(kind==='doctor' && facilityId)filters.facility_id=facilityId
      const result=await supabase.rpc(kind==='doctor'?'d1_practices':'d1_facilities',{p_filters:filters,p_offset:offset,p_limit:25})
      if(!active)return
      setLoading(false)
      if(result.error){setError('Directory unavailable. Please try again.');setRows([]);return}
      setCount(result.data?.length??0)
      setRows([...new Map<string,{id:string;name:string}>((result.data??[]).map((r:any)=>{
        const id=kind==='doctor'?r.doctor_id:r.facility_id
        return [id,{id,name:kind==='doctor'?`${r.doctor_name} · ${r.specialization||'Specialty not recorded'} · ${r.city||''}`:`${r.name} · ${r.city||''}`}]
      })).values()])
    },300)
    return ()=>{active=false;clearTimeout(timer)}
  },[kind,search,offset,facilityId])
  return <div className="space-y-2">
    <label className="block text-sm">{label} search<input aria-label={`${label} search`} disabled={disabled} value={search} maxLength={100} onChange={e=>{setSearch(e.target.value);setOffset(0);onChange('')}} className="mt-1 w-full rounded-lg border p-2" placeholder="Search by name" /></label>
    <select aria-label={label} disabled={disabled||loading} value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-lg border p-2"><option value="">{loading?'Searching…':'Select a result'}</option>{rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:!rows.length&&!loading?<p className="text-xs text-muted-foreground">{search.trim()||facilityId?'No matching results.':'Enter a name to search.'}</p>:null}
    <div className="flex gap-2"><Button variant="outline" size="sm" disabled={disabled||loading||offset===0} onClick={()=>{setOffset(Math.max(0,offset-25));onChange('')}}>Previous</Button><Button variant="outline" size="sm" disabled={disabled||loading||count<25} onClick={()=>{setOffset(offset+25);onChange('')}}>Next</Button></div>
  </div>
}
