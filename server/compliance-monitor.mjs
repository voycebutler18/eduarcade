import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const MAX_BYTES=512*1024;

function norm(v){return String(v??'').trim().toLowerCase()}
function same(a,b){return norm(a)===norm(b)}
function has(v){return v!==null&&v!==undefined&&String(v).trim()!==''}

async function fingerprintUrl(url){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),20000);
  try{
    const r=await fetch(url,{signal:ctrl.signal,redirect:'follow',headers:{'user-agent':'RentPilot-Compliance-Monitor/1.0 (+https://rentpilot-ai.onrender.com)'}});
    const chunks=[];let size=0;
    if(r.body){
      const reader=r.body.getReader();
      while(size<MAX_BYTES){
        const {done,value}=await reader.read(); if(done)break;
        const take=value.slice(0,Math.max(0,MAX_BYTES-size)); chunks.push(take); size+=take.length;
        if(size>=MAX_BYTES)break;
      }
      try{reader.cancel()}catch{}
    }
    const h=createHash('sha256');
    h.update(String(r.status));h.update('|'+(r.headers.get('etag')||''));h.update('|'+(r.headers.get('last-modified')||''));h.update('|'+(r.headers.get('content-length')||''));
    for(const c of chunks)h.update(c);
    return {ok:r.ok,status:r.status,fingerprint:h.digest('hex'),etag:r.headers.get('etag'),lastModified:r.headers.get('last-modified'),contentLength:Number(r.headers.get('content-length')||0)||null};
  } finally {clearTimeout(timer)}
}

function scopeMatches(req,p){
  if(req.country_code && !same(req.country_code,p.country_code))return false;
  const state=p.admin_area_1||p.state;
  const city=p.locality||p.city;
  if(req.admin_area_1 && !same(req.admin_area_1,state))return false;
  if(req.locality && !same(req.locality,city))return false;
  return true;
}
function fieldValue(field,p,profile){
  const map={country_code:p.country_code,admin_area_1:p.admin_area_1||p.state,locality:p.locality||p.city,address_line1:p.address_line1,postal_code:p.postal_code,year_built:profile?.year_built,property_type:profile?.property_type,unit_count:profile?.unit_count,owner_occupied:profile?.owner_occupied,subsidized_program:profile?.subsidized_program,has_pool:profile?.has_pool,has_elevator:profile?.has_elevator,has_boiler:profile?.has_boiler,has_fire_suppression:profile?.has_fire_suppression};
  return map[field];
}
function evaluateRules(rules={},p,profile){
  const y=Number(profile?.year_built||0), units=Number(profile?.unit_count||0), type=norm(profile?.property_type), program=norm(profile?.subsidized_program);
  if(rules.year_built_before!=null && !(y>0&&y<Number(rules.year_built_before)))return false;
  if(rules.year_built_on_or_after!=null && !(y>=Number(rules.year_built_on_or_after)))return false;
  if(Array.isArray(rules.property_type_in)&&rules.property_type_in.length&&!rules.property_type_in.map(norm).includes(type))return false;
  if(rules.unit_count_min!=null && !(units>=Number(rules.unit_count_min)))return false;
  if(rules.unit_count_max!=null && !(units<=Number(rules.unit_count_max)))return false;
  if(rules.owner_occupied!=null && Boolean(profile?.owner_occupied)!==Boolean(rules.owner_occupied))return false;
  if(Array.isArray(rules.subsidized_program_in)&&rules.subsidized_program_in.length&&!rules.subsidized_program_in.map(norm).includes(program))return false;
  for(const k of ['has_pool','has_elevator','has_boiler','has_fire_suppression']) if(rules[k]!=null&&Boolean(profile?.[k])!==Boolean(rules[k]))return false;
  return true;
}
async function addNotice(ownerId,propertyId,type,title,body,matchId=null,dueAt=null){
  let q=admin.from('compliance_notifications').select('id').eq('owner_id',ownerId).eq('property_id',propertyId).eq('notification_type',type).eq('title',title);
  q=dueAt?q.eq('due_at',dueAt):q.is('due_at',null);
  const {data:existing}=await q.maybeSingle();
  if(existing)return;
  const {data:created,error}=await admin.from('compliance_notifications').insert({owner_id:ownerId,property_id:propertyId,match_id:matchId,notification_type:type,title,body,due_at:dueAt}).select('id').single();
  if(!error&&created)await admin.from('notifications').insert({owner_id:ownerId,type:'compliance',entity_type:'property',entity_id:propertyId,title,body});
}
async function monitorSources(){
  const now=new Date().toISOString();
  const {data:sources,error}=await admin.from('compliance_source_registry').select('*').eq('active',true).or('next_check_at.is.null,next_check_at.lte.'+now);
  if(error)throw error;
  for(const s of sources||[]){
    const before=s.last_fingerprint||null; const run=(await admin.from('compliance_monitor_runs').insert({source_id:s.id,status:'running',fingerprint_before:before}).select('id').single()).data;
    try{
      const f=await fingerprintUrl(s.machine_endpoint||s.base_url);
      const changed=Boolean(before&&before!==f.fingerprint);
      await admin.from('compliance_source_snapshots').insert({source_registry_id:s.id,fingerprint:f.fingerprint,http_status:f.status,etag:f.etag,last_modified:f.lastModified,content_length:f.contentLength,changed});
      const next=new Date(Date.now()+Math.max(1,Number(s.check_interval_hours||24))*3600000).toISOString();
      await admin.from('compliance_source_registry').update({last_checked_at:now,last_fingerprint:f.fingerprint,last_http_status:f.status,last_error:null,consecutive_failures:0,next_check_at:next}).eq('id',s.id);
      await admin.from('compliance_monitor_runs').update({finished_at:new Date().toISOString(),status:f.ok?'completed':'http_error',fingerprint_after:f.fingerprint,change_detected:changed,error_message:f.ok?null:'HTTP '+f.status}).eq('id',run.id);
      if(changed){
        const {data:props}=await admin.from('properties').select('id,owner_id,name,country_code,admin_area_1,state,locality,city').eq('country_code',s.country_code);
        for(const p of props||[]){
          if(s.admin_area_1&&!same(s.admin_area_1,p.admin_area_1||p.state))continue;
          if(s.locality&&!same(s.locality,p.locality||p.city))continue;
          await addNotice(p.owner_id,p.id,'source_changed','Official compliance source changed — verification pending',`${s.authority_name} published a detectable source change. RentPilot will not call this a legal change until the affected rule is re-verified.`);
        }
      }
    }catch(e){
      const failures=Number(s.consecutive_failures||0)+1,next=new Date(Date.now()+Math.min(24,Math.max(1,failures))*3600000).toISOString();
      await admin.from('compliance_source_registry').update({last_checked_at:now,last_error:String(e?.message||e).slice(0,1000),consecutive_failures:failures,next_check_at:next}).eq('id',s.id);
      await admin.from('compliance_monitor_runs').update({finished_at:new Date().toISOString(),status:'failed',error_message:String(e?.message||e).slice(0,1000)}).eq('id',run.id);
    }
  }
}
async function rematchVerifiedRules(){
  const [{data:reqs},{data:props},{data:profiles}]=await Promise.all([
    admin.from('compliance_requirements').select('*').eq('status','active').eq('verification_state','verified'),
    admin.from('properties').select('*'),
    admin.from('property_compliance_profiles').select('*')
  ]);
  const profileByProperty=new Map((profiles||[]).map(x=>[x.property_id,x]));
  for(const p of props||[])for(const r of reqs||[]){
    if(!scopeMatches(r,p))continue;
    const profile=profileByProperty.get(p.id)||null;
    const required=Array.isArray(r.required_fields)?r.required_fields:[];
    const missing=required.filter(f=>!has(fieldValue(f,p,profile)));
    let applicability='unknown',reason='Missing property information';
    if(!missing.length){const applies=evaluateRules(r.applicability_rules||{},p,profile);applicability=applies?'applies':'not_applicable';reason=applies?'Verified rule matched deterministic property facts':'Verified rule conditions did not match property facts'}
    const {data:match,error}=await admin.from('property_compliance_matches').upsert({owner_id:p.owner_id,property_id:p.id,requirement_id:r.id,source_id:r.source_id,applicability,reason,missing_fields:missing,effective_date:r.effective_date,next_action_date:r.next_action_date,last_verified_at:r.last_verified_at,rule_version:r.rule_version,source_fingerprint:r.source_fingerprint},{onConflict:'property_id,requirement_id'}).select('id').single();
    if(error)continue;
    if(missing.length){
      for(const f of missing){const {data:open}=await admin.from('compliance_data_requests').select('id').eq('property_id',p.id).eq('requirement_id',r.id).eq('field_name',f).eq('status','open').maybeSingle();if(!open)await admin.from('compliance_data_requests').insert({owner_id:p.owner_id,property_id:p.id,requirement_id:r.id,field_name:f,prompt:`RentPilot needs ${f.replaceAll('_',' ')} to determine whether “${r.title}” applies to this property.`});}
      await addNotice(p.owner_id,p.id,'missing_information','More property information needed',`RentPilot needs ${missing.join(', ')} before it can determine whether “${r.title}” applies.`,match.id);
    }else{
      await admin.from('compliance_data_requests').update({status:'resolved',resolved_at:new Date().toISOString()}).eq('property_id',p.id).eq('requirement_id',r.id).eq('status','open');
      if(applicability==='applies')await addNotice(p.owner_id,p.id,'verified_requirement','Verified compliance requirement matched',`${r.title}. Source: ${r.source_authority||'verified authority'}.`,match.id,r.next_action_date?new Date(r.next_action_date+'T09:00:00Z').toISOString():null);
    }
  }
}
async function dueReminders(){
  const today=new Date(), soon=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const {data:matches}=await admin.from('property_compliance_matches').select('id,owner_id,property_id,next_action_date,requirement_id').eq('applicability','applies').lte('next_action_date',soon);
  for(const m of matches||[]){
    if(!m.next_action_date)continue;
    const {data:r}=await admin.from('compliance_requirements').select('title,source_authority').eq('id',m.requirement_id).single();
    const days=Math.ceil((new Date(m.next_action_date+'T00:00:00Z')-today)/86400000);
    const label=days<0?'overdue':days===0?'due today':`due in ${days} days`;
    await addNotice(m.owner_id,m.property_id,'deadline_reminder',`Compliance action ${label}`,`${r?.title||'Verified compliance action'} — ${m.next_action_date}. Source: ${r?.source_authority||'verified authority'}.`,m.id,new Date(m.next_action_date+'T09:00:00Z').toISOString());
  }
}
export async function runComplianceMonitor(){
  if(!admin){console.warn('Compliance monitor disabled: Supabase service role missing');return}
  await monitorSources();await rematchVerifiedRules();await dueReminders();
}
export function startComplianceMonitor(){
  if(!admin)return;
  setTimeout(()=>runComplianceMonitor().catch(e=>console.error('compliance-monitor',e)),15000);
  setInterval(()=>runComplianceMonitor().catch(e=>console.error('compliance-monitor',e)),6*60*60*1000);
}
