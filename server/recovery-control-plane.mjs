import {createHash,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const MIRROR_BUCKET='mendlyx-recovery-mirror';
const DRILL_BUCKET='mendlyx-recovery-drill-source';
const SOURCE_BUCKETS=['lease-documents','maintenance-photos','message-attachments'];
const MANIFEST_INTERVAL_MS=6*60*60*1000;
const PROFILE='disaster-recovery-v1';
const CRITICAL_TABLES=[
 'profiles','properties','units','tenants','leases','charges','payments','payment_transactions','documents','messages',
 'maintenance_requests','resident_threads','resident_thread_messages','resident_interactions','resident_channel_config','nova_exceptions',
 'nova_autonomy_policies','property_ai_state','lease_intelligence','vendor_quotes','vendor_invoices','preventive_maintenance_tasks',
 'money_chaser_profiles','money_chaser_debtors','money_chaser_receivables','money_chaser_payment_promises','money_chaser_communications',
 'account_privacy_settings','privacy_requests','business_profiles','minor_data_authorizations'
];

function sha256(value){return createHash('sha256').update(value).digest('hex')}
function stable(obj){return JSON.stringify(obj,Object.keys(obj||{}).sort())}
function delay(ms){return new Promise(r=>setTimeout(r,ms))}
function pctMs(n){return Math.round(n*10)/10}
function percentile(values,p){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(s.length*p)-1))]}

async function ensureBucket(name){
 const {data,error}=await admin.storage.listBuckets();if(error)throw error;
 if((data||[]).some(b=>b.id===name||b.name===name))return;
 const {error:createError}=await admin.storage.createBucket(name,{public:false,fileSizeLimit:null});
 if(createError&&!/already exists/i.test(createError.message||''))throw createError;
}

async function listFiles(bucket,prefix='',depth=0){
 if(depth>12)throw new Error(`Storage folder depth exceeded in ${bucket}`);
 const out=[];let offset=0;
 while(true){
  const {data,error}=await admin.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
  if(error)throw error;
  const rows=data||[];
  for(const row of rows){
   const full=prefix?`${prefix}/${row.name}`:row.name;
   const isFolder=!row.id&&!row.metadata;
   if(isFolder)out.push(...await listFiles(bucket,full,depth+1));
   else out.push({...row,full_path:full});
  }
  if(rows.length<100)break;
  offset+=rows.length;
 }
 return out;
}

async function readObject(bucket,path){
 const {data,error}=await admin.storage.from(bucket).download(path);if(error)throw error;
 const bytes=Buffer.from(await data.arrayBuffer());
 return bytes;
}

async function backupObject(bucket,file,{index=true}={}){
 const bytes=await readObject(bucket,file.full_path);
 const checksum=sha256(bytes);
 const backupPath=`objects/${bucket}/${checksum}/${file.full_path}`;
 const contentType=file.metadata?.mimetype||file.metadata?.contentType||'application/octet-stream';
 const {error:uploadError}=await admin.storage.from(MIRROR_BUCKET).upload(backupPath,bytes,{contentType,upsert:false,cacheControl:'3600'});
 if(uploadError&&!/already exists|duplicate/i.test(uploadError.message||''))throw uploadError;
 if(index){
  const {error:indexError}=await admin.from('mendlyx_storage_backup_objects').upsert({
   source_bucket:bucket,source_path:file.full_path,content_checksum:checksum,backup_bucket:MIRROR_BUCKET,backup_path:backupPath,
   size_bytes:bytes.length,content_type:contentType,source_updated_at:file.updated_at||null,last_verified_at:new Date().toISOString()
  },{onConflict:'source_bucket,source_path,content_checksum'});
  if(indexError)throw indexError;
 }
 return {source_bucket:bucket,source_path:file.full_path,checksum,backup_path:backupPath,size_bytes:bytes.length,content_type:contentType};
}

async function mirrorStorage(){
 await ensureBucket(MIRROR_BUCKET);
 const inventory=[];let failures=0,totalBytes=0;
 for(const bucket of SOURCE_BUCKETS){
  try{
   const files=await listFiles(bucket);
   let mirrored=0,bucketBytes=0;
   for(const file of files){
    try{const b=await backupObject(bucket,file);mirrored++;bucketBytes+=b.size_bytes}catch(e){failures++;console.error('mendlyx-recovery storage backup',bucket,file.full_path,e?.message||e)}
   }
   totalBytes+=bucketBytes;inventory.push({bucket,objects:files.length,mirrored,bytes:bucketBytes});
  }catch(e){failures++;inventory.push({bucket,objects:null,mirrored:0,bytes:0,error:String(e?.message||e).slice(0,300)})}
 }
 return {mirror_bucket:MIRROR_BUCKET,source_buckets:inventory,total_bytes:totalBytes,failures};
}

async function tableCounts(){
 const counts={};const errors={};
 await Promise.all(CRITICAL_TABLES.map(async table=>{
  const {count,error}=await admin.from(table).select('*',{count:'exact',head:true});
  if(error){errors[table]=error.message;counts[table]=null}else counts[table]=Number(count||0);
 }));
 return {counts,errors};
}

export async function runRecoveryManifest(reason='scheduled'){
 if(!admin)return null;
 const started=performance.now();
 const [{counts,errors},storage,health]=await Promise.all([
  tableCounts(),mirrorStorage(),admin.rpc('mendlyx_internal_health_snapshot')
 ]);
 const integrity=health.data||{};
 const integrityFailures=Object.values(integrity.failures||{}).reduce((s,v)=>s+Number(v||0),0);
 const configuration={platform_backup_provider:'supabase',platform_backup_mode:'daily_physical',platform_retention_days:7,storage_mirror_bucket:MIRROR_BUCKET,source_buckets:SOURCE_BUCKETS,reason};
 const payload={table_counts:counts,storage_inventory:storage,integrity_snapshot:integrity,configuration_snapshot:configuration};
 const checksum=sha256(Buffer.from(JSON.stringify(payload)));
 const ok=!health.error&&Object.keys(errors).length===0&&storage.failures===0&&integrityFailures===0;
 const now=new Date().toISOString();
 const {data:manifest,error}=await admin.from('mendlyx_recovery_manifests').insert({manifest_version:'recovery-v1',status:ok?'verified':'failed',verified_at:ok?now:null,table_counts:counts,storage_inventory:storage,integrity_snapshot:integrity,configuration_snapshot:configuration,checksum,notes:Object.keys(errors).length?JSON.stringify(errors).slice(0,4000):null}).select('id,created_at,status,checksum').single();
 if(error)throw error;
 await admin.from('mendlyx_recovery_configuration').update({last_manifest_at:now,updated_at:now}).eq('id',1);
 console[ok?'log':'error']('mendlyx-recovery-manifest',JSON.stringify({ok,id:manifest.id,status:manifest.status,checksum:checksum.slice(0,12),duration_ms:pctMs(performance.now()-started),storage_failures:storage.failures,integrity_failures:integrityFailures,table_count_errors:Object.keys(errors).length}));
 return {...manifest,ok,storage,integrity_failures:integrityFailures,table_count_errors:Object.keys(errors).length,duration_ms:pctMs(performance.now()-started)};
}

async function apiPressure(total=400,concurrency=20){
 const url=`http://127.0.0.1:${Number(process.env.PORT||10000)}/health`;let cursor=0;const rows=[];
 async function worker(){while(cursor<total){const i=cursor++;const t=performance.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});await r.arrayBuffer();rows[i]={ok:r.ok,ms:performance.now()-t}}catch{rows[i]={ok:false,ms:performance.now()-t}}}}
 await Promise.all(Array.from({length:concurrency},worker));
 const times=rows.map(x=>x.ms);return {total,concurrency,failed:rows.filter(x=>!x.ok).length,p50_ms:pctMs(percentile(times,.5)),p95_ms:pctMs(percentile(times,.95)),p99_ms:pctMs(percentile(times,.99)),max_ms:pctMs(Math.max(...times))};
}

async function databaseCanary(){
 const id=randomUUID(),key=`recovery-${id}`;const original={version:1,message:'synthetic recovery canary',nonce:randomUUID()};const originalChecksum=sha256(Buffer.from(JSON.stringify(original)));
 const {error:insertError}=await admin.from('mendlyx_recovery_canary').insert({id,canary_key:key,payload:original,checksum:originalChecksum});if(insertError)throw insertError;
 try{
  const changed={version:2,message:'simulated corruption',nonce:randomUUID()};
  const {error:changeError}=await admin.from('mendlyx_recovery_canary').update({payload:changed,checksum:sha256(Buffer.from(JSON.stringify(changed))),updated_at:new Date().toISOString()}).eq('id',id);if(changeError)throw changeError;
  const {error:restoreError}=await admin.from('mendlyx_recovery_canary').update({payload:original,checksum:originalChecksum,updated_at:new Date().toISOString()}).eq('id',id);if(restoreError)throw restoreError;
  const {data,error:readError}=await admin.from('mendlyx_recovery_canary').select('payload,checksum').eq('id',id).single();if(readError)throw readError;
  const restoredChecksum=sha256(Buffer.from(JSON.stringify(data.payload)));
  return {ok:data.checksum===originalChecksum&&restoredChecksum===originalChecksum,original_checksum:originalChecksum.slice(0,16),restored_checksum:restoredChecksum.slice(0,16)};
 }finally{await admin.from('mendlyx_recovery_canary').delete().eq('id',id)}
}

async function storageCanary(){
 await ensureBucket(MIRROR_BUCKET);await ensureBucket(DRILL_BUCKET);
 const name=`drill/${randomUUID()}.txt`;const bytes=Buffer.from(`Mendlyx synthetic recovery canary ${randomUUID()}`);const checksum=sha256(bytes);
 const {error:putError}=await admin.storage.from(DRILL_BUCKET).upload(name,bytes,{contentType:'text/plain',upsert:false});if(putError)throw putError;
 let backupPath=null;
 try{
  const fake={full_path:name,updated_at:new Date().toISOString(),metadata:{mimetype:'text/plain'}};
  const backup=await backupObject(DRILL_BUCKET,fake,{index:false});backupPath=backup.backup_path;
  const {error:deleteError}=await admin.storage.from(DRILL_BUCKET).remove([name]);if(deleteError)throw deleteError;
  const mirrorBytes=await readObject(MIRROR_BUCKET,backupPath);
  const {error:restoreError}=await admin.storage.from(DRILL_BUCKET).upload(name,mirrorBytes,{contentType:'text/plain',upsert:false});if(restoreError)throw restoreError;
  const restored=await readObject(DRILL_BUCKET,name);const restoredChecksum=sha256(restored);
  return {ok:restoredChecksum===checksum,original_checksum:checksum.slice(0,16),restored_checksum:restoredChecksum.slice(0,16)};
 }finally{
  await admin.storage.from(DRILL_BUCKET).remove([name]).catch(()=>{});
  if(backupPath)await admin.storage.from(MIRROR_BUCKET).remove([backupPath]).catch(()=>{});
 }
}

export async function runOneTimeRecoveryDrill(){
 if(!admin)return null;
 const {data:existing}=await admin.from('mendlyx_recovery_drills').select('id,status').eq('profile',PROFILE).maybeSingle();
 if(existing){console.log('mendlyx-recovery-drill',JSON.stringify({profile:PROFILE,skipped:true,status:existing.status}));return existing}
 const {data:row,error}=await admin.from('mendlyx_recovery_drills').insert({profile:PROFILE,status:'running'}).select('id,started_at').single();if(error)throw error;
 const started=performance.now();
 try{
  const [database,storage,api]=await Promise.all([databaseCanary(),storageCanary(),apiPressure()]);
  const manifest=await runRecoveryManifest('disaster-recovery-drill');
  const {data:health,error:healthError}=await admin.rpc('mendlyx_internal_health_snapshot');
  const integrityFailures=Object.values(health?.failures||{}).reduce((s,v)=>s+Number(v||0),0);
  const ok=database.ok&&storage.ok&&api.failed===0&&api.p95_ms<1000&&manifest?.ok&&!healthError&&integrityFailures===0;
  const finishedAt=new Date().toISOString();const results={profile:PROFILE,ok,database_canary:database,storage_canary:storage,api_pressure:api,manifest:{ok:manifest?.ok,id:manifest?.id,storage_failures:manifest?.storage?.failures||0},integrity_failures:integrityFailures,duration_ms:pctMs(performance.now()-started),finished_at:finishedAt};
  await admin.from('mendlyx_recovery_drills').update({status:ok?'passed':'failed',finished_at:finishedAt,results}).eq('id',row.id);
  await admin.from('mendlyx_recovery_configuration').update({last_drill_at:finishedAt,last_drill_status:ok?'passed':'failed',updated_at:finishedAt}).eq('id',1);
  console[ok?'log':'error']('mendlyx-recovery-drill',JSON.stringify(results));return results;
 }catch(e){const finishedAt=new Date().toISOString();const results={profile:PROFILE,ok:false,error:String(e?.message||e).slice(0,700),finished_at:finishedAt,duration_ms:pctMs(performance.now()-started)};await admin.from('mendlyx_recovery_drills').update({status:'failed',finished_at:finishedAt,results}).eq('id',row.id);await admin.from('mendlyx_recovery_configuration').update({last_drill_at:finishedAt,last_drill_status:'failed',updated_at:finishedAt}).eq('id',1);console.error('mendlyx-recovery-drill',JSON.stringify(results));return results}
}

export function startRecoveryControlPlane(){
 if(!admin)return;
 const initial=setTimeout(()=>runRecoveryManifest('worker-start').catch(e=>console.error('mendlyx-recovery-manifest',e?.message||e)),60_000);initial.unref?.();
 const interval=setInterval(()=>runRecoveryManifest('scheduled').catch(e=>console.error('mendlyx-recovery-manifest',e?.message||e)),MANIFEST_INTERVAL_MS);interval.unref?.();
 const drill=setTimeout(()=>runOneTimeRecoveryDrill().catch(e=>console.error('mendlyx-recovery-drill',e?.message||e)),90_000);drill.unref?.();
 console.log('Mendlyx recovery control plane active');
}
