import {createClient} from '@supabase/supabase-js';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const PROFILE='site-certification-v1';
function percentile(values,p){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(s.length*p)-1))]}
function round(n){return Math.round(n*10)/10}
async function concurrent(total,limit,fn){let n=0;const out=[];async function w(){while(n<total){const i=n++;out[i]=await fn(i)}}await Promise.all(Array.from({length:Math.min(total,limit)},w));return out}
async function pressure(total=800,concurrency=40){const url=`http://127.0.0.1:${Number(process.env.PORT||10000)}/health`;const rows=await concurrent(total,concurrency,async()=>{const t=performance.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});await r.arrayBuffer();return{ok:r.ok,ms:performance.now()-t}}catch{return{ok:false,ms:performance.now()-t}}});const ms=rows.map(x=>x.ms);return{total,concurrency,failed:rows.filter(x=>!x.ok).length,p50_ms:round(percentile(ms,.5)),p95_ms:round(percentile(ms,.95)),p99_ms:round(percentile(ms,.99)),max_ms:round(Math.max(...ms))}}
async function endpoint(url){const t=performance.now();try{const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(10000)});const text=await r.text();return{ok:r.ok,status:r.status,ms:round(performance.now()-t),contains_mendlyx:/mendlyx/i.test(text)}}catch(e){return{ok:false,status:0,ms:round(performance.now()-t),error:String(e?.message||e).slice(0,300)}}}

export async function runSiteCertification(){
 if(!admin)return null;
 const {data:existing}=await admin.from('mendlyx_stress_runs').select('id,status').eq('profile',PROFILE).maybeSingle();
 if(existing){console.log('mendlyx-site-certification',JSON.stringify({profile:PROFILE,skipped:true,status:existing.status}));return existing}
 const {data:row,error}=await admin.from('mendlyx_stress_runs').insert({profile:PROFILE,status:'running',started_at:new Date().toISOString()}).select('id').single();if(error)throw error;
 const started=performance.now();
 try{
  const [apiPressure,health,recoveryConfig,recoveryManifest,recoveryDrill,legalSources,residentConfig,resendConfig,stressProfiles,frontend]=await Promise.all([
   pressure(),
   admin.rpc('mendlyx_internal_health_snapshot'),
   admin.from('mendlyx_recovery_configuration').select('*').eq('id',1).maybeSingle(),
   admin.from('mendlyx_recovery_manifests').select('status,verified_at,storage_inventory,integrity_snapshot').order('created_at',{ascending:false}).limit(1).maybeSingle(),
   admin.from('mendlyx_recovery_drills').select('profile,status,finished_at,results').order('started_at',{ascending:false}).limit(1).maybeSingle(),
   admin.from('compliance_source_registry').select('authority_name,discovery_state,last_http_status,last_error,consecutive_failures').eq('active',true).eq('verification_required',true),
   admin.from('resident_channel_config').select('inbound_email_enabled,resend_inbound_address,resend_webhook_id').limit(10),
   admin.from('money_chaser_provider_config').select('provider,webhook_id,webhook_endpoint').eq('provider','resend').maybeSingle(),
   admin.from('mendlyx_stress_runs').select('profile,status,finished_at').in('profile',['nasa-v1','process-isolation-v1','ai-provider-failover-v1','compliance-fallback-v4']),
   endpoint(process.env.FRONTEND_ORIGIN||'https://rentpilot-ai.onrender.com')
  ]);
  const integrityFailures=Object.values(health.data?.failures||{}).reduce((s,v)=>s+Number(v||0),0);
  const manifest=recoveryManifest.data,drill=recoveryDrill.data;
  const manifestAge=manifest?.verified_at?(Date.now()-new Date(manifest.verified_at).getTime())/3600000:Infinity;
  const legalRows=legalSources.data||[];const legalBad=legalRows.filter(x=>x.last_error||Number(x.consecutive_failures||0)>0||String(x.discovery_state)!=='verified'||Number(x.last_http_status||0)!==200);
  const ownerChannels=residentConfig.data||[];const emailReady=ownerChannels.length>0&&ownerChannels.some(x=>x.inbound_email_enabled&&x.resend_inbound_address);
  const globalWebhook=Boolean(resendConfig.data?.webhook_id&&resendConfig.data?.webhook_endpoint);
  const requiredProfiles=['nasa-v1','process-isolation-v1','ai-provider-failover-v1','compliance-fallback-v4'];
  const profileMap=Object.fromEntries((stressProfiles.data||[]).map(x=>[x.profile,x.status]));
  const previousTestsOk=requiredProfiles.every(p=>profileMap[p]==='passed');
  const checks={
   api_pressure:apiPressure.failed===0&&apiPressure.p95_ms<1000,
   database_integrity:!health.error&&integrityFailures===0,
   recovery_manifest:Boolean(manifest?.status==='verified'&&manifestAge<=8&&Number(manifest?.storage_inventory?.failures||0)===0),
   recovery_drill:Boolean(drill?.status==='passed'),
   legal_sources:legalRows.length>=2&&legalBad.length===0,
   resident_email:emailReady&&globalWebhook,
   previous_stress_profiles:previousTestsOk,
   frontend:frontend.ok&&frontend.contains_mendlyx,
   required_env:Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.GROQ_API_KEY&&process.env.RESEND_API_KEY)
  };
  const failedChecks=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
  const ok=failedChecks.length===0;
  const finishedAt=new Date().toISOString();const result={profile:PROFILE,ok,checks,failed_checks:failedChecks,api_pressure:apiPressure,integrity_failures:integrityFailures,recovery:{manifest_status:manifest?.status||null,manifest_age_hours:Number.isFinite(manifestAge)?round(manifestAge):null,drill_status:drill?.status||null},legal:{sources:legalRows.length,bad:legalBad.length},communications:{resident_email_ready:emailReady,resend_webhook_ready:globalWebhook},frontend,previous_stress_profiles:profileMap,duration_ms:round(performance.now()-started),finished_at:finishedAt};
  await admin.from('mendlyx_stress_runs').update({status:ok?'passed':'failed',finished_at:finishedAt,results:result}).eq('id',row.id);
  console[ok?'log':'error']('mendlyx-site-certification',JSON.stringify(result));return result;
 }catch(e){const finishedAt=new Date().toISOString();const result={profile:PROFILE,ok:false,error:String(e?.message||e).slice(0,700),finished_at:finishedAt,duration_ms:round(performance.now()-started)};await admin.from('mendlyx_stress_runs').update({status:'failed',finished_at:finishedAt,results:result}).eq('id',row.id);console.error('mendlyx-site-certification',JSON.stringify(result));return result}
}
export function startSiteCertification(){if(!admin)return;const t=setTimeout(()=>runSiteCertification().catch(e=>console.error('mendlyx-site-certification',e?.message||e)),180000);t.unref?.()}
