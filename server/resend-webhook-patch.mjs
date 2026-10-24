import express from 'express';
import crypto from 'crypto';
import {createClient} from '@supabase/supabase-js';

const originalJson=express.json;
express.json=function(options={}){
 const priorVerify=options.verify;
 return originalJson({...options,verify(req,res,buf,encoding){req.rawBody=Buffer.from(buf);if(typeof priorVerify==='function')priorVerify(req,res,buf,encoding)}})
};

const originalListen=express.application.listen;
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
const WEBHOOK_ENDPOINT=(process.env.MONEY_CHASER_WEBHOOK_URL||'https://rentpilot-ai-backend-wlzb.onrender.com/api/resend/webhook').replace(/\/$/,'');
const EVENTS=['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.opened','email.clicked','email.failed'];

function verifySvix(payload,headers,secret){
 if(!secret)return false;
 const id=String(headers['svix-id']||''),ts=String(headers['svix-timestamp']||''),sig=String(headers['svix-signature']||'');
 if(!id||!ts||!sig)return false;
 const age=Math.abs(Date.now()/1000-Number(ts));if(!Number.isFinite(age)||age>300)return false;
 const key=Buffer.from(String(secret).replace(/^whsec_/,''),'base64');
 const expected=crypto.createHmac('sha256',key).update(`${id}.${ts}.${payload}`).digest('base64');
 return sig.split(' ').some(part=>{const value=part.startsWith('v1,')?part.slice(3):part;if(value.length!==expected.length)return false;try{return crypto.timingSafeEqual(Buffer.from(value),Buffer.from(expected))}catch{return false}})
}

async function ensureWebhook(){
 if(!admin||!process.env.RESEND_API_KEY)return;
 const{data:cfg}=await admin.from('money_chaser_provider_config').select('webhook_id,webhook_signing_secret,webhook_endpoint').eq('provider','resend').maybeSingle();
 if(cfg?.webhook_id&&cfg?.webhook_signing_secret&&cfg?.webhook_endpoint===WEBHOOK_ENDPOINT)return;
 const r=await fetch('https://api.resend.com/webhooks',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.RESEND_API_KEY}`},body:JSON.stringify({endpoint:WEBHOOK_ENDPOINT,events:EVENTS})});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||`Resend webhook ${r.status}`);
 await admin.from('money_chaser_provider_config').upsert({provider:'resend',webhook_id:j.id||null,webhook_signing_secret:j.signing_secret||null,webhook_endpoint:WEBHOOK_ENDPOINT,updated_at:new Date().toISOString()},{onConflict:'provider'});
 console.log('Money Chaser Resend webhook configured');
}

async function applyEvent(event,svixId){
 const type=String(event?.type||''),data=event?.data||{},providerId=String(data.email_id||''),occurred=event?.created_at||new Date().toISOString(),recipient=Array.isArray(data.to)?String(data.to[0]||''):String(data.to||'');
 if(!providerId||!type)return;
 await admin.from('money_chaser_email_events').upsert({provider:'resend',provider_event_id:svixId,provider_message_id:providerId,event_type:type,recipient:recipient||null,payload:event,occurred_at:occurred},{onConflict:'provider,provider_event_id',ignoreDuplicates:true});
 const map={
  'email.sent':{status:'sent'},
  'email.delivered':{status:'delivered',field:'delivered_at'},
  'email.delivery_delayed':{status:'delivery_delayed'},
  'email.bounced':{status:'bounced',field:'bounced_at'},
  'email.complained':{status:'complained',field:'complained_at'},
  'email.opened':{status:'opened',field:'opened_at'},
  'email.clicked':{status:'clicked',field:'clicked_at'},
  'email.failed':{status:'failed'}
 }[type]||null;
 if(!map)return;
 const communicationUpdate={status:map.status,last_event_at:occurred};if(map.field)communicationUpdate[map.field]=occurred;
 await admin.from('money_chaser_communications').update(communicationUpdate).eq('provider_message_id',providerId);
 const rentUpdate={email_delivery_status:map.status,email_last_event_at:occurred};
 if(map.field){const rentField={delivered_at:'email_delivered_at',opened_at:'email_opened_at',clicked_at:'email_clicked_at',bounced_at:'email_bounced_at',complained_at:'email_complained_at'}[map.field];if(rentField)rentUpdate[rentField]=occurred}
 await admin.from('rent_followup_queue').update(rentUpdate).eq('email_provider_message_id',providerId);
}

express.application.listen=function(...args){
 if(!this.locals?.resendWebhookInstalled){
  this.locals.resendWebhookInstalled=true;
  this.post('/api/resend/webhook',async(req,res)=>{
   try{
    if(!admin)return res.status(503).send('Unavailable');
    const{data:cfg}=await admin.from('money_chaser_provider_config').select('webhook_signing_secret').eq('provider','resend').maybeSingle();
    const raw=req.rawBody?req.rawBody.toString('utf8'):JSON.stringify(req.body||{});
    if(!verifySvix(raw,req.headers,cfg?.webhook_signing_secret))return res.status(400).send('Invalid signature');
    await applyEvent(req.body,String(req.headers['svix-id']||''));
    return res.status(200).json({ok:true});
   }catch(e){console.error('resend-webhook',e);return res.status(500).json({error:'Webhook processing failed'})}
  });
 }
 const server=originalListen.apply(this,args);
 ensureWebhook().catch(e=>console.error('resend-webhook-setup',e?.message||e));
 return server
};
