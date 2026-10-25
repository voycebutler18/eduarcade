import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';

const WORKER_PATH=fileURLToPath(new URL('./worker-runtime.mjs',import.meta.url));
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
const PROFILE='process-isolation-v1';
let child=null,shuttingDown=false,restarts=0,lastHeartbeatAt=null,lastWorkerMemoryMb=null,stressCpuDoneAt=null;
const runtime=globalThis.__mendlyxRuntimeHealth=globalThis.__mendlyxRuntimeHealth||{};
runtime.process_isolation={mode:'supervised_child_process',worker_status:'starting',worker_pid:null,restarts:0,last_heartbeat_at:null};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function syncRuntime(extra={}){
 runtime.process_isolation={...(runtime.process_isolation||{}),mode:'supervised_child_process',worker_status:child?.connected?'healthy':'starting',worker_pid:child?.pid||null,restarts,last_heartbeat_at:lastHeartbeatAt,worker_memory_mb:lastWorkerMemoryMb,...extra};
}
function spawnWorker(){
 if(shuttingDown)return;
 child=fork(WORKER_PATH,[],{env:{...process.env,MENDLYX_PROCESS_ROLE:'worker'},stdio:['inherit','inherit','inherit','ipc']});
 syncRuntime({worker_status:'starting',worker_pid:child.pid});
 console.log('mendlyx-worker-supervisor',JSON.stringify({event:'spawn',pid:child.pid,restarts}));
 child.on('message',msg=>{
  if(msg?.type==='worker_heartbeat'){
   lastHeartbeatAt=msg.at||new Date().toISOString();lastWorkerMemoryMb=msg.memory_mb||null;syncRuntime({worker_status:'healthy'});
  }
  if(msg?.type==='stress_cpu_done')stressCpuDoneAt=msg.at||new Date().toISOString();
 });
 child.on('exit',(code,signal)=>{
  const oldPid=child?.pid||null;child=null;syncRuntime({worker_status:shuttingDown?'stopped':'restarting',last_exit:{code,signal,at:new Date().toISOString(),pid:oldPid}});
  console.warn('mendlyx-worker-supervisor',JSON.stringify({event:'exit',pid:oldPid,code,signal,shuttingDown}));
  if(!shuttingDown){restarts++;syncRuntime({restarts});setTimeout(spawnWorker,Math.min(5000,500+restarts*500)).unref?.()}
 });
 child.on('error',err=>{syncRuntime({worker_status:'attention',last_error:String(err?.message||err).slice(0,300)});console.error('mendlyx-worker-supervisor',err)});
}

async function waitForWorkerHealthy(timeoutMs=15000,requireNewPid=null){
 const started=Date.now();
 while(Date.now()-started<timeoutMs){
  if(child?.connected&&lastHeartbeatAt&&(!requireNewPid||child.pid!==requireNewPid))return true;
  await sleep(200);
 }
 return false;
}
function percentile(values,p){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(s.length*p)-1))]}
async function concurrent(total,limit,fn){let next=0;const rows=[];async function w(){while(next<total){const i=next++;rows[i]=await fn(i)}}await Promise.all(Array.from({length:Math.min(total,limit)},w));return rows}
async function httpStage(total,concurrency){
 const url=`http://127.0.0.1:${Number(process.env.PORT||10000)}/health`,started=performance.now();
 const rows=await concurrent(total,concurrency,async()=>{const t=performance.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});await r.arrayBuffer();return{ok:r.ok,ms:performance.now()-t,status:r.status}}catch(e){return{ok:false,ms:performance.now()-t,status:0,error:String(e?.message||e)}}});
 const times=rows.map(x=>x.ms),failed=rows.filter(x=>!x.ok).length;
 return{total,concurrency,failed,duration_ms:Math.round((performance.now()-started)*10)/10,p50_ms:Math.round(percentile(times,.5)*10)/10,p95_ms:Math.round(percentile(times,.95)*10)/10,p99_ms:Math.round(percentile(times,.99)*10)/10,max_ms:Math.round(Math.max(...times)*10)/10};
}
async function runProcessIsolationStress(){
 if(!admin)return;
 try{
  const{data:existing}=await admin.from('mendlyx_stress_runs').select('id,status').eq('profile',PROFILE).maybeSingle();
  if(existing){console.log('mendlyx-feature-stress',JSON.stringify({profile:PROFILE,skipped:true,status:existing.status}));return}
  const{data:row,error}=await admin.from('mendlyx_stress_runs').insert({profile:PROFILE,status:'running',started_at:new Date().toISOString()}).select('id').single();if(error)throw error;
  const healthy=await waitForWorkerHealthy(15000);if(!healthy)throw new Error('worker did not become healthy before stress test');
  const beforePid=child.pid;
  stressCpuDoneAt=null;
  child.send({type:'stress_cpu',duration_ms:1200});
  const cpuPressure=await httpStage(600,30);
  const cpuWaitStart=Date.now();while(!stressCpuDoneAt&&Date.now()-cpuWaitStart<5000)await sleep(100);
  const cpuCompleted=Boolean(stressCpuDoneAt);
  const restartsBefore=restarts;
  child.send({type:'stress_crash'});
  const duringRestart=await httpStage(300,20);
  const recovered=await waitForWorkerHealthy(15000,beforePid);
  const newPid=child?.pid||null;
  const{data:health,error:healthError}=await admin.rpc('mendlyx_internal_health_snapshot');
  const integrityFailures=Object.values(health?.failures||{}).reduce((s,v)=>s+Number(v||0),0);
  const result={profile:PROFILE,ok:false,cpu_pressure:cpuPressure,crash_window:duringRestart,cpu_stress_completed:cpuCompleted,worker_recovered:recovered,worker_pid_before:beforePid,worker_pid_after:newPid,restarts_added:restarts-restartsBefore,database_health_ok:!healthError,integrity_failures:integrityFailures,finished_at:new Date().toISOString()};
  result.ok=cpuPressure.failed===0&&cpuPressure.p95_ms<1000&&duringRestart.failed===0&&duringRestart.p95_ms<1000&&cpuCompleted&&recovered&&newPid&&newPid!==beforePid&&!healthError&&integrityFailures===0;
  await admin.from('mendlyx_stress_runs').update({status:result.ok?'passed':'failed',finished_at:new Date().toISOString(),results:result}).eq('id',row.id);
  runtime.process_isolation.last_feature_stress=result;
  console[result.ok?'log':'error']('mendlyx-feature-stress',JSON.stringify(result));
 }catch(e){const fail={profile:PROFILE,ok:false,error:String(e?.message||e).slice(0,500)};runtime.process_isolation.last_feature_stress=fail;console.error('mendlyx-feature-stress',JSON.stringify(fail))}
}

export function startWorkerSupervisor(){
 spawnWorker();
 const monitor=setInterval(()=>{
  if(shuttingDown||!child)return;
  const age=lastHeartbeatAt?Date.now()-new Date(lastHeartbeatAt).getTime():Infinity;
  if(age>45_000){console.error('mendlyx-worker-supervisor',JSON.stringify({event:'heartbeat_timeout',age_ms:age,pid:child.pid}));syncRuntime({worker_status:'attention'});child.kill('SIGKILL')}
 },15_000);monitor.unref?.();
 const stress=setTimeout(()=>runProcessIsolationStress(),35_000);stress.unref?.();
 const stop=signal=>{if(shuttingDown)return;shuttingDown=true;syncRuntime({worker_status:'stopping'});if(child?.connected)child.kill('SIGTERM');setTimeout(()=>process.exit(0),1500).unref?.()};
 process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGINT',()=>stop('SIGINT'));
 console.log('Mendlyx worker supervisor active');
}
