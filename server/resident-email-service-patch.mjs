import express from 'express';
import crypto from 'crypto';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
const RESEND_API_KEY=process.env.RESEND_API_KEY||'';
const FRONTEND_ORIGIN=process.env.FRONTEND_ORIGIN||'https://rentpilot-ai.onrender.com';
const FROM_EMAIL=process.env.MONEY_CHASER_FROM_EMAIL||'baifi@baifisystems.com';
const WEBHOOK_ENDPOINT=(process.env.RESIDENT_EMAIL_WEBHOOK_URL||'https://rentpilot-ai-backend-wlzb.onrender.com/api/resident-email/webhook').replace(/\/$/,'');
let installed=false;

function cleanEmail(v=''){const m=String(v).match(/<([^>]+)>/);return String(m?m[1]:v).trim().toLowerCase()}
function money(n){return Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}
function includesAny(q,terms){return terms.some(x=>q.includes(x))}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function topicTitle(topic='general'){return({payment_status:'Payment update',rent_due:'Rent due information',lease_end:'Lease information',documents:'Documents update',maintenance_status:'Maintenance update',pet_policy:'Lease pet policy',pet_request:'Pet request received',management_review:'Management review'}[topic]||'Resident service update')}
function emailHtml(ctx,result){
 const resident=escapeHtml(String(ctx.tenant?.full_name||'Resident').split(' ')[0]||'Resident');
 const reply=escapeHtml(result.reply).replace(/\n/g,'<br>');
 const topic=escapeHtml(topicTitle(result.topic));
 const portal=escapeHtml(FRONTEND_ORIGIN);
 return `<!doctype html><html><body style="margin:0;background:#f2f5f2;font-family:Arial,Helvetica,sans-serif;color:#17231b">
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5f2;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe8df;border-radius:20px;overflow:hidden">
 <tr><td style="background:#173f2a;padding:24px 28px;color:#fff">
 <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#dfff86;font-weight:700">Mendlyx Resident Service</div>
 <div style="font-size:25px;font-weight:800;margin-top:6px">NOVA</div>
 <div style="font-size:14px;color:#cfe0d2;margin-top:4px">Your property service desk</div>
 </td></tr>
 <tr><td style="padding:28px">
 <div style="font-size:13px;font-weight:700;color:#54705d;text-transform:uppercase;letter-spacing:.8px">${topic}</div>
 <h2 style="margin:8px 0 18px;font-size:21px;color:#17231b">Hi ${resident},</h2>
 <div style="font-size:16px;line-height:1.65;background:#f7faf7;border:1px solid #e2eae2;border-radius:14px;padding:18px 20px">${reply}</div>
 <div style="margin-top:22px;padding-top:18px;border-top:1px solid #e8eee8;font-size:13px;line-height:1.55;color:#617066">
 This response was generated from your verified Mendlyx property records. You can reply directly to this email and your message will stay connected to your resident conversation.
 </div>
 <div style="margin-top:18px"><a href="${portal}" style="display:inline-block;background:#173f2a;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:10px">Open Resident Portal</a></div>
 </td></tr>
 <tr><td style="padding:18px 28px;background:#f7faf7;border-top:1px solid #e6ece6;font-size:12px;color:#738078">
 Mendlyx NOVA • Rent • Lease • Maintenance • Documents
 </td></tr></table></td></tr></table></body></html>`;
}
function verifySvix(payload,headers,secret){if(!secret)return false;const id=String(headers['svix-id']||''),ts=String(headers['svix-timestamp']||''),sig=String(headers['svix-signature']||'');if(!id||!ts||!sig)return false;const age=Math.abs(Date.now()/1000-Number(ts));if(!Number.isFinite(age)||age>300)return false;const key=Buffer.from(String(secret).replace(/^whsec_/,''),'base64');const expected=crypto.createHmac('sha256',key).update(`${id}.${ts}.${payload}`).digest('base64');return sig.split(' ').some(part=>{const value=part.startsWith('v1,')?part.slice(3):part;try{return value.length===expected.length&&crypto.timingSafeEqual(Buffer.from(value),Buffer.from(expected))}catch{return false}})}
async function resend(path,opts={}){const r=await fetch(`https://api.resend.com${path}`,{...opts,headers:{authorization:`Bearer ${RESEND_API_KEY}`,'content-type':'application/json',...(opts.headers||{})}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||`Resend ${r.status}`);return j}
async function ensureWebhook(){if(!admin||!RESEND_API_KEY)return;const{data:rows}=await admin.from('resident_channel_config').select('resend_webhook_id,resend_webhook_signing_secret').not('resend_webhook_id','is',null).limit(1);if(rows?.[0]?.resend_webhook_id&&rows?.[0]?.resend_webhook_signing_secret)return;const j=await resend('/webhooks',{method:'POST',body:JSON.stringify({endpoint:WEBHOOK_ENDPOINT,events:['email.received']})});await admin.from('resident_channel_config').upsert({owner_id:'00000000-0000-0000-0000-000000000000',resend_webhook_id:j.id||null,resend_webhook_signing_secret:j.signing_secret||null,inbound_email_enabled:true,updated_at:new Date().toISOString()},{onConflict:'owner_id'});console.log('NOVA resident inbound email webhook configured')}
async function webhookSecret(){const{data}=await admin.from('resident_channel_config').select('resend_webhook_signing_secret').not('resend_webhook_signing_secret','is',null).limit(1);return data?.[0]?.resend_webhook_signing_secret||null}
async function receivedEmail(id,eventData){try{return await resend(`/emails/receiving/${encodeURIComponent(id)}`,{method:'GET'})}catch(e){console.error('resident-email-retrieve',e?.message||e);return eventData||{}}}
async function tenantContext(fromEmail,inReplyTo,providerMessageId){
 if(inReplyTo){const{data:prior}=await admin.from('resident_thread_messages').select('tenant_id,lease_id,owner_id,thread_id').eq('provider_message_id',String(inReplyTo)).order('created_at',{ascending:false}).limit(1);if(prior?.[0]){const p=prior[0];const[{data:tenant},{data:lease}]=await Promise.all([admin.from('tenants').select('*').eq('id',p.tenant_id).maybeSingle(),admin.from('leases').select('*,units(property_id,unit_label,properties(name))').eq('id',p.lease_id).maybeSingle()]);if(tenant&&lease)return{tenant,lease,threadId:p.thread_id}}}
 const email=cleanEmail(fromEmail);const{data:tenants}=await admin.from('tenants').select('*').ilike('email',email);for(const tenant of tenants||[]){const{data:lease}=await admin.from('leases').select('*,units(property_id,unit_label,properties(name))').eq('tenant_id',tenant.id).eq('status','active').maybeSingle();if(lease)return{tenant,lease,threadId:null}}
 return null
}
async function ensureThread(ctx,subject){if(ctx.threadId)return ctx.threadId;const propertyId=ctx.lease?.units?.property_id||null;const row={owner_id:ctx.tenant.owner_id,property_id:propertyId,unit_id:ctx.lease.unit_id,lease_id:ctx.lease.id,tenant_id:ctx.tenant.id,subject:subject||'Resident conversation',last_channel:'email',last_message_at:new Date().toISOString(),last_inbound_at:new Date().toISOString(),updated_at:new Date().toISOString()};const{data,error}=await admin.from('resident_threads').upsert(row,{onConflict:'owner_id,tenant_id,lease_id'}).select('id').single();if(error)throw error;return data.id}
async function policy(ownerId){return (await admin.from('nova_autonomy_policies').select('*').eq('owner_id',ownerId).maybeSingle()).data||{}}
async function resolve(ctx,message){
 const q=String(message||'').toLowerCase(),p=await policy(ctx.tenant.owner_id),lease=ctx.lease;
 if(includesAny(q,['when is rent due','rent due','due date','what day is rent']))return{handled:true,topic:'rent_due',type:'deterministic',reply:`Your rent is due on day ${lease.due_day} of each month according to your active lease record.`};
 if(includesAny(q,['lease end','lease expire','when does my lease','end date']))return{handled:true,topic:'lease_end',type:'deterministic',reply:lease.end_date?`Your active lease ends on ${lease.end_date}.`:'Your active lease record does not currently have an end date recorded.'};
 if(includesAny(q,['did you get my rent','did you get my payment','payment received','my balance','current balance','what do i owe','how much do i owe'])){const[{data:charges},{data:payments}]=await Promise.all([admin.from('rent_charges').select('id,amount').eq('lease_id',lease.id),admin.from('payments').select('id,rent_charge_id,amount,paid_at').eq('lease_id',lease.id).order('paid_at',{ascending:false})]);const paid={};for(const x of payments||[])if(x.rent_charge_id)paid[x.rent_charge_id]=(paid[x.rent_charge_id]||0)+Number(x.amount||0);const balance=(charges||[]).reduce((s,c)=>s+Math.max(0,Number(c.amount||0)-Number(paid[c.id]||0)),0),last=payments?.[0];return{handled:true,topic:'payment_status',type:'deterministic',reply:`Your current recorded balance is ${money(balance)}.${last?` Your most recent recorded payment was ${money(last.amount)} on ${String(last.paid_at).slice(0,10)}.`:''}`}}
 if(includesAny(q,['document','lease copy','addendum','paperwork'])){const{data:docs}=await admin.from('lease_documents').select('name').eq('lease_id',lease.id).eq('visible_to_resident',true);return{handled:true,topic:'documents',type:'deterministic',reply:`You currently have ${(docs||[]).length} document${(docs||[]).length===1?'':'s'} available in your Mendlyx Documents tab.${docs?.length?' They include: '+docs.slice(0,5).map(d=>d.name).join(', ')+'.':''}`}}
 if(includesAny(q,['maintenance status','repair status','work order','when are they coming'])){const{data:r}=await admin.from('maintenance_requests').select('title,status,scheduled_for').eq('tenant_id',ctx.tenant.id).not('status','in','(completed,cancelled)').order('created_at',{ascending:false}).limit(1);const x=r?.[0];return{handled:true,topic:'maintenance_status',type:'deterministic',reply:x?`Your latest open maintenance request is “${x.title}.” Its current status is ${String(x.status).replaceAll('_',' ')}${x.scheduled_for?`, scheduled for ${x.scheduled_for}`:''}.`:'You do not currently have an open maintenance request.'}}
 if(includesAny(q,['lawyer','attorney','legal notice','evict','eviction','sue','court','concession','discount my rent','lower my rent','waive','remove fee']))return{handled:true,topic:'management_review',type:'exception',reply:'I received your message and sent it to management for review. NOVA will not make legal, fee, or rent-concession decisions on its own.'};
 if(includesAny(q,['can i have a dog','can i get a dog','can i have a pet','pet allowed','pets allowed'])){const{data:intel}=await admin.from('lease_intelligence').select('pet_policy').eq('owner_id',ctx.tenant.owner_id).eq('lease_id',lease.id).maybeSingle();if(intel?.pet_policy&&p.lease_fact_answers_auto!==false)return{handled:true,topic:'pet_policy',type:'deterministic',reply:`Your lease record says: ${intel.pet_policy}`};return{handled:true,topic:'pet_request',type:'exception',reply:'I received your pet question and sent it to management because it requires a verified lease rule or management decision.'}}
 return{handled:false,topic:'general',type:'exception',reply:'I received your message. I could not verify a complete answer from your property records, so I sent it to management rather than guessing.'}
}
async function ensureException(ctx,result,message){if(result.type!=='exception')return;const propertyId=ctx.lease?.units?.property_id||null;const{data:x}=await admin.from('nova_exceptions').select('id').eq('owner_id',ctx.tenant.owner_id).eq('tenant_id',ctx.tenant.id).eq('exception_type','resident_question').eq('status','open').maybeSingle();if(!x)await admin.from('nova_exceptions').insert({owner_id:ctx.tenant.owner_id,property_id:propertyId,unit_id:ctx.lease.unit_id,lease_id:ctx.lease.id,tenant_id:ctx.tenant.id,exception_type:'resident_question',severity:'normal',title:'Resident question needs review',summary:message.slice(0,1000),recommendation:'Review the resident question and answer only from verified records/policy.',metadata:{topic:result.topic,channel:'email'}})}
async function sendReply(ctx,threadId,result,subject,inReplyTo){
 if(!ctx.tenant.email||!RESEND_API_KEY)return null;
 const cfg=(await admin.from('resident_channel_config').select('resend_inbound_address').eq('owner_id',ctx.tenant.owner_id).maybeSingle()).data;
 const replyTo=cfg?.resend_inbound_address||FROM_EMAIL;
 const headers={};if(inReplyTo){headers['In-Reply-To']=inReplyTo;headers['References']=inReplyTo}
 const generic=!subject||/^resident email$/i.test(subject)||/^your mendlyx message$/i.test(subject);
 const emailSubject=generic?`Mendlyx NOVA • ${topicTitle(result.topic)}`:(subject.toLowerCase().startsWith('re:')?subject:`Re: ${subject}`);
 const j=await resend('/emails',{method:'POST',body:JSON.stringify({
  from:`Mendlyx NOVA <${FROM_EMAIL}>`,
  to:[ctx.tenant.email],
  reply_to:replyTo,
  subject:emailSubject,
  text:result.reply,
  html:emailHtml(ctx,result),
  headers,
  tags:[{name:'system',value:'resident_service_desk'},{name:'tenant_id',value:String(ctx.tenant.id)}]
 })});
 await admin.from('resident_thread_messages').insert({thread_id:threadId,owner_id:ctx.tenant.owner_id,tenant_id:ctx.tenant.id,lease_id:ctx.lease.id,channel:'email',direction:'outbound',body:result.reply,subject:emailSubject,topic:result.topic,resolution_type:result.type,provider:'resend',provider_email_id:j.id||null,in_reply_to:inReplyTo||null});
 await admin.from('resident_interactions').insert({owner_id:ctx.tenant.owner_id,property_id:ctx.lease?.units?.property_id||null,lease_id:ctx.lease.id,tenant_id:ctx.tenant.id,channel:'email',direction:'outbound',topic:result.topic,body:result.reply,resolution_type:result.type,source_id:j.id||null});
 await admin.from('messages').insert({owner_id:ctx.tenant.owner_id,tenant_id:ctx.tenant.id,lease_id:ctx.lease.id,direction:'outbound',channel:'email',body:result.reply,category:'resident_service',ai_summary:`NOVA ${topicTitle(result.topic)} reply sent by email.`});
 await admin.from('resident_threads').update({last_channel:'email',last_message_at:new Date().toISOString(),last_outbound_at:new Date().toISOString(),topic:result.topic,updated_at:new Date().toISOString()}).eq('id',threadId);
 return j
}
async function processInbound(event){const d=event.data||{},emailId=String(d.email_id||'');if(!emailId)return;const{data:dupe}=await admin.from('resident_thread_messages').select('id').eq('provider','resend').eq('provider_email_id',emailId).maybeSingle();if(dupe)return;const full=await receivedEmail(emailId,d);const from=full.from||d.from||'',subject=full.subject||d.subject||'Resident email',text=String(full.text||full.plain_text||full.text_body||'').trim(),headers=full.headers||{};const inReplyTo=headers['in-reply-to']||headers['In-Reply-To']||full.in_reply_to||null;const ctx=await tenantContext(from,inReplyTo,d.message_id||null);if(!ctx){console.warn('resident-email-unmatched',cleanEmail(from),subject);return}const threadId=await ensureThread(ctx,subject);const body=text||`Subject: ${subject}`;await admin.from('resident_thread_messages').insert({thread_id:threadId,owner_id:ctx.tenant.owner_id,tenant_id:ctx.tenant.id,lease_id:ctx.lease.id,channel:'email',direction:'inbound',body,subject,provider:'resend',provider_email_id:emailId,provider_message_id:d.message_id||full.message_id||null,in_reply_to:inReplyTo,attachment_metadata:d.attachments||full.attachments||[]});await admin.from('resident_interactions').insert({owner_id:ctx.tenant.owner_id,property_id:ctx.lease?.units?.property_id||null,lease_id:ctx.lease.id,tenant_id:ctx.tenant.id,channel:'email',direction:'inbound',topic:'email',body,source_id:emailId});await admin.from('messages').insert({owner_id:ctx.tenant.owner_id,tenant_id:ctx.tenant.id,lease_id:ctx.lease.id,direction:'inbound',channel:'email',body,category:'resident_service',ai_summary:'Inbound resident email captured by NOVA.',attachment_paths:d.attachments||full.attachments||[]});await admin.from('resident_threads').update({last_channel:'email',last_message_at:new Date().toISOString(),last_inbound_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',threadId);const result=await resolve(ctx,body);await ensureException(ctx,result,body);await sendReply(ctx,threadId,result,subject,d.message_id||full.message_id||null)}

async function authOwner(req,res,next){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token||!KEY)return res.status(401).json({error:'Authentication required'});const c=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false}});const{data}=await c.auth.getUser(token);if(!data?.user)return res.status(401).json({error:'Invalid session'});req.user=data.user;next()}

express.application.listen=function(...args){if(!installed){installed=true;
 this.post('/api/resident-email/webhook',async(req,res)=>{try{if(!admin)return res.status(503).send('Unavailable');const secret=await webhookSecret(),raw=req.rawBody?req.rawBody.toString('utf8'):JSON.stringify(req.body||{});if(!verifySvix(raw,req.headers,secret))return res.status(400).send('Invalid signature');if(req.body?.type==='email.received')await processInbound(req.body);return res.json({ok:true})}catch(e){console.error('resident-email-webhook',e);return res.status(500).json({error:'Unable to process inbound resident email'})}});
 this.post('/api/resident-email/config',authOwner,async(req,res)=>{try{const address=String(req.body?.inboundAddress||'').trim().toLowerCase();if(address&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))return res.status(400).json({error:'Valid inbound email address required'});await admin.from('resident_channel_config').upsert({owner_id:req.user.id,resend_inbound_address:address||null,inbound_email_enabled:Boolean(address),updated_at:new Date().toISOString()},{onConflict:'owner_id'});return res.json({ok:true,inboundAddress:address||null})}catch(e){return res.status(500).json({error:'Unable to save resident email configuration'})}});
 console.log('Mendlyx NOVA resident email service desk routes installed')}
 const server=originalListen.apply(this,args);ensureWebhook().catch(e=>console.error('resident-email-webhook-setup',e?.message||e));return server};
