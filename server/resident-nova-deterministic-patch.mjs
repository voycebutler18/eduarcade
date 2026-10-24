import express from 'express';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;

async function context(req,res){
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token||!KEY)return res.status(401).json({error:'Authentication required'}),null;
 const client=createClient(SUPABASE_URL,KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});const{data}=await client.auth.getUser(token);if(!data?.user)return res.status(401).json({error:'Invalid session'}),null;
 const{data:tenant}=await client.from('tenants').select('id,owner_id,full_name').eq('user_id',data.user.id).eq('resident_account_active',true).maybeSingle();if(!tenant)return res.status(403).json({error:'Resident account required'}),null;
 const{data:lease}=await client.from('leases').select('id,owner_id,tenant_id,unit_id,monthly_rent,due_day,start_date,end_date,status,units(property_id,unit_label,properties(name))').eq('tenant_id',tenant.id).eq('status','active').maybeSingle();if(!lease)return res.status(409).json({error:'No active lease'}),null;
 return{client,tenant,lease,user:data.user}
}
function money(n){return Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}
function includesAny(q,terms){return terms.some(x=>q.includes(x))}
async function threadFor(ctx){const now=new Date().toISOString(),propertyId=ctx.lease?.units?.property_id||null;const{data,error}=await admin.from('resident_threads').upsert({owner_id:ctx.tenant.owner_id,property_id:propertyId,unit_id:ctx.lease.unit_id,lease_id:ctx.lease.id,tenant_id:ctx.tenant.id,last_channel:'app',last_message_at:now,updated_at:now},{onConflict:'owner_id,tenant_id,lease_id'}).select('id').single();if(error)throw error;return data.id}
async function log(ctx,body,resolution){if(!admin)return;const propertyId=ctx.lease?.units?.property_id||null,threadId=await threadFor(ctx),now=new Date().toISOString();await admin.from('resident_interactions').insert({owner_id:ctx.tenant.owner_id,property_id:propertyId,lease_id:ctx.lease.id,tenant_id:ctx.tenant.id,channel:'app',direction:'inbound',topic:resolution.topic||null,body,resolution_type:resolution.type||null});await admin.from('resident_thread_messages').insert({thread_id:threadId,owner_id:ctx.tenant.owner_id,tenant_id:ctx.tenant.id,lease_id:ctx.lease.id,channel:'app',direction:'inbound',body,topic:resolution.topic||null,resolution_type:resolution.type||null});if(resolution.reply){await admin.from('resident_interactions').insert({owner_id:ctx.tenant.owner_id,property_id:propertyId,lease_id:ctx.lease.id,tenant_id:ctx.tenant.id,channel:'app',direction:'outbound',topic:resolution.topic||null,body:resolution.reply,resolution_type:resolution.type||null});await admin.from('resident_thread_messages').insert({thread_id:threadId,owner_id:ctx.tenant.owner_id,tenant_id:ctx.tenant.id,lease_id:ctx.lease.id,channel:'app',direction:'outbound',body:resolution.reply,topic:resolution.topic||null,resolution_type:resolution.type||null})}await admin.from('resident_threads').update({topic:resolution.topic||null,last_channel:'app',last_message_at:now,last_inbound_at:now,last_outbound_at:resolution.reply?now:null,updated_at:now}).eq('id',threadId)}
async function resolveDeterministic(ctx,message){
 const q=String(message||'').trim().toLowerCase();
 const policy=(await admin?.from('nova_autonomy_policies').select('*').eq('owner_id',ctx.tenant.owner_id).maybeSingle())?.data||{};
 if(includesAny(q,['when is rent due','rent due','due date','what day is rent']))return{handled:true,type:'deterministic',topic:'rent_due',reply:`Your rent is due on day ${ctx.lease.due_day} of each month according to your active lease record.`};
 if(includesAny(q,['lease end','lease expire','when does my lease','end date']))return{handled:true,type:'deterministic',topic:'lease_end',reply:ctx.lease.end_date?`Your active lease ends on ${ctx.lease.end_date}.`:`Your active lease record does not currently have an end date recorded.`};
 if(includesAny(q,['did you get my rent','did you get my payment','payment received','pay my rent','my balance','current balance','what do i owe','how much do i owe'])){
  const[{data:charges},{data:payments}]=await Promise.all([ctx.client.from('rent_charges').select('id,amount,due_date,status').eq('lease_id',ctx.lease.id),ctx.client.from('payments').select('id,rent_charge_id,amount,paid_at,method').eq('lease_id',ctx.lease.id).order('paid_at',{ascending:false})]);
  const paid={};for(const p of payments||[])if(p.rent_charge_id)paid[p.rent_charge_id]=(paid[p.rent_charge_id]||0)+Number(p.amount||0);const balance=(charges||[]).reduce((s,c)=>s+Math.max(0,Number(c.amount||0)-Number(paid[c.id]||0)),0),last=(payments||[])[0];
  const received=last?` Your most recent recorded payment was ${money(last.amount)} on ${String(last.paid_at).slice(0,10)}.`:'';
  return{handled:true,type:'deterministic',topic:'payment_status',reply:`Your current recorded balance is ${money(balance)}.${received}`}
 }
 if(includesAny(q,['document','lease copy','addendum','paperwork'])){const{data:docs}=await ctx.client.from('lease_documents').select('id,name,document_type').eq('lease_id',ctx.lease.id).eq('visible_to_resident',true);return{handled:true,type:'deterministic',topic:'documents',reply:`You currently have ${(docs||[]).length} document${(docs||[]).length===1?'':'s'} available in your Documents tab.${docs?.length?' They include: '+docs.slice(0,5).map(d=>d.name).join(', ')+'.':''}`}}
 if(includesAny(q,['can i have a dog','can i get a dog','can i have a pet','pet allowed','pets allowed','dog allowed','cat allowed'])){
  const{data:intel}=await admin.from('lease_intelligence').select('pet_policy').eq('owner_id',ctx.tenant.owner_id).eq('lease_id',ctx.lease.id).maybeSingle();
  if(intel?.pet_policy)return{handled:true,type:'deterministic',topic:'pet_policy',reply:`Your lease record says: ${intel.pet_policy}`};
  if(policy.pet_request_requires_approval!==false){const propertyId=ctx.lease?.units?.property_id||null;const{data:existing}=await admin.from('nova_exceptions').select('id').eq('owner_id',ctx.tenant.owner_id).eq('tenant_id',ctx.tenant.id).eq('exception_type','pet_request').eq('status','open').maybeSingle();if(!existing)await admin.from('nova_exceptions').insert({owner_id:ctx.tenant.owner_id,property_id:propertyId,unit_id:ctx.lease.unit_id,lease_id:ctx.lease.id,tenant_id:ctx.tenant.id,exception_type:'pet_request',severity:'normal',title:'Resident pet request',summary:`${ctx.tenant.full_name} asked whether a pet is allowed. No verified pet policy is currently stored.`,recommendation:'Review the lease/addenda or approve/deny the request.',metadata:{resident_message:message}});return{handled:true,type:'exception',topic:'pet_request',reply:'I do not have a verified pet rule in your lease record, so I sent this to management for a decision.'}}
 }
 if(includesAny(q,['maintenance status','repair status','work order','when is maintenance','when are they coming'])){const{data:reqs}=await ctx.client.from('maintenance_requests').select('id,title,status,priority,scheduled_for,created_at').eq('tenant_id',ctx.tenant.id).not('status','in','(completed,cancelled)').order('created_at',{ascending:false}).limit(1);const r=reqs?.[0];if(!r)return{handled:true,type:'deterministic',topic:'maintenance_status',reply:'You do not currently have an open maintenance request.'};return{handled:true,type:'deterministic',topic:'maintenance_status',reply:`Your latest open maintenance request is “${r.title}.” Its current status is ${String(r.status).replaceAll('_',' ')}${r.scheduled_for?`, scheduled for ${r.scheduled_for}`:''}.`}}
 return{handled:false,type:'ai_fallback',topic:'general'}
}

express.application.listen=function(...args){
 if(!this.__mendlyxResidentNovaDeterministic){this.__mendlyxResidentNovaDeterministic=true;this.post('/api/resident/nova',async(req,res)=>{try{if(!admin)return res.status(503).json({error:'NOVA service unavailable'});const ctx=await context(req,res);if(!ctx)return;const message=String(req.body?.message||'').trim();if(!message)return res.status(400).json({error:'message is required'});const result=await resolveDeterministic(ctx,message);await log(ctx,message,result);return res.json(result)}catch(e){console.error('resident-nova',e);return res.status(500).json({error:'Unable to answer right now'})}})}
 return originalListen.apply(this,args)
};
