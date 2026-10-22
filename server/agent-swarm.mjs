import {createClient} from '@supabase/supabase-js';
import {runJurisdictionResolver} from './jurisdiction-resolver.mjs';
import {runComplianceMonitor} from './compliance-monitor.mjs';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const WORKER_ID=process.env.RENDER_INSTANCE_ID||process.env.HOSTNAME||`rentpilot-backend-${process.pid}`;

function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function openStatus(v){return !['completed','closed','cancelled','resolved'].includes(String(v||'').toLowerCase())}

async function runRentFollowups(){
  const {data,error}=await admin.rpc('refresh_rent_followup_queue');
  if(error)throw error;
  return {refresh:data??true};
}

async function ledgerReconciliation(task){
  const {data:p,error}=await admin.from('payments').select('*').eq('id',task.entity_id).maybeSingle();
  if(error)throw error;
  if(!p)return {state:'payment_missing'};
  if(!p.rent_charge_id)return {state:'unallocated_payment',payment_id:p.id,amount:num(p.amount)};
  const [{data:charge,error:ce},{data:payments,error:pe}]=await Promise.all([
    admin.from('rent_charges').select('id,amount,status,due_date').eq('id',p.rent_charge_id).maybeSingle(),
    admin.from('payments').select('amount').eq('rent_charge_id',p.rent_charge_id)
  ]);
  if(ce)throw ce;if(pe)throw pe;
  if(!charge)return {state:'charge_missing',payment_id:p.id,rent_charge_id:p.rent_charge_id};
  const paid=(payments||[]).reduce((s,x)=>s+num(x.amount),0);
  const chargeAmount=num(charge.amount);
  return {
    state:'reconciled',
    payment_id:p.id,
    rent_charge_id:p.rent_charge_id,
    charge_amount:chargeAmount,
    recorded_payments:paid,
    remaining:Math.max(0,chargeAmount-paid),
    overage:Math.max(0,paid-chargeAmount)
  };
}

async function repairTracker(task){
  let q=admin.from('maintenance_requests').select('id,status,priority,vendor_id,created_at,updated_at,scheduled_for').eq('owner_id',task.owner_id);
  if(task.entity_id)q=q.eq('id',task.entity_id);
  const {data,error}=await q;if(error)throw error;
  const rows=(data||[]).filter(x=>openStatus(x.status));
  const now=Date.now();
  return {
    open_count:rows.length,
    unassigned_count:rows.filter(x=>!x.vendor_id).length,
    urgent_unassigned_count:rows.filter(x=>!x.vendor_id&&['urgent','emergency','high'].includes(String(x.priority||'').toLowerCase())).length,
    oldest_open_hours:rows.length?Math.max(...rows.map(x=>(now-new Date(x.created_at).getTime())/3600000)):0
  };
}

async function tenantWelcomer(task){
  const {data:lease,error}=await admin.from('leases').select('id,tenant_id,unit_id,status,start_date').eq('id',task.entity_id).maybeSingle();
  if(error)throw error;
  if(!lease)return {state:'lease_missing'};
  const {data:tenant,error:te}=await admin.from('tenants').select('id,resident_account_active,user_id,email').eq('id',lease.tenant_id).maybeSingle();
  if(te)throw te;
  return {
    state:tenant?.resident_account_active?'resident_access_active':'resident_access_pending',
    lease_id:lease.id,
    tenant_id:lease.tenant_id,
    resident_account_active:Boolean(tenant?.resident_account_active),
    user_linked:Boolean(tenant?.user_id)
  };
}

async function defaultTimeline(task){
  const {data:lease,error}=await admin.from('leases').select('id,status,start_date,end_date,unit_id,tenant_id').eq('id',task.entity_id).maybeSingle();
  if(error)throw error;
  if(!lease)return {state:'lease_missing'};
  const {data:unit,error:ue}=await admin.from('units').select('property_id').eq('id',lease.unit_id).maybeSingle();
  if(ue)throw ue;
  if(unit?.property_id){
    const {data:existing}=await admin.from('ai_actions').select('id').eq('owner_id',task.owner_id).eq('action_type','nova_legal_review_required').eq('entity_id',lease.id).contains('metadata',{task_id:task.task_id}).maybeSingle();
    if(!existing)await admin.from('ai_actions').insert({
      owner_id:task.owner_id,action_type:'nova_legal_review_required',entity_type:'lease',entity_id:lease.id,status:'pending',
      summary:'Lease status changed. Any default, notice, or eviction timeline requires source-verified law and human approval.',
      metadata:{task_id:task.task_id,lease_status:lease.status,property_id:unit.property_id,deterministic:true,human_approval_required:true}
    });
  }
  return {state:'human_review_required',lease_status:lease.status};
}

async function complianceHealth(task){
  const [{data:matches,error:me},{data:requests,error:re},{data:notices,error:ne}]=await Promise.all([
    admin.from('property_compliance_matches').select('applicability,missing_fields').eq('owner_id',task.owner_id),
    admin.from('compliance_data_requests').select('id,status').eq('owner_id',task.owner_id),
    admin.from('compliance_notifications').select('id,notification_type,due_at').eq('owner_id',task.owner_id)
  ]);
  if(me)throw me;if(re)throw re;if(ne)throw ne;
  const ms=matches||[],rs=requests||[],ns=notices||[];
  return {
    matched_requirements:ms.filter(x=>x.applicability==='applies').length,
    unknown_requirements:ms.filter(x=>x.applicability==='unknown').length,
    open_data_requests:rs.filter(x=>x.status==='open').length,
    compliance_notifications:ns.length,
    overdue_notifications:ns.filter(x=>x.due_at&&new Date(x.due_at)<new Date()).length
  };
}

async function inspectionTracker(task){
  const soon=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const {data,error}=await admin.from('property_compliance_matches')
    .select('id,next_action_date,requirement_id,property_id')
    .eq('owner_id',task.owner_id).eq('applicability','applies').lte('next_action_date',soon);
  if(error)throw error;
  return {due_within_30_days:(data||[]).filter(x=>x.next_action_date).length};
}

async function telemetry(task){
  const {data,error}=await admin.from('agent_tasks').select('status,agent_key,attempts').eq('owner_id',task.owner_id);
  if(error)throw error;
  const rows=data||[];
  const byStatus={};
  for(const x of rows)byStatus[x.status]=(byStatus[x.status]||0)+1;
  return {tasks:rows.length,by_status:byStatus,retrying:rows.filter(x=>x.status==='retry').length,dead_letter:rows.filter(x=>x.status==='dead_letter').length};
}

async function execute(task){
  switch(task.agent_key){
    case 'balance_auditor':
    case 'reminder_dispatcher':
    case 'promise_followup':
      return await runRentFollowups();
    case 'ledger_reconciliation':
      return await ledgerReconciliation(task);
    case 'repair_tracker':
      return await repairTracker(task);
    case 'tenant_welcomer':
      return await tenantWelcomer(task);
    case 'default_timeline':
      return await defaultTimeline(task);
    case 'compliance_health':
      return await complianceHealth(task);
    case 'inspection_tracker':
      return await inspectionTracker(task);
    case 'telemetry_aggregator':
      return await telemetry(task);
    case 'jurisdiction_geocoder':
      await runJurisdictionResolver();return {state:'jurisdictions_checked'};
    case 'regulatory_watchdog':
      await runComplianceMonitor();return {state:'official_sources_checked'};
    case 'self_healer': {
      const {data,error}=await admin.rpc('swarm_requeue_stale');if(error)throw error;return data||{state:'checked'};
    }
    case 'damage_triage':
      return {state:'vision_worker_not_connected',safe_noop:true,photo_count:Array.isArray(task.payload?.photo_urls)?task.payload.photo_urls.length:0};
    default:
      return {state:'registered_agent_no_runtime_handler',safe_noop:true,agent_key:task.agent_key};
  }
}

async function complete(task,result){
  const {error}=await admin.rpc('swarm_complete_task',{p_task_id:task.task_id,p_worker_id:WORKER_ID,p_result:result||{}});
  if(error)throw error;
}
async function fail(task,error){
  const message=String(error?.message||error||'unknown error').slice(0,2000);
  const {error:rpcError}=await admin.rpc('swarm_fail_task',{p_task_id:task.task_id,p_worker_id:WORKER_ID,p_error:message});
  if(rpcError)console.error('swarm fail rpc',rpcError.message);
}
let busy=false;
export async function runAgentSwarmOnce(){
  if(!admin||busy)return;
  busy=true;
  try{
    const {data,error}=await admin.rpc('swarm_claim_tasks',{p_worker_id:WORKER_ID,p_qty:8,p_vt_seconds:180});
    if(error)throw error;
    for(const task of data||[]){
      try{await complete(task,await execute(task))}
      catch(e){console.error('agent-swarm',task.agent_key,task.task_id,e?.message||e);await fail(task,e)}
    }
  } finally {busy=false}
}
export function startAgentSwarm(){
  if(!admin)return;
  setTimeout(()=>runAgentSwarmOnce().catch(e=>console.error('agent-swarm',e)),12000);
  setInterval(()=>runAgentSwarmOnce().catch(e=>console.error('agent-swarm',e)),5000);
}
