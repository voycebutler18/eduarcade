import {createClient} from '@supabase/supabase-js';
import {runJurisdictionResolver} from './jurisdiction-resolver.mjs';
import {runComplianceMonitor} from './compliance-monitor.mjs';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const WORKER_ID=process.env.RENDER_INSTANCE_ID||process.env.HOSTNAME||`rentpilot-backend-${process.pid}`;\nconst GROQ_URL='https://api.groq.com/openai/v1/chat/completions';\nconst VISION_MODEL=process.env.GROQ_VISION_MODEL||'qwen/qwen3.8-27b';

function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function openStatus(v){return !['completed','closed','cancelled','resolved'].includes(String(v||'').toLowerCase())}
function norm(v){return String(v||'').trim().toLowerCase()}
function tradeFor(req){
  const s=[req.category,req.issue_type,req.title,req.description].map(norm).join(' ');
  if(/plumb|leak|pipe|toilet|sink|faucet|water heater|drain|sewer/.test(s))return 'plumbing';
  if(/hvac|air condition|a\/c|ac |heat|furnace|thermostat/.test(s))return 'hvac';
  if(/electric|outlet|breaker|power|wiring|light fixture/.test(s))return 'electrical';
  if(/lock|key|door|deadbolt/.test(s))return 'locksmith';
  if(/roof|shingle|ceiling leak/.test(s))return 'roofing';
  if(/appliance|refrigerator|fridge|oven|range|dishwasher|washer|dryer/.test(s))return 'appliance';
  if(/pest|roach|rodent|termite|bed bug/.test(s))return 'pest control';
  return norm(req.category)||norm(req.issue_type)||'general maintenance';
}
function urgent(req){return ['urgent','emergency','high'].includes(norm(req.priority))}
async function getMaintenance(id){
  const {data,error}=await admin.from('maintenance_requests').select('*').eq('id',id).maybeSingle();
  if(error)throw error;return data;
}
async function addAssessment(task,values){
  const row={owner_id:task.owner_id,maintenance_request_id:task.entity_id,task_id:task.task_id,agent_key:task.agent_key,...values};
  const {error}=await admin.from('maintenance_agent_assessments').upsert(row,{onConflict:'task_id,agent_key'});
  if(error)throw error;
}
async function addAction(task,type,summary,metadata={}){
  const {data:existing,error:readError}=await admin.from('ai_actions').select('id').eq('owner_id',task.owner_id).eq('action_type',type).eq('entity_id',task.entity_id).contains('metadata',{task_id:task.task_id}).maybeSingle();
  if(readError)throw readError;if(existing)return existing.id;
  const {data,error}=await admin.from('ai_actions').insert({owner_id:task.owner_id,action_type:type,entity_type:'maintenance_request',entity_id:task.entity_id,status:'pending',summary,metadata:{task_id:task.task_id,...metadata}}).select('id').single();
  if(error)throw error;return data.id;
}

async function runRentFollowups(){const {data,error}=await admin.rpc('refresh_rent_followup_queue');if(error)throw error;return {refresh:data??true}}
async function ledgerReconciliation(task){
  const {data:p,error}=await admin.from('payments').select('*').eq('id',task.entity_id).maybeSingle();if(error)throw error;
  if(!p)return {state:'payment_missing'};if(!p.rent_charge_id)return {state:'unallocated_payment',payment_id:p.id,amount:num(p.amount)};
  const [{data:charge,error:ce},{data:payments,error:pe}]=await Promise.all([admin.from('rent_charges').select('id,amount,status,due_date').eq('id',p.rent_charge_id).maybeSingle(),admin.from('payments').select('amount').eq('rent_charge_id',p.rent_charge_id)]);
  if(ce)throw ce;if(pe)throw pe;if(!charge)return {state:'charge_missing',payment_id:p.id,rent_charge_id:p.rent_charge_id};
  const paid=(payments||[]).reduce((s,x)=>s+num(x.amount),0),chargeAmount=num(charge.amount);
  return {state:'reconciled',payment_id:p.id,rent_charge_id:p.rent_charge_id,charge_amount:chargeAmount,recorded_payments:paid,remaining:Math.max(0,chargeAmount-paid),overage:Math.max(0,paid-chargeAmount)};
}
async function repairTracker(task){
  let q=admin.from('maintenance_requests').select('id,status,priority,vendor_id,created_at,updated_at,scheduled_for').eq('owner_id',task.owner_id);if(task.entity_id)q=q.eq('id',task.entity_id);
  const {data,error}=await q;if(error)throw error;const rows=(data||[]).filter(x=>openStatus(x.status)),now=Date.now();
  return {open_count:rows.length,unassigned_count:rows.filter(x=>!x.vendor_id).length,urgent_unassigned_count:rows.filter(x=>!x.vendor_id&&['urgent','emergency','high'].includes(norm(x.priority))).length,oldest_open_hours:rows.length?Math.max(...rows.map(x=>(now-new Date(x.created_at).getTime())/3600000)):0};
}
async function priorityFilter(task){
  const req=await getMaintenance(task.entity_id);if(!req)return {state:'maintenance_missing'};
  const level=urgent(req)?'high':norm(req.priority)||'normal';
  const ageHours=(Date.now()-new Date(req.created_at).getTime())/3600000;
  const needsAttention=urgent(req)||(!req.vendor_id&&ageHours>=24);
  await addAssessment(task,{assessment_type:'priority_routing',severity:level,category:req.category||req.issue_type,confidence:1,recommended_trade:tradeFor(req),requires_human_review:needsAttention,findings:{age_hours:ageHours,vendor_assigned:Boolean(req.vendor_id),source:'deterministic'}});
  if(needsAttention)await addAction(task,'nova_maintenance_priority_review',`Maintenance request needs attention: ${req.title||req.issue_type||'repair request'}.`,{priority:level,property_id:req.property_id,unit_id:req.unit_id,human_approval_required:true,deterministic:true});
  return {state:needsAttention?'attention_required':'routed',priority:level,recommended_trade:tradeFor(req),age_hours:ageHours};
}
async function vendorDispatch(task){
  const req=await getMaintenance(task.entity_id);if(!req)return {state:'maintenance_missing'};
  if(req.vendor_id)return {state:'already_assigned',vendor_id:req.vendor_id};
  const {data:vision}=await admin.from('maintenance_agent_assessments').select('recommended_trade,confidence,findings').eq('maintenance_request_id',req.id).eq('agent_key','damage_triage').eq('assessment_type','vision_triage').order('created_at',{ascending:false}).limit(1).maybeSingle();
  const visionTrade=vision&&num(vision.confidence)>=0.65?norm(vision.recommended_trade):'';
  const desired=visionTrade||tradeFor(req);
  const {data:vendors,error}=await admin.from('vendors').select('id,name,trade,approved').eq('owner_id',task.owner_id).eq('approved',true);if(error)throw error;
  const ranked=(vendors||[]).map(v=>{const t=norm(v.trade);let score=0;if(t===desired)score=100;else if(t.includes(desired)||desired.includes(t))score=80;else if(desired==='general maintenance'&&/handyman|general|maintenance/.test(t))score=70;return {...v,score}}).filter(v=>v.score>0).sort((a,b)=>b.score-a.score);
  const top=ranked.slice(0,5);
  await addAssessment(task,{assessment_type:'vendor_match',severity:norm(req.priority)||'normal',category:req.category||req.issue_type,confidence:top.length?Math.min(1,top[0].score/100):0,recommended_trade:desired,requires_human_review:true,findings:{candidates:top.map(v=>({vendor_id:v.id,name:v.name,trade:v.trade,score:v.score})),auto_assigned:false,trade_source:visionTrade?'vision_assessment':'request_text'}});
  await addAction(task,'nova_vendor_approval_required',top.length?`NOVA matched ${top.length} approved vendor option${top.length===1?'':'s'} for this maintenance request. Approve before dispatch.`:`No approved ${desired} vendor is currently available. Review vendor options before dispatch.`,{property_id:req.property_id,unit_id:req.unit_id,recommended_trade:desired,candidate_vendor_ids:top.map(v=>v.id),human_approval_required:true,auto_dispatch:false,deterministic:true,trade_source:visionTrade?'vision_assessment':'request_text'});
  return {state:top.length?'vendor_candidates_ready':'no_matching_vendor',recommended_trade:desired,candidate_count:top.length,auto_dispatched:false,trade_source:visionTrade?'vision_assessment':'request_text'};
}
async function imageDataUrl(url){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    const r=await fetch(url,{signal:ctrl.signal,redirect:'follow'});
    if(!r.ok)throw new Error('image fetch HTTP '+r.status);
    const type=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!type.startsWith('image/'))throw new Error('maintenance photo is not an image');
    const ab=await r.arrayBuffer();
    if(ab.byteLength>8*1024*1024)throw new Error('maintenance photo exceeds 8MB worker limit');
    return `data:${type};base64,${Buffer.from(ab).toString('base64')}`;
  } finally {clearTimeout(timer)}
}
function cleanVisionJson(raw){
  const s=String(raw||'').replace(/^\`\`\`json\\s*/i,'').replace(/\`\`\`$/,'').trim();
  return JSON.parse(s);
}
async function damageTriage(task){
  const req=await getMaintenance(task.entity_id);if(!req)return {state:'maintenance_missing'};
  const photos=(Array.isArray(req.photo_urls)?req.photo_urls:[]).filter(Boolean).slice(0,3);
  const textSafety=[];const text=norm(`${req.title||''} ${req.description||''} ${req.issue_type||''}`);
  if(/smoke|fire|sparking|gas smell|carbon monoxide|electrical burning/.test(text))textSafety.push('possible_immediate_safety_hazard');
  if(/flood|burst pipe|major leak|ceiling collapse/.test(text))textSafety.push('possible_property_damage_escalation');
  if(!photos.length){
    await addAssessment(task,{assessment_type:'vision_triage',severity:urgent(req)?'high':'unknown',category:req.category||req.issue_type,confidence:0,recommended_trade:tradeFor(req),safety_flags:textSafety,requires_human_review:Boolean(textSafety.length||urgent(req)),findings:{photo_count:0,vision_classification_completed:false,reason:'No maintenance photos were attached. Text-only routing was used.'}});
    if(textSafety.length)await addAction(task,'nova_maintenance_safety_review','Maintenance request text may indicate a safety hazard. Human review is required.',{property_id:req.property_id,unit_id:req.unit_id,safety_flags:textSafety,human_approval_required:true,vision_completed:false});
    return {state:'no_photos',photo_count:0,text_safety_flags:textSafety,recommended_trade:tradeFor(req)};
  }
  if(!process.env.GROQ_API_KEY)throw new Error('GROQ_API_KEY is required for maintenance vision triage');

  const imageParts=[];
  const imageErrors=[];
  for(const url of photos){
    try{imageParts.push({type:'image_url',image_url:{url:await imageDataUrl(url)}})}
    catch(e){imageErrors.push(String(e?.message||e))}
  }
  if(!imageParts.length)throw new Error('No maintenance photos could be loaded: '+imageErrors.join('; '));

  const prompt=`Analyze these tenant-submitted maintenance photos conservatively. Use only what is visible in the images plus the request text below. Do not claim a gas leak, electrical safety condition, structural failure, code violation, mold species, habitability violation, or legal conclusion from an image. You may flag a POSSIBLE hazard that needs human review. Return ONLY JSON with this schema:
{"severity":"low"|"medium"|"high"|"emergency","category":string,"recommended_trade":string,"confidence":number,"observations":string[],"possible_hazards":string[],"human_review_reason":string|null}
Severity means operational urgency, not a legal determination. emergency/high must still be human-reviewed.
Request title: ${req.title||''}
Description: ${req.description||''}
Category: ${req.category||''}
Issue type: ${req.issue_type||''}`;

  const response=await fetch(GROQ_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({
    model:VISION_MODEL,
    messages:[{role:'user',content:[{type:'text',text:prompt},...imageParts]}],
    temperature:0,
    response_format:{type:'json_object'},
    max_completion_tokens:900
  })});
  if(!response.ok)throw new Error('maintenance vision HTTP '+response.status);
  const body=await response.json();
  const vision=cleanVisionJson(body.choices?.[0]?.message?.content||'{}');
  const allowedSeverity=new Set(['low','medium','high','emergency']);
  const severity=allowedSeverity.has(norm(vision.severity))?norm(vision.severity):(urgent(req)?'high':'medium');
  const confidence=Math.max(0,Math.min(1,num(vision.confidence)));
  const hazards=[...new Set([...textSafety,...(Array.isArray(vision.possible_hazards)?vision.possible_hazards.map(x=>String(x).slice(0,240)):[])])];
  const recommendedTrade=String(vision.recommended_trade||tradeFor(req)).slice(0,120);
  const needsHuman=severity==='high'||severity==='emergency'||hazards.length>0||Boolean(vision.human_review_reason);

  await addAssessment(task,{
    assessment_type:'vision_triage',
    severity,
    category:String(vision.category||req.category||req.issue_type||'maintenance').slice(0,120),
    confidence,
    recommended_trade:recommendedTrade,
    safety_flags:hazards,
    requires_human_review:needsHuman,
    findings:{
      photo_count:photos.length,
      analyzed_photo_count:imageParts.length,
      image_errors:imageErrors,
      vision_classification_completed:true,
      model:VISION_MODEL,
      observations:Array.isArray(vision.observations)?vision.observations.slice(0,12).map(x=>String(x).slice(0,500)):[],
      human_review_reason:vision.human_review_reason?String(vision.human_review_reason).slice(0,500):null,
      guardrail:'Vision findings are advisory. No legal, code, habitability, or definitive safety determination is made from photos.'
    }
  });
  if(needsHuman)await addAction(task,'nova_maintenance_safety_review',`Photo triage marked this maintenance request ${severity}. Review the images and findings before safety-sensitive action.`,{property_id:req.property_id,unit_id:req.unit_id,safety_flags:hazards,severity,confidence,human_approval_required:true,vision_completed:true,model:VISION_MODEL});
  return {state:'vision_complete',severity,confidence,recommended_trade:recommendedTrade,possible_hazards:hazards,requires_human_review:needsHuman,model:VISION_MODEL};
}
async function tenantWelcomer(task){
  const {data:lease,error}=await admin.from('leases').select('id,tenant_id,unit_id,status,start_date').eq('id',task.entity_id).maybeSingle();if(error)throw error;if(!lease)return {state:'lease_missing'};
  const {data:tenant,error:te}=await admin.from('tenants').select('id,resident_account_active,user_id,email').eq('id',lease.tenant_id).maybeSingle();if(te)throw te;
  return {state:tenant?.resident_account_active?'resident_access_active':'resident_access_pending',lease_id:lease.id,tenant_id:lease.tenant_id,resident_account_active:Boolean(tenant?.resident_account_active),user_linked:Boolean(tenant?.user_id)};
}
async function defaultTimeline(task){
  const {data:lease,error}=await admin.from('leases').select('id,status,start_date,end_date,unit_id,tenant_id').eq('id',task.entity_id).maybeSingle();if(error)throw error;if(!lease)return {state:'lease_missing'};
  const {data:unit,error:ue}=await admin.from('units').select('property_id').eq('id',lease.unit_id).maybeSingle();if(ue)throw ue;
  if(unit?.property_id){const {data:existing}=await admin.from('ai_actions').select('id').eq('owner_id',task.owner_id).eq('action_type','nova_legal_review_required').eq('entity_id',lease.id).contains('metadata',{task_id:task.task_id}).maybeSingle();if(!existing)await admin.from('ai_actions').insert({owner_id:task.owner_id,action_type:'nova_legal_review_required',entity_type:'lease',entity_id:lease.id,status:'pending',summary:'Lease status changed. Any default, notice, or eviction timeline requires source-verified law and human approval.',metadata:{task_id:task.task_id,lease_status:lease.status,property_id:unit.property_id,deterministic:true,human_approval_required:true}})}
  return {state:'human_review_required',lease_status:lease.status};
}
async function complianceHealth(task){
  const [{data:matches,error:me},{data:requests,error:re},{data:notices,error:ne}]=await Promise.all([admin.from('property_compliance_matches').select('applicability,missing_fields').eq('owner_id',task.owner_id),admin.from('compliance_data_requests').select('id,status').eq('owner_id',task.owner_id),admin.from('compliance_notifications').select('id,notification_type,due_at').eq('owner_id',task.owner_id)]);if(me)throw me;if(re)throw re;if(ne)throw ne;
  const ms=matches||[],rs=requests||[],ns=notices||[];return {matched_requirements:ms.filter(x=>x.applicability==='applies').length,unknown_requirements:ms.filter(x=>x.applicability==='unknown').length,open_data_requests:rs.filter(x=>x.status==='open').length,compliance_notifications:ns.length,overdue_notifications:ns.filter(x=>x.due_at&&new Date(x.due_at)<new Date()).length};
}
async function inspectionTracker(task){const soon=new Date(Date.now()+30*86400000).toISOString().slice(0,10);const {data,error}=await admin.from('property_compliance_matches').select('id,next_action_date,requirement_id,property_id').eq('owner_id',task.owner_id).eq('applicability','applies').lte('next_action_date',soon);if(error)throw error;return {due_within_30_days:(data||[]).filter(x=>x.next_action_date).length}}
async function telemetry(task){const {data,error}=await admin.from('agent_tasks').select('status,agent_key,attempts').eq('owner_id',task.owner_id);if(error)throw error;const rows=data||[],byStatus={};for(const x of rows)byStatus[x.status]=(byStatus[x.status]||0)+1;return {tasks:rows.length,by_status:byStatus,retrying:rows.filter(x=>x.status==='failed').length,dead_letter:rows.filter(x=>x.status==='dead_letter').length}}

async function execute(task){
  switch(task.agent_key){
    case 'balance_auditor':case 'reminder_dispatcher':case 'promise_followup':return await runRentFollowups();
    case 'ledger_reconciliation':return await ledgerReconciliation(task);
    case 'repair_tracker':return await repairTracker(task);
    case 'priority_filter':return await priorityFilter(task);
    case 'vendor_dispatch':return await vendorDispatch(task);
    case 'damage_triage':return await damageTriage(task);
    case 'tenant_welcomer':return await tenantWelcomer(task);
    case 'default_timeline':return await defaultTimeline(task);
    case 'compliance_health':return await complianceHealth(task);
    case 'inspection_tracker':return await inspectionTracker(task);
    case 'telemetry_aggregator':return await telemetry(task);
    case 'jurisdiction_geocoder':await runJurisdictionResolver();return {state:'jurisdictions_checked'};
    case 'regulatory_watchdog':await runComplianceMonitor();return {state:'official_sources_checked'};
    case 'self_healer':{const {data,error}=await admin.rpc('swarm_requeue_stale');if(error)throw error;return data||{state:'checked'}}
    default:return {state:'registered_agent_no_runtime_handler',safe_noop:true,agent_key:task.agent_key};
  }
}
async function complete(task,result){const {error}=await admin.rpc('swarm_complete_task',{p_task_id:task.task_id,p_worker_id:WORKER_ID,p_result:result||{}});if(error)throw error}
async function fail(task,error){const message=String(error?.message||error||'unknown error').slice(0,2000);const {error:rpcError}=await admin.rpc('swarm_fail_task',{p_task_id:task.task_id,p_worker_id:WORKER_ID,p_error:message});if(rpcError)console.error('swarm fail rpc',rpcError.message)}
let busy=false;
export async function runAgentSwarmOnce(){if(!admin||busy)return;busy=true;try{const {data,error}=await admin.rpc('swarm_claim_tasks',{p_worker_id:WORKER_ID,p_qty:8,p_vt_seconds:180});if(error)throw error;for(const task of data||[]){try{await complete(task,await execute(task))}catch(e){console.error('agent-swarm',task.agent_key,task.task_id,e?.message||e);await fail(task,e)}}}finally{busy=false}}
export function startAgentSwarm(){if(!admin)return;setTimeout(()=>runAgentSwarmOnce().catch(e=>console.error('agent-swarm',e)),12000);setInterval(()=>runAgentSwarmOnce().catch(e=>console.error('agent-swarm',e)),5000)}
