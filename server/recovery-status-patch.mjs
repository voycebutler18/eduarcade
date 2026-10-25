import express from 'express';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
const URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const PUB=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
let installed=false;
function ageHours(v){if(!v)return null;const n=(Date.now()-new Date(v).getTime())/3600000;return Number.isFinite(n)?Math.max(0,Math.round(n*10)/10):null}
async function owner(req,res){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token||!PUB||!admin){res.status(401).json({error:'Authentication required'});return null}const client=createClient(URL,PUB,{auth:{persistSession:false}});const {data}=await client.auth.getUser(token);if(!data?.user){res.status(401).json({error:'Invalid session'});return null}const [{data:owned},{data:profile}]=await Promise.all([admin.from('properties').select('id').eq('owner_id',data.user.id).limit(1),admin.from('profiles').select('is_admin').eq('id',data.user.id).maybeSingle()]);if(!owned?.length&&!profile?.is_admin){res.status(403).json({error:'Property owner access required'});return null}return data.user}

express.application.listen=function(...args){
 if(!installed){installed=true;
  this.get('/api/nova/recovery-status',async(req,res)=>{try{
   const user=await owner(req,res);if(!user)return;
   const [config,manifest,drill,backupCount]=await Promise.all([
    admin.from('mendlyx_recovery_configuration').select('platform_backup_provider,platform_backup_mode,platform_retention_days,storage_mirror_enabled,manifest_interval_hours,last_manifest_at,last_drill_at,last_drill_status,updated_at').eq('id',1).maybeSingle(),
    admin.from('mendlyx_recovery_manifests').select('id,status,created_at,verified_at,checksum,storage_inventory,integrity_snapshot').order('created_at',{ascending:false}).limit(1).maybeSingle(),
    admin.from('mendlyx_recovery_drills').select('profile,status,started_at,finished_at,results').order('started_at',{ascending:false}).limit(1).maybeSingle(),
    admin.from('mendlyx_storage_backup_objects').select('*',{count:'exact',head:true})
   ]);
   const m=manifest.data||null,d=drill.data||null,c=config.data||null;
   const manifestAge=ageHours(m?.verified_at||m?.created_at),drillAge=ageHours(d?.finished_at||d?.started_at);
   const storageFailures=Number(m?.storage_inventory?.failures||0);const integrityFailures=Object.values(m?.integrity_snapshot?.failures||{}).reduce((s,v)=>s+Number(v||0),0);
   const manifestHealthy=Boolean(m?.status==='verified'&&manifestAge!==null&&manifestAge<=8&&storageFailures===0&&integrityFailures===0);
   const drillHealthy=Boolean(d?.status==='passed'&&drillAge!==null&&drillAge<=24*30);
   const status=manifestHealthy&&drillHealthy?'healthy':m&&d?'degraded':'attention';
   res.set('cache-control','no-store');return res.json({generated_at:new Date().toISOString(),status,platform:{provider:c?.platform_backup_provider||'supabase',mode:c?.platform_backup_mode||'daily_physical',retention_days:Number(c?.platform_retention_days||7)},storage:{mirror_enabled:Boolean(c?.storage_mirror_enabled),indexed_versions:Number(backupCount.count||0),last_manifest_failures:storageFailures},manifest:m?{id:m.id,status:m.status,verified_at:m.verified_at,age_hours:manifestAge,checksum_prefix:String(m.checksum||'').slice(0,12)}:null,drill:d?{profile:d.profile,status:d.status,finished_at:d.finished_at,age_hours:drillAge,results:d.results}:null,integrity_failures:integrityFailures});
  }catch(e){console.error('mendlyx-recovery-status',e);return res.status(500).json({error:'Unable to load recovery status'})}});
  console.log('Mendlyx recovery status endpoint active');
 }
 return originalListen.apply(this,args)
};
