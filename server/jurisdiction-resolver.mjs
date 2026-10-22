import {createClient} from '@supabase/supabase-js';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;

function firstGeo(geographies,name){const rows=geographies?.[name];return Array.isArray(rows)&&rows.length?rows[0]:null}
async function resolveUSProperty(p){
  const address=[p.address_line1,p.city,p.state,p.postal_code].filter(Boolean).join(', ');
  if(!p.address_line1||!p.state||(!p.city&&!p.postal_code))return null;
  const qs=new URLSearchParams({address,benchmark:'Public_AR_Current',vintage:'Current_Current',format:'json'});
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    const r=await fetch('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?'+qs,{signal:ctrl.signal,headers:{'user-agent':'RentPilot-Jurisdiction-Resolver/1.0'}});
    if(!r.ok)return null;const j=await r.json();const match=j?.result?.addressMatches?.[0];if(!match)return null;
    const g=match.geographies||{};const county=firstGeo(g,'Counties');const incorporated=firstGeo(g,'Incorporated Places');const cdp=firstGeo(g,'Census Designated Places');const place=incorporated||cdp;
    return {fields:{country_code:'US',country_name:'United States',admin_area_1:match.addressComponents?.state||p.state,admin_area_2:county?.NAME||null,locality:place?.NAME||match.addressComponents?.city||p.city,jurisdiction_verified_at:new Date().toISOString()},evidence:{matchedAddress:match.matchedAddress||address,coordinates:match.coordinates||null,state:match.addressComponents?.state||p.state,county:county?.NAME||null,place:place?.NAME||null,placeType:incorporated?'incorporated_place':cdp?'census_designated_place':'address_city',rawAddressComponents:match.addressComponents||{}}};
  } finally {clearTimeout(timer)}
}
async function saveBinding(p,resolved){
  if(!resolved)return;
  await admin.from('property_jurisdiction_bindings').upsert({owner_id:p.owner_id,property_id:p.id,country_code:resolved.fields.country_code,admin_area_1:resolved.fields.admin_area_1,admin_area_2:resolved.fields.admin_area_2,locality:resolved.fields.locality,postal_code:p.postal_code||null,resolver:'US Census Geocoder',resolver_payload:resolved.evidence,confidence:resolved.evidence.placeType==='incorporated_place'?1:.95,verified_at:resolved.fields.jurisdiction_verified_at,last_resolved_at:new Date().toISOString()},{onConflict:'property_id'});
  await admin.from('compliance_evidence_chain').insert({owner_id:p.owner_id,property_id:p.id,evidence_type:'jurisdiction_resolution',evidence:resolved.evidence,source_url:'https://geocoding.geo.census.gov/geocoder/',captured_at:new Date().toISOString()});
}
async function noticeCoverage(p){
  const country=p.country_code||'US',state=p.admin_area_1||p.state;
  const {data:national}=await admin.from('compliance_source_registry').select('id').eq('active',true).eq('country_code',country).eq('authority_level','national').limit(1);
  const {data:stateRows}=state?await admin.from('compliance_source_registry').select('id').eq('active',true).eq('country_code',country).eq('admin_area_1',state).eq('authority_level','state_province_region').limit(1):{data:[]};
  const {data:county}=p.admin_area_2?await admin.from('compliance_source_registry').select('id').eq('active',true).eq('country_code',country).eq('admin_area_1',state).eq('admin_area_2',p.admin_area_2).eq('authority_level','county_district').limit(1):{data:[]};
  const {data:local}=p.locality?await admin.from('compliance_source_registry').select('id').eq('active',true).eq('country_code',country).eq('admin_area_1',state).eq('locality',p.locality).eq('authority_level','city_municipality').limit(1):{data:[]};
  const gaps=[];if(!(national||[]).length)gaps.push('national');if(state&&!(stateRows||[]).length)gaps.push('state/region');if(p.admin_area_2&&!(county||[]).length)gaps.push('county/district');if(p.locality&&!(local||[]).length)gaps.push('city/municipality');
  if(!gaps.length)return;
  const body='NOVA resolved this property to '+[p.locality,p.admin_area_2,state,country].filter(Boolean).join(', ')+'. Official compliance-source coverage is still missing at: '+gaps.join(', ')+'. RentPilot will not invent legal requirements for uncovered jurisdictions.';
  const {data:existing}=await admin.from('notifications').select('id').eq('owner_id',p.owner_id).eq('entity_id',p.id).eq('type','compliance_coverage').eq('body',body).maybeSingle();
  if(!existing)await admin.from('notifications').insert({owner_id:p.owner_id,type:'compliance_coverage',entity_type:'property',entity_id:p.id,title:'Compliance source coverage gap',body});
}
export async function runJurisdictionResolver(){
  if(!admin)return;
  const {data:props,error}=await admin.from('properties').select('*');if(error)throw error;
  for(const original of props||[]){
    let p=original;
    const isUS=(p.country_code||'US')==='US';
    if(isUS&&!p.jurisdiction_verified_at){
      try{const resolved=await resolveUSProperty(p);if(resolved){const {data}=await admin.from('properties').update(resolved.fields).eq('id',p.id).select('*').single();if(data){p=data;await saveBinding(p,resolved)}}}catch(e){console.error('jurisdiction resolve',p.id,e?.message||e)}
    }else if(isUS&&p.jurisdiction_verified_at){
      const {data:binding}=await admin.from('property_jurisdiction_bindings').select('id').eq('property_id',p.id).maybeSingle();
      if(!binding){try{const resolved=await resolveUSProperty(p);if(resolved)await saveBinding(p,resolved)}catch(e){console.error('jurisdiction evidence',p.id,e?.message||e)}}
    }
    await noticeCoverage(p);
  }
}
export function startJurisdictionResolver(){
  if(!admin)return;
  setTimeout(()=>runJurisdictionResolver().catch(e=>console.error('jurisdiction-resolver',e)),10000);
  setInterval(()=>runJurisdictionResolver().catch(e=>console.error('jurisdiction-resolver',e)),6*60*60*1000);
}
