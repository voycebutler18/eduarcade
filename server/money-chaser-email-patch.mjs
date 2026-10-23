import express from 'express';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_HKpnoybJTD0ILSYMUYNXWA_Jy25MuzT';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
const FROM_EMAIL=process.env.MONEY_CHASER_FROM_EMAIL||'baifi@baifisystems.com';
const FROM_NAME=process.env.MONEY_CHASER_FROM_NAME||'Mendlyx Money Chaser';
const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL=process.env.GROQ_MODEL||'llama-3.3-70b-versatile';

async function authUser(req){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return null;const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});const{data,error}=await client.auth.getUser(token);return error?null:data.user}
function currency(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))}
function fallback({name,businessName,label,balance,dueDate}){return{subject:`${label} balance reminder from ${businessName}`,body:`Hi ${name||'there'},\n\nOur records show an outstanding balance of ${balance} for ${label.toLowerCase()} due ${dueDate}. Please review your account and make payment if it is still due. If you have already paid or believe the balance is incorrect, please reply so the record can be checked.\n\nThank you,\n${businessName}`}}
async function aiDraft(facts){if(!process.env.GROQ_API_KEY)return fallback(facts);try{const r=await fetch(GROQ_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model:GROQ_MODEL,messages:[{role:'system',content:'Write a neutral payment reminder using verified ledger facts only. Never add fees, threats, legal claims, eviction language, credit reporting, collection-agency language, or invented deadlines.'},{role:'user',content:`Verified facts: ${JSON.stringify(facts)}. Return JSON only with subject and body. Body plain text under 120 words. Tell the recipient to reply if already paid or if the balance appears wrong.`}],temperature:.1,response_format:{type:'json_object'}})});if(!r.ok)throw new Error(`Groq ${r.status}`);const j=await r.json(),x=JSON.parse(j.choices?.[0]?.message?.content||'{}');if(!x.subject||!x.body)throw new Error('Invalid draft');return{subject:String(x.subject).slice(0,180),body:String(x.body).slice(0,4000)}}catch{return fallback(facts)}}
async function resend({to,subject,body}){if(!process.env.RESEND_API_KEY)throw new Error('Resend is not configured');const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.RESEND_API_KEY}`},body:JSON.stringify({from:`${FROM_NAME} <${FROM_EMAIL}>`,to:[to],subject,text:body,reply_to:FROM_EMAIL})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||`Resend ${r.status}`);return j.id||null}

express.application.listen=function(...args){
 if(!this.locals?.moneyChaserEmailRouteInstalled){
  this.locals.moneyChaserEmailRouteInstalled=true;
  this.post('/api/money-chaser/send',async(req,res)=>{
   try{
    if(!admin)return res.status(503).json({error:'Money Chaser email service is unavailable'});
    const user=await authUser(req);if(!user)return res.status(401).json({error:'Authentication required'});
    const kind=String(req.body?.kind||''),id=String(req.body?.id||'');if(!id||!['business','rent'].includes(kind))return res.status(400).json({error:'Valid reminder type and ID are required'});
    if(kind==='rent'){
     const{data:q}=await admin.from('rent_followup_queue').select('id,owner_id,lease_id,tenant_id,source_type,balance,due_date,message_body,email_sent_at').eq('id',id).eq('owner_id',user.id).maybeSingle();
     if(!q)return res.status(404).json({error:'Rent reminder not found'});if(q.email_sent_at)return res.status(409).json({error:'This reminder was already emailed'});
     const{data:t}=await admin.from('tenants').select('full_name,email').eq('id',q.tenant_id).single();if(!t?.email)return res.status(409).json({error:'This resident does not have an email address'});
     const subject=q.source_type==='payment_promise'?'Payment date follow-up':'Balance reminder from Mendlyx';const providerId=await resend({to:t.email,subject,body:q.message_body});const now=new Date().toISOString();await admin.from('rent_followup_queue').update({email_sent_at:now,email_provider_message_id:providerId,updated_at:now}).eq('id',q.id);await admin.from('messages').insert({owner_id:q.owner_id,tenant_id:q.tenant_id,lease_id:q.lease_id,direction:'outbound',channel:'email',body:q.message_body,category:q.source_type==='payment_promise'?'payment_promise_email':'rent_balance_email',ai_summary:'Owner-approved Money Chaser email sent through Resend from verified ledger data. This is not a legal notice.'});return res.json({sent:true,to:t.email,provider_message_id:providerId});
    }
    const{data:r}=await admin.from('money_chaser_receivables').select('id,owner_id,debtor_id,reference,amount_outstanding,due_date,state').eq('id',id).eq('owner_id',user.id).maybeSingle();if(!r)return res.status(404).json({error:'Receivable not found'});if(Number(r.amount_outstanding)<=0||r.state==='paid')return res.status(409).json({error:'This receivable has no outstanding balance'});if(['paused','disputed'].includes(r.state))return res.status(409).json({error:'This receivable is paused or disputed'});
    const[{data:d},{data:p}]=await Promise.all([admin.from('money_chaser_debtors').select('display_name,email').eq('id',r.debtor_id).eq('owner_id',user.id).single(),admin.from('money_chaser_profiles').select('business_name,receivable_label').eq('owner_id',user.id).maybeSingle()]);if(!d?.email)return res.status(409).json({error:'This customer does not have an email address'});
    const facts={name:d.display_name,businessName:p?.business_name||'Mendlyx customer',label:p?.receivable_label||'Invoice',balance:currency(r.amount_outstanding),dueDate:r.due_date};const msg=await aiDraft(facts);const providerId=await resend({to:d.email,subject:msg.subject,body:msg.body});const now=new Date().toISOString();await admin.from('money_chaser_communications').insert({owner_id:user.id,receivable_id:r.id,debtor_id:r.debtor_id,direction:'outbound',channel:'email',intent:'owner_approved_balance_reminder',sentiment:'neutral',body:msg.body,status:'sent',provider_message_id:providerId,occurred_at:now});await admin.from('money_chaser_receivables').update({last_contact_at:now,updated_at:now}).eq('id',r.id);await admin.from('money_chaser_events').insert({owner_id:user.id,receivable_id:r.id,debtor_id:r.debtor_id,event_type:'email_reminder_sent',note:'Owner approved a factual Money Chaser balance reminder sent through Resend.',metadata:{provider:'resend',provider_message_id:providerId,recipient:d.email}});return res.json({sent:true,to:d.email,provider_message_id:providerId});
   }catch(e){console.error('money-chaser-email',e);return res.status(500).json({error:e?.message||'Unable to send reminder'})}
  });
 }
 return originalListen.apply(this,args)
};
