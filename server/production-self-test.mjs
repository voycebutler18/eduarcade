import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
let running=false;

function envHealth(){
 const required=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_PUBLISHABLE_KEY','GROQ_API_KEY','RESEND_API_KEY'];
 return Object.fromEntries(required.map(k=>[k,Boolean(process.env[k])]));
}
function numberEntries(obj){return Object.entries(obj||{}).map(([name,value])=>({name,value:Number(value||0)}))}

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
  const result={
   ok:failed.length===0&&missingEnv.length===0,
   reason,
   duration_ms:Date.now()-started,
   failed_checks:failed,
   missing_env:missingEnv,
   signals:data?.signals||{},
   generated_at:data?.generated_at||new Date().toISOString()
  };
  const level=result.ok?'log':'error';
  console[level]('mendlyx-self-test',JSON.stringify(result));
  return result;
 }catch(e){
  const result={ok:false,reason,duration_ms:Date.now()-started,error:String(e?.message||e).slice(0,500)};
  console.error('mendlyx-self-test',JSON.stringify(result));
  return result;
 }finally{running=false}
}

export function startProductionSelfTest(){
 if(!admin){console.error('mendlyx-self-test',JSON.stringify({ok:false,error:'SUPABASE_SERVICE_ROLE_KEY missing'}));return}
 const first=setTimeout(()=>runProductionSelfTest('startup'),20_000);
 first.unref?.();
 const timer=setInterval(()=>runProductionSelfTest('scheduled'),30*60_000);
 timer.unref?.();
}
