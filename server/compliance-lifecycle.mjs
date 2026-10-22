import {createClient} from '@supabase/supabase-js';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const DAY=86400000;
function isoDate(d){return new Date(d).toISOString().slice(0,10)}
function daysFromToday(date){const a=new Date(isoDate(Date.now())+'T00:00:00Z');const b=new Date(date+'T00:00:00Z');return Math.round((b-a)/DAY)}
function recurrence(summary,applies){const t=(summary+' '+applies).toLowerCase();let m=t.match(/every\s+(\d+)\s+days?/);if(m)return {kind:'days',n:Number(m[1])};m=t.match(/every\s+(\d+)\s+(?:months?|month)/);if(m)return {kind:'months',n:Number(m[1])};if(/\bannual(?:ly)?\b|every\s+year|once\s+(?:each|per)\s+year/.test(t))return {kind:'months',n:12};return null}
function nextRecurring(base,r){const d=new Date(base+'T00:00:00Z');if(r.kind==='days')d.setUTCDate(d.getUTCDate()+r.n);else d.setUTCMonth(d.getUTCMonth()+r.n);return isoDate(d)}
async function notify(ownerId,propertyId,title,body,dueAt=null){let q=admin.from('notifications').select('id').eq('owner_id',ownerId).eq('entity_id',propertyId).eq('type','compliance_lifecycle').eq('title',title).eq('body',body);const {data}=await q.maybeSingle();if(!data)await admin.from('notifications').insert({owner_id:ownerId,type:'compliance_lifecycle',entity_type:'property',entity_id:propertyId,title,body});}
async function audit(ownerId,propertyId,summary,details){const cutoff=new Date(Date.now()-23*60*60*1000).toISOString();const {data}=await admin.from('ai_actions').select('id').eq('owner_id',ownerId).eq('action_type','nova_compliance_lifecycle').eq('summary',summary).gte('created_at',cutoff).maybeSingle();if(!data)await admin.from('ai_actions').insert({owner_id:ownerId,property_id:propertyId,action_type:'nova_compliance_lifecycle',summary,details,status:'completed'});}
export async function runComplianceLifecycle(){
 if(!admin)return [];
 const {data:matches,error}=await admin.from('property_compliance_matches').select('id,owner_id,property_id,requirement_id,applicability,next_action_date,last_verified_at').eq('applicability','applies');if(error)throw error;
 const results=[];
 for(const m of matches||[]){
  const {data:r}=await admin.from('compliance_requirements').select('id,title,requirement_summary,applies_when,next_action_date,status,verification_state,evidence_state,legal_citation,source_authority').eq('id',m.requirement_id).single();
  if(!r||r.status!=='active'||r.verification_state!=='source_verified'||r.evidence_state!=='source_verified')continue;
  let due=m.next_action_date||r.next_action_date||null;
  const rec=recurrence(r.requirement_summary||'',r.applies_when||'');
  if(due&&rec&&daysFromToday(due)<0){let guard=0;while(daysFromToday(due)<0&&guard++<120)due=nextRecurring(due,rec);if(due!==m.next_action_date)await admin.from('property_compliance_matches').update({next_action_date:due}).eq('id',m.id);}
  if(!due){results.push({match:m.id,state:'tracked_no_deterministic_deadline'});continue;}
  const days=daysFromToday(due);if(days>30)continue;
  const label=days<0?'overdue':days===0?'due today':`due in ${days} days`;
  const title=`Verified compliance action ${label}`;
  const body=`${r.title} — ${due}. Citation: ${r.legal_citation||'verified official source'}. Source: ${r.source_authority||'official authority'}.`;
  await notify(m.owner_id,m.property_id,title,body,due);
  await audit(m.owner_id,m.property_id,`Compliance lifecycle: ${r.title}`,{requirement_id:r.id,match_id:m.id,due_date:due,days_remaining:days,citation:r.legal_citation,source:r.source_authority,deterministic:true});
  results.push({match:m.id,state:label,due});
 }
 return results;
}
export function startComplianceLifecycle(){if(!admin)return;setTimeout(()=>runComplianceLifecycle().catch(e=>console.error('compliance-lifecycle',e)),3*60*1000);setInterval(()=>runComplianceLifecycle().catch(e=>console.error('compliance-lifecycle',e)),6*60*60*1000);}
