import express from 'express';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
let installed=false;

async function residentContext(req,res){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token||!KEY||!admin){res.status(401).json({error:'Authentication required'});return null}
 const authClient=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false}});
 const{data}=await authClient.auth.getUser(token);
 if(!data?.user){res.status(401).json({error:'Invalid session'});return null}
 const{data:tenant}=await admin.from('tenants').select('id,owner_id').eq('user_id',data.user.id).eq('resident_account_active',true).maybeSingle();
 if(!tenant){res.status(403).json({error:'Resident account required'});return null}
 const{data:lease}=await admin.from('leases').select('id').eq('tenant_id',tenant.id).eq('status','active').maybeSingle();
 if(!lease){res.status(409).json({error:'No active lease'});return null}
 return{tenant,lease}
}

express.application.listen=function(...args){
 if(!installed){installed=true;
  this.get('/api/resident/thread-history',async(req,res)=>{
   try{
    const ctx=await residentContext(req,res);if(!ctx)return;
    const{data:thread}=await admin.from('resident_threads').select('id,subject,topic,last_channel,last_message_at').eq('owner_id',ctx.tenant.owner_id).eq('tenant_id',ctx.tenant.id).eq('lease_id',ctx.lease.id).maybeSingle();
    if(!thread)return res.json({thread:null,messages:[]});
    const{data:rows,error}=await admin.from('resident_thread_messages').select('channel,direction,body,subject,topic,resolution_type,created_at').eq('thread_id',thread.id).order('created_at',{ascending:false}).limit(30);
    if(error)throw error;
    return res.json({thread,messages:(rows||[]).reverse()});
   }catch(e){console.error('resident-thread-history',e);return res.status(500).json({error:'Unable to load resident conversation history'})}
  });
  console.log('NOVA resident omnichannel history endpoint active');
 }
 return originalListen.apply(this,args)
};
