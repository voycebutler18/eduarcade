import {createClient} from '@supabase/supabase-js';
import {runComplianceFallbackStress} from './legal-ingestor.mjs';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const PROFILE='compliance-fallback-v1';

function percentile(values,p){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(s.length*p)-1))]}
async function concurrent(total,limit,fn){let n=0;const out=[];async function w(){while(n<total){const i=n++;out[i]=await fn(i)}}await Promise.all(Array.from({length:Math.min(total,limit)},w));return out}
async function apiPressure(total=400,concurrency=20){const url=`http://127.0.0.1:${Number(process.env.PORT||10000)}/health`;const rows=await concurrent(total,concurrency,async()=>{const t=performance.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});await r.arrayBuffer();return{ok:r.ok,ms:performance.now()-t}}catch{return{ok:false,ms:performance.now()-t}}});const times=rows.map(x=>x.ms);return{total,concurrency,failed:rows.filter(x=>!x.ok).length,p50_ms:Math.round(percentile(times,.5)*10)/10,p95_ms:Math.round(percentile(times,.95)*10)/10,p99_ms:Math.round(percentile(times,.99)*10)/10,max_ms:Math.round(Math.max(...times)*10)/10}}

export async function runOneTimeComplianceFallbackStress(){
 if(!admin)return;
 const {data:existing}=await admin.from('mendlyx_stress_runs').select('id,status').eq('profile',PROFILE).maybeSingle();
 if(existing){console.log('mendlyx-feature-stress',JSON.stringify({profile:PROFILE,skipped:true,status:existing.status}));return}
 const {data:row,error}=await admin.from('mendlyx_stress_runs').insert({profile:PROFILE,status:'running',started_at:new Date().toISOString()}).select('id').single();if(error)throw error;
 try{
  const started=performance.now();
  const [fallback,api]=await Promise.all([runComplianceFallbackStress(5000),apiPressure()]);
  const {data:health,error:healthError}=await admin.rpc('mendlyx_internal_health_snapshot');
  const integrityFailures=Object.values(health?.failures||{}).reduce((s,v)=>s+Number(v||0),0);
  const result={profile:PROFILE,ok:Boolean(fallback.ok&&api.failed===0&&api.p95_ms<1000&&!healthError&&integrityFailures===0),fallback,api_pressure:api,database_health_ok:!healthError,integrity_failures:integrityFailures,duration_ms:Math.round((performance.now()-started)*10)/10,finished_at:new Date().toISOString()};
  await admin.from('mendlyx_stress_runs').update({status:result.ok?'passed':'failed',finished_at:result.finished_at,results:result}).eq('id',row.id);
  console[result.ok?'log':'error']('mendlyx-feature-stress',JSON.stringify(result));
 }catch(e){const result={profile:PROFILE,ok:false,error:String(e?.message||e).slice(0,500),finished_at:new Date().toISOString()};await admin.from('mendlyx_stress_runs').update({status:'failed',finished_at:result.finished_at,results:result}).eq('id',row.id);console.error('mendlyx-feature-stress',JSON.stringify(result))}
}

export function startOneTimeComplianceFallbackStress(){if(!admin)return;const t=setTimeout(()=>runOneTimeComplianceFallbackStress().catch(e=>console.error('mendlyx-feature-stress',e)),30000);t.unref?.()}
