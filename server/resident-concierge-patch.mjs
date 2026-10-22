import express from 'express';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';
const VISION_MODEL=process.env.GROQ_VISION_MODEL||'qwen/qwen3.8-27b';
const TEXT_MODEL=process.env.GROQ_MODEL||'openai/gpt-oss-120b';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function auth(req,res){
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token){res.status(401).json({error:'Authentication required'});return null}
 if(!SUPABASE_PUBLISHABLE_KEY){res.status(503).json({error:'Resident authentication is not configured'});return null}
 const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const{data,error}=await client.auth.getUser(token);
 if(error||!data.user){res.status(401).json({error:'Invalid session'});return null}
 const{data:tenant}=await client.from('tenants').select('id,owner_id,full_name,user_id,email').eq('user_id',data.user.id).eq('resident_account_active',true).maybeSingle();
 if(!tenant){res.status(403).json({error:'Resident account required'});return null}
 const{data:lease}=await client.from('leases').select('id,owner_id,unit_id,monthly_rent,due_day,start_date,end_date,status,units(property_id,unit_label,properties(name,address_line1,city,state,postal_code))').eq('tenant_id',tenant.id).eq('status','active').maybeSingle();
 if(!lease){res.status(409).json({error:'No active lease is linked to this resident'});return null}
 return{user:data.user,tenant,lease,client}
}

async function extractPdfText(bytes){
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),useWorkerFetch:false,isEvalSupported:false}).promise;
 let text='';
 for(let i=1;i<=pdf.numPages&&text.length<90000;i++){
  const page=await pdf.getPage(i),tc=await page.getTextContent();
  text+=tc.items.map(x=>'str'in x?x.str:'').join(' ')+'\n';
 }
 return text.replace(/\s+/g,' ').trim().slice(0,90000);
}

async function leaseDocumentContext(ctx){
 if(!admin)return[];
 const{data:docs,error}=await admin.from('lease_documents').select('id,name,document_type,mime_type,storage_path,created_at,visible_to_resident').eq('lease_id',ctx.lease.id).eq('visible_to_resident',true).order('created_at',{ascending:false});
 if(error)throw error;
 const out=[];
 for(const d of docs||[]){
  let text='',extractionError=null;
  const{data:cached}=await admin.from('lease_document_ai_context').select('extracted_text,extraction_error').eq('lease_document_id',d.id).maybeSingle();
  if(cached?.extracted_text)text=cached.extracted_text;
  else{
   try{
    const dl=await admin.storage.from('lease-documents').download(d.storage_path);
    if(dl.error)throw dl.error;
    const ab=await dl.data.arrayBuffer(),mime=String(d.mime_type||dl.data.type||'').toLowerCase();
    if(mime.includes('pdf')||String(d.name).toLowerCase().endsWith('.pdf'))text=await extractPdfText(ab);
    else if(mime.startsWith('text/'))text=Buffer.from(ab).toString('utf8').slice(0,90000);
    else extractionError='Document is not a text-readable PDF or text file.';
    await admin.from('lease_document_ai_context').upsert({lease_document_id:d.id,lease_id:ctx.lease.id,owner_id:ctx.lease.owner_id,extracted_text:text||null,extracted_at:new Date().toISOString(),extraction_error:extractionError,updated_at:new Date().toISOString()},{onConflict:'lease_document_id'});
   }catch(e){
    extractionError=String(e?.message||e).slice(0,1000);
    await admin.from('lease_document_ai_context').upsert({lease_document_id:d.id,lease_id:ctx.lease.id,owner_id:ctx.lease.owner_id,extraction_error:extractionError,updated_at:new Date().toISOString()},{onConflict:'lease_document_id'});
   }
  }
  out.push({name:d.name,document_type:d.document_type,text:text||null,extraction_error:extractionError||cached?.extraction_error||null})
 }
 return out
}

async function residentFacts(ctx){
 const[c,p,docs,reqs,msgs,extra,alerts,leaseText]=await Promise.all([
  ctx.client.from('rent_charges').select('id,amount,due_date,status,description,breakdown').eq('lease_id',ctx.lease.id).order('due_date',{ascending:false}).limit(36),
  ctx.client.from('payments').select('rent_charge_id,amount,paid_at,method').eq('lease_id',ctx.lease.id).order('paid_at',{ascending:false}).limit(36),
  ctx.client.from('lease_documents').select('id,name,document_type,created_at,visible_to_resident').eq('lease_id',ctx.lease.id).eq('visible_to_resident',true).order('created_at',{ascending:false}).limit(30),
  ctx.client.from('maintenance_requests').select('id,title,description,priority,status,created_at,scheduled_for,completed_at').eq('tenant_id',ctx.tenant.id).order('created_at',{ascending:false}).limit(30),
  ctx.client.from('messages').select('id,direction,body,created_at,read_at,category').eq('tenant_id',ctx.tenant.id).order('created_at',{ascending:false}).limit(30),
  ctx.client.from('lease_additional_charges').select('id,description,amount,created_at').eq('lease_id',ctx.lease.id).order('created_at',{ascending:false}),
  ctx.client.from('resident_notifications').select('id,type,title,body,created_at,read_at').eq('tenant_id',ctx.tenant.id).order('created_at',{ascending:false}).limit(30),
  leaseDocumentContext(ctx)
 ]);
 const payments=p.data||[],charges=c.data||[],paidByCharge={};
 for(const x of payments){if(x.rent_charge_id)paidByCharge[x.rent_charge_id]=(paidByCharge[x.rent_charge_id]||0)+Number(x.amount||0)}
 const ledger=charges.map(x=>({...x,paid:Number(paidByCharge[x.id]||0),remaining:Math.max(0,Number(x.amount||0)-Number(paidByCharge[x.id]||0))}));
 return{
  resident:{id:ctx.tenant.id,name:ctx.tenant.full_name},
  lease:ctx.lease,
  lease_document_text:leaseText,
  ledger,
  payments,
  configured_additional_charges:extra.data||[],
  documents:docs.data||[],
  maintenance:reqs.data||[],
  recent_messages:msgs.data||[],
  recent_alerts:alerts.data||[],
  current_balance:ledger.reduce((s,x)=>s+x.remaining,0)
 }
}

const instruction=`You are NOVA, the dedicated RentPilot resident leasing copilot for exactly one authenticated resident profile. Use ONLY VERIFIED_FACTS supplied for that resident and never use another resident's data. You can explain balances, individual charges and charge breakdowns, payments, configured additional charges, lease dates, maintenance status/history, resident-visible documents, messages and alerts. For questions about the lease itself—including early termination, notice, renewal, guests, pets, fees, responsibilities, entry, utilities or contractual rights/obligations—answer from VERIFIED_FACTS.lease_document_text and structured lease fields only. Identify the source document when lease text supports the answer. If the uploaded lease does not contain enough information, say that clearly instead of supplying generic lease terms. Never invent lease clauses, fees, legal rights, deadlines or promises. You may say legal requirements can override a lease, but do not assert jurisdiction-specific law unless supplied in VERIFIED_FACTS. For maintenance infer category, area, issue type and urgency when supported. Ask one short follow-up only when needed. If immediate fire, gas, electrical-fire, severe flooding-near-electricity, or personal danger is described or clearly visible, tell the resident to contact appropriate emergency services first. Return ONLY JSON with: action ("ask"|"answer"|"create_maintenance"|"send_message"), reply, title, description, category, area, issue_type, priority ("routine"|"high"|"emergency"), entry_permission ("ask_first"|"permission_granted"|"resident_present"), message_body, ai_summary.`;

async function callGroq(model,content){
 let last='';
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch(GROQ_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model,messages:[{role:'system',content:instruction},{role:'user',content}],temperature:.1,response_format:{type:'json_object'}})});
  if(r.ok){const j=await r.json();return JSON.parse(String(j.choices?.[0]?.message?.content||'{}').replace(/^```json\s*|\s*```$/g,''))}
  last=`${r.status}`;if(r.status!==429)break;
  await sleep(Math.min(2500,Number(r.headers.get('retry-after')||0)*1000||500*(attempt+1)))
 }
 throw new Error(`AI provider temporarily unavailable (${last||'request failed'})`)
}

async function conciergeAI({message,history,photos,facts}){
 if(!process.env.GROQ_API_KEY)throw new Error('AI provider is not configured');
 const base=`VERIFIED_FACTS FOR THIS AUTHENTICATED RESIDENT ONLY: ${JSON.stringify(facts)}\nConversation history: ${JSON.stringify((history||[]).slice(-10))}\nResident message: ${message||''}`;
 const content=[{type:'text',text:base}];
 for(const p of (photos||[]).slice(0,3)){if(typeof p?.data==='string'&&p.data.startsWith('data:image/'))content.push({type:'image_url',image_url:{url:p.data}})}
 try{return await callGroq(photos?.length?VISION_MODEL:TEXT_MODEL,photos?.length?content:base)}
 catch(e){
  if(photos?.length){
   console.error('resident-vision-fallback',e?.message||e);
   return await callGroq(TEXT_MODEL,`${base}\nA photo was attached but vision capacity is temporarily unavailable. Do not claim to see it. If the text does not identify the problem, ask for one short description.`)
  }
  throw e
 }
}

express.application.listen=function(...args){
 if(!this.__rentpilotResidentConcierge){
  this.__rentpilotResidentConcierge=true;
  this.post('/api/resident/concierge',async(req,res)=>{
   try{
    const ctx=await auth(req,res);if(!ctx)return;
    const{message='',history=[],photos=[]}=req.body||{};
    if(!String(message).trim()&&!photos.length)return res.status(400).json({error:'Tell NOVA what you need or attach a photo.'});
    const facts=await residentFacts(ctx),result=await conciergeAI({message,history,photos,facts});
    if(result.action==='send_message'){
     const body=String(result.message_body||result.description||message).trim();
     if(!body)return res.status(422).json({error:'NOVA could not determine the message to send.'});
     const{error}=await ctx.client.from('messages').insert({owner_id:ctx.tenant.owner_id,tenant_id:ctx.tenant.id,lease_id:ctx.lease.id,direction:'inbound',channel:'app',body,category:'resident_ai_concierge',ai_summary:result.ai_summary||'Resident asked NOVA to send this message.'});
     if(error)throw error;
     result.reply=result.reply||'Done. I sent that to your property manager in RentPilot.';
     result.sent=true
    }
    return res.json({...result,resident:{id:ctx.tenant.id,name:ctx.tenant.full_name},leaseId:ctx.lease.id})
   }catch(e){
    console.error('resident-concierge',e);
    return res.status(503).json({error:e?.message||'NOVA is temporarily unavailable. Please try again.'})
   }
  });
  this.post('/api/resident/maintenance/:id/cancel',async(req,res)=>{
   try{
    const ctx=await auth(req,res);if(!ctx)return;const id=req.params.id;
    const{data:item,error:readError}=await ctx.client.from('maintenance_requests').select('id,status,tenant_id,owner_id').eq('id',id).eq('tenant_id',ctx.tenant.id).maybeSingle();
    if(readError)throw readError;
    if(!item)return res.status(404).json({error:'Maintenance request not found'});
    if(['completed','cancelled'].includes(item.status))return res.status(409).json({error:'This request is already closed'});
    const now=new Date().toISOString();
    const{error}=await ctx.client.from('maintenance_requests').update({status:'cancelled',updated_at:now}).eq('id',id).eq('tenant_id',ctx.tenant.id);
    if(error)throw error;
    await ctx.client.from('maintenance_events').insert({maintenance_request_id:id,owner_id:ctx.tenant.owner_id,event_type:'resident_cancelled',status:'cancelled',note:'Resident cancelled this maintenance request.'});
    return res.json({ok:true,id,status:'cancelled'})
   }catch(e){
    console.error('resident-maintenance-cancel',e);
    return res.status(500).json({error:e?.message||'Unable to cancel request'})
   }
  })
 }
 return originalListen.apply(this,args)
};
