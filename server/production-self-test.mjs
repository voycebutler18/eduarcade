import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
let running=false;
globalThis.__mendlyxRuntimeHealth=globalThis.__mendlyxRuntimeHealth||{};
function publish(result){globalThis.__mendlyxRuntimeHealth.self_test=result;return result}

function envHealth(){
 const required=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PUBLISHABLE_KEY','GROQ_API_KEY','RESEND_API_KEY'];
 return Object.fromEntries(required.map(k=>[k,Boolean(process.env[k])]));
}
function numberEntries(obj){return Object.entries(obj||{}).map(([name,value])=>({name,value:Number(value||0)}))}
function percentile(values,p){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))]}
async function inBatches(total,concurrency,fn){const out=[];let next=0;async function worker(){while(next<total){const i=next++;out[i]=await fn(i)}}await Promise.all(Array.from({length:Math.min(total,concurrency)},worker));return out}

async function localHttpSmoke(){
 const port=Number(process.env.PORT||10000),url=`http://127.0.0.1:${port}/health`,total=120,concurrency=12;
 const runs=await inBatches(total,concurrency,async()=>{const start=performance.now();try{const signal=AbortSignal.timeout(5000);const r=await fetch(url,{signal});await r.arrayBuffer();return{ok:r.ok,status:r.status,ms:performance.now()-start}}catch(e){return{ok:false,status:0,ms:performance.now()-start,error:String(e?.message||e)}}});
 const times=runs.map(x=>x.ms),failures=runs.filter(x=>!x.ok);
 return{ok:failures.length===0,total,concurrency,failed:failures.length,p50_ms:Math.round(percentile(times,.50)*10)/10,p95_ms:Math.round(percentile(times,.95)*10)/10,max_ms:Math.round(Math.max(...times)*10)/10};
}
async function databaseSmoke(){
 const total=8,start=performance.now();
 const runs=await Promise.all(Array.from({length:total},async()=>{const t=performance.now();const{data,error}=await admin.rpc('mendlyx_internal_health_snapshot');return{ok:!error&&Boolean(data),ms:performance.now()-t,error:error?.message||null}}));
 const times=runs.map(x=>x.ms),failures=runs.filter(x=>!x.ok);
 return{ok:failures.length===0,total,failed:failures.length,p50_ms:Math.round(percentile(times,.50)*10)/10,p95_ms:Math.round(percentile(times,.95)*10)/10,max_ms:Math.round(Math.max(...times)*10)/10,total_ms:Math.round((performance.now()-start)*10)/10};
}
async function startupLoadSmoke(){
 if(String(process.env.MENDLYX_LOAD_SMOKE_DISABLE||'').toLowerCase()==='true')return{skipped:true};
 const [http,database]=await Promise.all([localHttpSmoke(),databaseSmoke()]);
 const result={ok:http.ok&&database.ok,http,database};
 console[result.ok?'log':'error']('mendlyx-load-smoke',JSON.stringify(result));
 return result;
}

export async function runProductionSelfTest(reason='manual'){
 if(!admin||running)return null;
 running=true;
 const started=Date.now();
 try{
  const {data,error}=await admin.rpc('mendlyx_internal_health_snapshot');
  if(error)throw error;
  const failures=numberEntries(data?.failures);
  const failed=failures.filter(x=>x.value>0);
  const env=envHealth();
  const missingEnv=Object.entries(env).filter(([,ok])=>!ok).map(([name])=>name);
  const load=reason==='startup'?await startupLoadSmoke():null;
  const result=publish({
   ok:failed.length===0&&missingEnv.length===0&&(load?.ok!==false),
   reason,
   duration_ms:Date.now()-started,
   failed_checks:failed,
   missing_env:missingEnv,
   load_smoke:load,
   signals:data?.signals||{},
   generated_at:data?.generated_at||new Date().toISOString()
  });
  const level=result.ok?'log':'error';
  console[level]('mendlyx-self-test',JSON.stringify(result));
  return result;
 }catch(e){
  const result=publish({ok:false,reason,duration_ms:Date.now()-started,error:String(e?.message||e).slice(0,500),generated_at:new Date().toISOString()});
  console.error('mendlyx-self-test',JSON.stringify(result));
  return result;
 }finally{running=false}
}

export function startProductionSelfTest(){
 if(!admin){const result=publish({ok:false,reason:'startup',error:'SUPABASE_SERVICE_ROLE_KEY missing',generated_at:new Date().toISOString()});console.error('mendlyx-self-test',JSON.stringify(result));return}
 const first=setTimeout(()=>runProductionSelfTest('startup'),20_000);
 first.unref?.();
 const timer=setInterval(()=>runProductionSelfTest('scheduled'),30*60_000);
 timer.unref?.();
}
