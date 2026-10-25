import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
let ran=false;

export async function runDependencyAudit(){
 if(ran)return;ran=true;
 try{
  let stdout='';
  try{
   const r=await execFileAsync('npm',['audit','--json','--include=dev'],{timeout:30_000,maxBuffer:4*1024*1024,env:{...process.env,NPM_CONFIG_FUND:'false',NPM_CONFIG_AUDIT:'true'}});
   stdout=r.stdout||'';
  }catch(e){stdout=e?.stdout||'';if(!stdout)throw e}
  const audit=JSON.parse(stdout||'{}');
  const summary=audit?.metadata?.vulnerabilities||{};
  const vulnerabilities=[];
  for(const [name,v] of Object.entries(audit?.vulnerabilities||{})){
   if(!['moderate','high','critical'].includes(String(v?.severity||'')))continue;
   vulnerabilities.push({name,severity:v.severity,direct:Boolean(v.isDirect),range:v.range||null,fix_available:v.fixAvailable||false,via:Array.isArray(v.via)?v.via.map(x=>typeof x==='string'?x:{source:x?.source||null,name:x?.name||null,severity:x?.severity||null,title:x?.title||null,range:x?.range||null}).slice(0,5):[]});
  }
  console.log('mendlyx-dependency-audit',JSON.stringify({summary,vulnerabilities}));
 }catch(e){console.warn('mendlyx-dependency-audit',JSON.stringify({error:String(e?.message||e).slice(0,500)}))}
}

export function startDependencyAudit(){
 const timer=setTimeout(()=>runDependencyAudit(),25_000);
 timer.unref?.();
}
