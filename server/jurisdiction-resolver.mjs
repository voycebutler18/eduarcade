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
    const g=match.geographies||{};const state=firstGeo(g,'States');const county=firstGeo(g,'Counties');
    const place=firstGeo(g,'Incorporated Places')||firstGeo(g,'Census Designated Places');
    return {country_code:'US',country_name:'United States',admin_area_1:match.addressComponents?.state||p.state,admin_area_2:county?.NAME||null,locality:place?.NAME||match.addressComponents?.city||p.city,jurisdiction_verified_at:new Date().toISOString()};
  } finally {clearTimeout(timer)}
}
async function noticeCoverage(p){
  const {data:sources}=await admin.from('compliance_source_registry').select('id,authority_level').eq('active',true).eq('country_code',p.country_code||'US');
  const {data:state}=await admin.from('compliance_source_registry').select('id').eq('active',true).eq('country_code',p.country_code||'US').eq('admin_area_1',p.admin_area_1||p.state).limit(1);
  const {data:county}=p.admin_area_2?await admin.from('compliance_source_registry').select('id').eq('active',true).eq('country_code',p.country_code||'US').eq('admin_area_1',p.admin_area_1||p.state).eq('admin_area_2',p.admin_area_2).limit(1):{data:[]};
  const {data:local}=p.locality?await admin.from('compliance_source_registry').select('id').eq('active',true).eq('country_code',p.country_code||'US').eq('admin_area_1',p.admin_area_1||p.state).eq('locality',p.locality).limit(1):{data:[]};
  const gaps=[];if(!(sources||[]).length)gaps.push('national');if(!(state||[]).length)gaps.push('state/region');if(p.admin_area_2&&!(county||[]).length)gaps.push('county/district');if(p.locality&&!(local||[]).length)gaps.push('city/municipality');
  if(!gaps.length)return;
  const body='NOVA resolved this property to '+[p.locality,p.admin_area_2,p.admin_area_1||p.state,p.country_code].filter(Boolean).join(', ')+'. Official compliance-source coverage is still missing at: '+gaps.join(', ')+'. RentPilot will not invent legal requirements for uncovered jurisdictions.';
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
      try{const resolved=await resolveUSProperty(p);if(resolved){const {data}=await admin.from('properties').update(resolved).eq('id',p.id).select('*').single();if(data)p=data}}catch(e){console.error('jurisdiction resolve',p.id,e?.message||e)}
    }
    await noticeCoverage(p);
  }
}
export function startJurisdictionResolver(){
  if(!admin)return;
  setTimeout(()=>runJurisdictionResolver().catch(e=>console.error('jurisdiction-resolver',e)),10000);
  setInterval(()=>runJurisdictionResolver().catch(e=>console.error('jurisdiction-resolver',e)),6*60*60*1000);
}
