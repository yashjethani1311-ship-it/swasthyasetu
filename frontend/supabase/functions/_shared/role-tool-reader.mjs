// All RPCs run with the caller's JWT. Discovery is a bounded public directory,
// never a patient search or a claim about medicine stock / opening hours.
export function createRoleToolReader(rpc){
 return async(tool,scope,question='',args=null)=>{
  const semantic=args!==null;
  args=args||{};
  if(!['d1_practices','d1_facilities','discover_pharmacies'].includes(tool))return rpc('a3_tool',{p_tool:tool,p_scope:scope});
  const filters={};
  for(const key of ['state','district','city','latitude','longitude','radius_km'])if(scope[key]!==undefined&&scope[key]!==null)filters[key]=scope[key];
  if(args.city)filters.city=args.city;
  if(args.state)filters.state=args.state;
  if(args.district)filters.district=args.district;

  if(tool==='d1_practices'){
   if(args.search){
    filters.search=args.search;
   }else if(!semantic){
    const nameMatch = question.match(/(?:dr\.?|doctor|vaidya|practitioner|physician)\s+([a-z]+(?:\s+[a-z]+)?)|(?:timings?|schedule|clinic|fees?)\s+of\s+([a-z]+(?:\s+[a-z]+)?)/i);
    const candidate = (nameMatch?.[1] || nameMatch?.[2] || '').trim();
    if(candidate && !/^(?:for|near|in|at|who|the|a|an|to|with|hospital|clinic|appointment|medicine|specialist|cardio|skin|ortho|pediatric|gynae|eye)/i.test(candidate)){
     filters.search=candidate;
    }
   }
   if(args.specialization){
    filters.specialization=args.specialization;
   }else if(!semantic){
    const specialties=[[/cardio|heart|हृदय/i,'Cardiology'],[/skin|dermatolog|त्वचा/i,'Dermatology'],[/ortho|हड्डी/i,'Orthopedics'],[/pediatric|बच्च/i,'Pediatrics'],[/gynae|महिला/i,'Gynecology'],[/ophthalm|eye|नेत्र/i,'Ophthalmology']];
    const match=specialties.find(([pattern])=>pattern.test(question));
    if(match)filters.specialization=match[1];
   }
  }

  if(tool==='discover_pharmacies')filters.type='PHARMACY';
  if(tool!=='d1_practices'&&args.search)filters.search=args.search;

  if(tool==='d1_facilities'){
   if(args.type){
    filters.type=args.type;
   }else if(args.search){
    filters.search=args.search;
   }else if(!semantic&&/hospital|अस्पताल/i.test(question)){
    filters.type='HOSPITAL';
   }else if(!semantic&&/patholog|lab|diagnostic|test cent|जाँच केंद्र|प्रयोगशाला/i.test(question)){
    filters.type='DIAGNOSTIC_LAB';
   }else if(!semantic&&/pharmac|chemist|medical store|दवा की दुकान|मेडिकल स्टोर|davai|dawai/i.test(question)){
    filters.type='PHARMACY';
   }
  }

  const data=await rpc(tool==='d1_practices'?'d1_practices':'d1_facilities',{p_filters:filters,p_offset:0,p_limit:10});
  if(!Array.isArray(data)||data.length>10)throw Error('INVALID_TOOL_RESULT');
  return {tool,scope,actor_role:'DIRECTORY',purpose:'AI_ASSISTANCE',data,provenance:tool==='d1_practices'?'d1_practices':'d1_facilities',retrieved_at:new Date().toISOString(),uncertainty:'First 10 verified directory results only. Location is constrained only by supplied state/district. Medicine stock and opening hours are unknown.'};
 };
}
