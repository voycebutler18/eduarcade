import express from 'express';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
let installed=false;

function ageMinutes(value){if(!value)return null;const n=(Date.now()-new Date(value).getTime())/60000;return Number.isFinite(n)?Math.max(0,Math.round(n*10)/10):null}
function statusFromAge(value,goodMinutes,warnMinutes){const age=ageMinutes(value);if(age===null)return 'unknown';return age<=goodMinutes?'healthy':age<=warnMinutes?'degraded':'attention'}
function worst(...states){const rank={healthy:0,standby:0,unknown:1,degraded:2,attention:3};return states.reduce((a,b)=>(rank[b]??1)>(rank[a]??1)?b:a,'healthy')}
function safeRuntime(){const h=globalThis.__mendlyxRuntimeHealth||{};return {ai_provider:h.ai_provider||null,self_test:h.self_test||null,dependency_audit:h.dependency_audit||null}}
function workerStatus(agent,hb){
 if(!agent.enabled)return 'standby';
 const hint=String(agent.schedule_hint||'').toLowerCase();
 if(!hb){return /event|on_demand|upload|webhook|message|maintenance|lease/.test(hint)?'standby':'unknown'}
 if(hb.last_error_at&&(!hb.last_success_at||new Date(hb.last_error_at)>new Date(hb.last_success_at)))return 'attention';
 if(/continuous/.test(hint))return statusFromAge(hb.last_seen_at,15,60);
 if(/hourly/.test(hint))return statusFromAge(hb.last_seen_at,120,360);
 if(/daily/.test(hint))return statusFromAge(hb.last_seen_at,30*60,48*60);
 if(/scheduled/.test(hint))return statusFromAge(hb.last_seen_at,30*60,72*60);
 return 'standby';
}
async function ownerContext(req,res){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token||!KEY||!admin){res.status(401).json({error:'Authentication required'});return null}
 const authClient=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false}});
 const {data}=await authClient.auth.getUser(token);
 if(!data?.user){res.status(401).json({error:'Invalid session'});return null}
 const [{data:owned},{data:profile}]=await Promise.all([
  admin.from('properties').select('id').eq('owner_id',data.user.id).limit(1),
  admin.from('profiles').select('is_admin').eq('id',data.user.id).maybeSingle()
 ]);
 if(!owned?.length&&!profile?.is_admin){res.status(403).json({error:'Property owner access required'});return null}
 return {user:data.user,isAdmin:Boolean(profile?.is_admin)};
}
async function timedHealth(){const t=performance.now();const {data,error}=await admin.rpc('mendlyx_internal_health_snapshot');return {data,error,latency_ms:Math.round((performance.now()-t)*10)/10}}

express.application.listen=function(...args){
 if(!installed){installed=true;
  this.get('/api/nova/mission-control',async(req,res)=>{
   try{
    const ctx=await ownerContext(req,res);if(!ctx)return;
    const ownerId=ctx.user.id;
    const [health,propertyState,leaseIntel,exceptions,maintenance,transactions,payments,moneyProfile,residentConfig,resendConfig,agents,heartbeats,sources,runs,stress,threads]=await Promise.all([
     timedHealth(),
     admin.from('property_ai_state').select('property_id,health_status,open_exception_count,last_event_at,last_refreshed_at').eq('owner_id',ownerId).order('last_refreshed_at',{ascending:false}).limit(100),
     admin.from('lease_intelligence').select('lease_id,extraction_status,confidence,verified_at,updated_at').eq('owner_id',ownerId).order('updated_at',{ascending:false}).limit(200),
     admin.from('nova_exceptions').select('id,severity,exception_type,status,created_at').eq('owner_id',ownerId).not('status','in','("resolved","closed")').order('created_at',{ascending:false}).limit(100),
     admin.from('maintenance_requests').select('id,status,priority,created_at,updated_at,vendor_id,scheduled_for').eq('owner_id',ownerId).order('created_at',{ascending:false}).limit(500),
     admin.from('payment_transactions').select('id,status,processor,amount,created_at,updated_at,failure_code').eq('owner_id',ownerId).order('created_at',{ascending:false}).limit(200),
     admin.from('payments').select('id,amount,paid_at,method').eq('owner_id',ownerId).order('paid_at',{ascending:false}).limit(200),
     admin.from('money_chaser_profiles').select('autopilot_enabled,automation_policy_approved_at,automatic_email_enabled,updated_at').eq('owner_id',ownerId).maybeSingle(),
     admin.from('resident_channel_config').select('resend_inbound_address,resend_webhook_id,inbound_email_enabled,updated_at,sms_provider,sms_number,inbound_sms_enabled').eq('owner_id',ownerId).maybeSingle(),
     admin.from('money_chaser_provider_config').select('provider,webhook_id,webhook_endpoint,updated_at').eq('provider','resend').maybeSingle(),
     admin.from('agent_registry').select('agent_key,squad,display_name,execution_mode,enabled,schedule_hint').order('squad').order('display_name'),
     admin.from('agent_heartbeats').select('agent_key,worker_id,last_seen_at,last_success_at,last_error_at,last_error,tasks_completed,tasks_failed'),
     admin.from('compliance_source_registry').select('authority_name,active,last_checked_at,last_http_status,last_error,consecutive_failures,next_check_at').eq('active',true).order('authority_name'),
     admin.from('compliance_monitor_runs').select('started_at,finished_at,status,change_detected,error_message').order('started_at',{ascending:false}).limit(20),
     admin.from('mendlyx_stress_runs').select('profile,status,started_at,finished_at,results').order('created_at',{ascending:false}).limit(1).maybeSingle(),
     admin.from('resident_threads').select('id,last_channel,last_message_at,status').eq('owner_id',ownerId).order('last_message_at',{ascending:false}).limit(200)
    ]);
    const failures=health.data?.failures||{};
    const integrityFailures=Object.values(failures).reduce((s,v)=>s+Number(v||0),0);
    const runtime=safeRuntime();
    const mem=process.memoryUsage();
    const ps=propertyState.data||[],li=leaseIntel.data||[],ex=exceptions.data||[],mr=maintenance.data||[],tx=transactions.data||[],src=sources.data||[],hb=heartbeats.data||[],areg=agents.data||[];
    const latestProperty=ps[0]?.last_refreshed_at||null;
    const propertyStatus=ps.length?statusFromAge(latestProperty,15,45):'standby';
    const pendingLease=li.filter(x=>!['extracted','structured_ready','verified'].includes(String(x.extraction_status||''))).length;
    const aiCooldown=runtime.ai_provider?.cooldown_until&&new Date(runtime.ai_provider.cooldown_until).getTime()>Date.now();
    const aiStatus=!process.env.GROQ_API_KEY?'attention':aiCooldown?'degraded':runtime.ai_provider?.last_error_at&&!runtime.ai_provider?.last_success_at?'degraded':'healthy';
    const complianceProblems=src.filter(x=>x.last_error||Number(x.consecutive_failures||0)>0||(x.last_http_status&&Number(x.last_http_status)>=400));
    const complianceStatus=complianceProblems.length?'degraded':src.length?'healthy':'unknown';
    const webhookConfigured=Boolean(resendConfig.data?.webhook_id&&resendConfig.data?.webhook_endpoint);
    const ownerEmailReady=Boolean(residentConfig.data?.inbound_email_enabled&&residentConfig.data?.resend_inbound_address&&webhookConfigured);
    const openMaint=mr.filter(x=>!['completed','closed','cancelled','resolved'].includes(String(x.status||'').toLowerCase()));
    const failedTx=tx.filter(x=>['failed','canceled','cancelled'].includes(String(x.status||'').toLowerCase()));
    const activeTx=tx.filter(x=>['pending','processing','checkout_created','requires_action'].includes(String(x.status||'').toLowerCase()));
    const workerRows=areg.map(a=>{const h=hb.find(x=>x.agent_key===a.agent_key)||null;return {...a,status:workerStatus(a,h),last_seen_at:h?.last_seen_at||null,last_success_at:h?.last_success_at||null,last_error_at:h?.last_error_at||null,last_error:h?.last_error||null,tasks_completed:Number(h?.tasks_completed||0),tasks_failed:Number(h?.tasks_failed||0)}});
    const workerAttention=workerRows.filter(x=>x.status==='attention').length,workerDegraded=workerRows.filter(x=>x.status==='degraded').length;
    const selfTestStatus=runtime.self_test?runtime.self_test.ok?'healthy':'attention':integrityFailures===0?'healthy':'attention';
    const dependencyTotal=Number(runtime.dependency_audit?.summary?.total||0);
    const components=[
     {key:'backend',label:'Backend API',status:'healthy',detail:`Uptime ${Math.floor(process.uptime()/60)} min · RSS ${Math.round(mem.rss/1024/1024)} MB`},
     {key:'database',label:'Database integrity',status:health.error?'attention':integrityFailures?'attention':health.latency_ms>1000?'degraded':'healthy',detail:health.error?'Health query failed':`${integrityFailures} integrity failures · ${health.latency_ms} ms health query`},
     {key:'ai',label:'AI provider',status:aiStatus,detail:aiCooldown?`Provider cooldown until ${runtime.ai_provider.cooldown_until}`:process.env.GROQ_API_KEY?'Groq configured and guarded':'Groq key missing'},
     {key:'property_manager',label:'NOVA property manager',status:propertyStatus,detail:ps.length?`${ps.length} property state record${ps.length===1?'':'s'} · last refresh ${ageMinutes(latestProperty)} min ago`:'No property AI state yet'},
     {key:'email',label:'Resident email service',status:ownerEmailReady?'healthy':webhookConfigured?'degraded':'attention',detail:ownerEmailReady?'Inbound email + webhook ready':webhookConfigured?'Global webhook ready; owner channel incomplete':'Resend webhook not configured'},
     {key:'lease_intelligence',label:'Lease intelligence',status:aiCooldown&&pendingLease?'degraded':pendingLease?'degraded':'healthy',detail:`${li.length} lease intelligence record${li.length===1?'':'s'} · ${pendingLease} pending`},
     {key:'maintenance',label:'Maintenance automation',status:openMaint.some(x=>String(x.priority).toLowerCase()==='emergency'&&!x.vendor_id)?'attention':'healthy',detail:`${openMaint.length} open · ${openMaint.filter(x=>!x.vendor_id).length} without vendor`},
     {key:'payments',label:'Payments',status:activeTx.length>5?'degraded':'healthy',detail:`${activeTx.length} active checkout${activeTx.length===1?'':'s'} · ${failedTx.length} failed/canceled in recent history`},
     {key:'money_chaser',label:'Money Chaser',status:moneyProfile.data?.autopilot_enabled?'healthy':'standby',detail:moneyProfile.data?.autopilot_enabled?'Standing authorization active':'Autopilot not enabled'},
     {key:'compliance',label:'Compliance feeds',status:complianceStatus,detail:`${src.length} active source${src.length===1?'':'s'} · ${complianceProblems.length} need attention`},
     {key:'workers',label:'NOVA worker fleet',status:workerAttention?'attention':workerDegraded?'degraded':'healthy',detail:`${workerRows.filter(x=>x.status==='healthy').length} healthy · ${workerDegraded} degraded · ${workerAttention} attention · ${workerRows.filter(x=>x.status==='standby').length} standby`},
     {key:'self_test',label:'Production self-test',status:selfTestStatus,detail:runtime.self_test?`${runtime.self_test.reason} · ${runtime.self_test.duration_ms} ms`:'Integrity snapshot is clean; next scheduled self-test will populate runtime details'},
     {key:'dependencies',label:'Dependency security',status:dependencyTotal?'attention':'healthy',detail:runtime.dependency_audit?`${dependencyTotal} known moderate/high/critical vulnerabilities`:'Audit pending on this process'}
    ];
    const overall=worst(...components.map(x=>x.status));
    const response={
     generated_at:new Date().toISOString(),overall,
     summary:{healthy:components.filter(x=>x.status==='healthy').length,degraded:components.filter(x=>x.status==='degraded').length,attention:components.filter(x=>x.status==='attention').length,standby:components.filter(x=>x.status==='standby').length,open_exceptions:ex.length,open_maintenance:openMaint.length},
     runtime:{uptime_seconds:Math.round(process.uptime()),memory:{rss_mb:Math.round(mem.rss/1024/1024*10)/10,heap_used_mb:Math.round(mem.heapUsed/1024/1024*10)/10},database_health_latency_ms:health.latency_ms},
     components,workers:workerRows,
     owner:{property_states:ps,open_exceptions:ex,maintenance:{open:openMaint.length,total:mr.length,unassigned:openMaint.filter(x=>!x.vendor_id).length},payments:{active_transactions:activeTx.length,failed_or_canceled:failedTx.length,recorded_payments:(payments.data||[]).length},money_chaser:moneyProfile.data||null,resident_channels:residentConfig.data?{inbound_email_enabled:Boolean(residentConfig.data.inbound_email_enabled),resend_inbound_address:residentConfig.data.resend_inbound_address||null,inbound_sms_enabled:Boolean(residentConfig.data.inbound_sms_enabled),sms_number:residentConfig.data.sms_number||null}:null,resident_threads:{count:(threads.data||[]).length,last_message_at:threads.data?.[0]?.last_message_at||null}},
     lease_intelligence:{total:li.length,pending:pendingLease,rows:li.slice(0,20)},
     compliance:{sources:src,recent_runs:runs.data||[]},
     self_test:runtime.self_test||null,dependency_audit:runtime.dependency_audit||null,stress_test:stress.data||null,
     integrity:{failures,generated_at:health.data?.generated_at||null}
    };
    res.set('cache-control','no-store');
    return res.json(response);
   }catch(e){console.error('nova-mission-control',e);return res.status(500).json({error:'Unable to load NOVA Mission Control'})}
  });
  console.log('NOVA Mission Control endpoint active');
 }
 return originalListen.apply(this,args)
};
