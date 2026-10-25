import {monitorEventLoopDelay} from 'node:perf_hooks';
import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
const PROFILE='nasa-v1';
let running=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function pct(values,p){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(s.length*p)-1))]}
function mb(n){return Math.round((n/1024/1024)*10)/10}
async function concurrent(total,limit,fn){let n=0;const out=[];async function worker(){while(n<total){const i=n++;out[i]=await fn(i)}}await Promise.all(Array.from({length:Math.min(total,limit)},worker));return out}
async function httpStage(total,concurrency){
 const url=`http://127.0.0.1:${Number(process.env.PORT||10000)}/health`;
 const started=performance.now();
 const rows=await concurrent(total,concurrency,async()=>{const t=performance.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});await r.arrayBuffer();return{ok:r.ok,ms:performance.now()-t,status:r.status}}catch(e){return{ok:false,ms:performance.now()-t,status:0,error:String(e?.message||e)}}});
 const times=rows.map(x=>x.ms),failed=rows.filter(x=>!x.ok).length;
 return{total,concurrency,failed,duration_ms:Math.round((performance.now()-started)*10)/10,rps:Math.round((total/((performance.now()-started)/1000))*10)/10,p50_ms:Math.round(pct(times,.5)*10)/10,p95_ms:Math.round(pct(times,.95)*10)/10,p99_ms:Math.round(pct(times,.99)*10)/10,max_ms:Math.round(Math.max(...times)*10)/10};
}
async function dbStage(total,concurrency){
 const started=performance.now();
 const rows=await concurrent(total,concurrency,async()=>{const t=performance.now();const{count,error}=await admin.from('properties').select('id',{count:'exact',head:true});return{ok:!error,ms:performance.now()-t,count,error:error?.message||null}});
 const times=rows.map(x=>x.ms),failed=rows.filter(x=>!x.ok).length;
 return{total,concurrency,failed,duration_ms:Math.round((performance.now()-started)*10)/10,rps:Math.round((total/((performance.now()-started)/1000))*10)/10,p50_ms:Math.round(pct(times,.5)*10)/10,p95_ms:Math.round(pct(times,.95)*10)/10,p99_ms:Math.round(pct(times,.99)*10)/10,max_ms:Math.round(Math.max(...times)*10)/10};
}

export async function runOneTimeStressProfile(){
 if(!admin||running)return;running=true;
 try{
  const{data:existing}=await admin.from('mendlyx_stress_runs').select('id,status,started_at').eq('profile',PROFILE).maybeSingle();
  if(existing){console.log('mendlyx-stress-profile',JSON.stringify({profile:PROFILE,skipped:true,status:existing.status}));return}
  const{data:row,error:insertError}=await admin.from('mendlyx_stress_runs').insert({profile:PROFILE,status:'running',started_at:new Date().toISOString()}).select('id').single();
  if(insertError)throw insertError;
  const eventLoop=monitorEventLoopDelay({resolution:20});eventLoop.enable();
  const memBefore=process.memoryUsage();const cpuBefore=process.cpuUsage();const started=performance.now();
  const stages=[];
  for(const spec of [[250,25],[1000,50],[2500,100]]){stages.push(await httpStage(spec[0],spec[1]));await sleep(750)}
  const db=[await dbStage(100,20),await dbStage(300,40)];
  const cpu=process.cpuUsage(cpuBefore),memAfter=process.memoryUsage();eventLoop.disable();
  const result={
   profile:PROFILE,
   duration_ms:Math.round((performance.now()-started)*10)/10,
   http_stages:stages,
   database_stages:db,
   event_loop:{mean_ms:Math.round((eventLoop.mean/1e6)*10)/10,p95_ms:Math.round((eventLoop.percentile(95)/1e6)*10)/10,p99_ms:Math.round((eventLoop.percentile(99)/1e6)*10)/10,max_ms:Math.round((eventLoop.max/1e6)*10)/10},
   memory:{rss_before_mb:mb(memBefore.rss),rss_after_mb:mb(memAfter.rss),heap_before_mb:mb(memBefore.heapUsed),heap_after_mb:mb(memAfter.heapUsed)},
   cpu:{user_ms:Math.round(cpu.user/1000),system_ms:Math.round(cpu.system/1000)}
  };
  const failed=result.http_stages.some(x=>x.failed>0||x.p95_ms>750||x.max_ms>3000)||result.database_stages.some(x=>x.failed>0||x.p95_ms>1500)||result.event_loop.p99_ms>750;
  result.ok=!failed;
  await admin.from('mendlyx_stress_runs').update({status:result.ok?'passed':'failed',finished_at:new Date().toISOString(),results:result}).eq('id',row.id);
  console[result.ok?'log':'error']('mendlyx-stress-profile',JSON.stringify(result));
 }catch(e){console.error('mendlyx-stress-profile',JSON.stringify({profile:PROFILE,ok:false,error:String(e?.message||e).slice(0,500)}))}finally{running=false}
}

export function startOneTimeStressProfile(){
 if(!admin)return;
 const t=setTimeout(()=>runOneTimeStressProfile(),60_000);t.unref?.();
}
