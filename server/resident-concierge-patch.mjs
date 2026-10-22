import express from 'express';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_HKpnoybJTD0ILSYMUYNXWA_Jy25MuzT';
const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';
const VISION_MODEL=process.env.GROQ_VISION_MODEL||'qwen/qwen3.8-27b';

async function auth(req,res){
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token){res.status(401).json({error:'Authentication required'});return null}
 const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const{data,error}=await client.auth.getUser(token);
 if(error||!data.user){res.status(401).json({error:'Invalid session'});return null}
 const{data:tenant}=await client.from('tenants').select('id,owner_id,full_name,user_id,email').eq('user_id',data.user.id).maybeSingle();
 if(!tenant){res.status(403).json({error:'Resident account required'});return null}
 const{data:lease}=await client.from('leases').select('id,owner_id,unit_id,monthly_rent,due_day,start_date,end_date,status,units(property_id,unit_label,properties(name,address_line1,city,state,postal_code))').eq('tenant_id',tenant.id).eq('status','active').maybeSingle();
 if(!lease){res.status(409).json({error:'No active lease is linked to this resident'});return null}
 return{user:data.user,tenant,lease,client};
}

async function residentFacts(ctx){
 const[c,p,docs,reqs,msgs]=await Promise.all([
  ctx.client.from('rent_charges').select('id,amount,due_date,status,description,breakdown').eq('lease_id',ctx.lease.id).order('due_date',{ascending:false}).limit(24),
  ctx.client.from('payments').select('rent_charge_id,amount,paid_at,method').eq('lease_id',ctx.lease.id).order('paid_at',{ascending:false}).limit(24),
  ctx.client.from('lease_documents').select('id,name,document_type,created_at,visible_to_resident').eq('lease_id',ctx.lease.id).eq('visible_to_resident',true).order('created_at',{ascending:false}).limit(20),
  ctx.client.from('maintenance_requests').select('id,title,description,priority,status,created_at').eq('lease_id',ctx.lease.id).order('created_at',{ascending:false}).limit(12),
  ctx.client.from('messages').select('id,direction,body,created_at,read_at,category').eq('tenant_id',ctx.tenant.id).order('created_at',{ascending:false}).limit(12)
 ]);
 const payments=p.data||[],charges=c.data||[];
 const paidByCharge={};for(const x of payments){if(x.rent_charge_id)paidByCharge[x.rent_charge_id]=(paidByCharge[x.rent_charge_id]||0)+Number(x.amount||0)}
 const ledger=charges.map(x=>({...x,paid:Number(paidByCharge[x.id]||0),remaining:Math.max(0,Number(x.amount||0)-Number(paidByCharge[x.id]||0))}));
 return{resident:{name:ctx.tenant.full_name},lease:ctx.lease,ledger,payments,documents:docs.data||[],maintenance:reqs.data||[],recent_messages:msgs.data||[],current_balance:ledger.reduce((s,x)=>s+x.remaining,0)};
}

async function conciergeAI({message,history,photos,facts}){
 if(!process.env.GROQ_API_KEY)throw new Error('Groq is not configured');
 const instruction=`You are RentPilot Resident AI Concierge, the resident's primary interface to RentPilot. The resident should be able to talk naturally instead of navigating forms.
You may: answer questions using ONLY VERIFIED_FACTS; help explain the resident's recorded balance, charges, payments, lease dates, base rent, due day, resident-visible document list, maintenance history, and recent RentPilot messages; collect a maintenance problem conversationally; or send a normal message to the property manager.
For maintenance: ask only ONE short follow-up at a time and only when genuinely needed for a useful work order. Infer category/trade/priority when supported. Never invent facts. If there is an immediate safety risk such as active fire, suspected gas leak, sparking/electrical fire, severe flooding near electricity, or a person in danger, tell the resident to contact local emergency services or the appropriate emergency utility first.
For property-manager messages: when the resident clearly asks you to tell/message/notify the landlord or property manager, return send_message with the exact concise message body. Do not require them to retype it.
For account/lease questions: answer from VERIFIED_FACTS. Contracted rent is not proof of payment. A charge is unpaid only when its recorded remaining balance is above zero. If the requested fact is not present, say you do not have that information instead of guessing.
Never invent lease clauses, late fees, legal rights, eviction rules, deposit rules, market information, or promises from the property manager. Do not create legal notices or make legal determinations.
Return ONLY JSON with: action ("ask"|"answer"|"create_maintenance"|"send_message"), reply, title, description, category, area, issue_type, priority ("routine"|"high"|"emergency"), entry_permission ("ask_first"|"permission_granted"|"resident_present"), message_body, ai_summary.`;
 const content=[{type:'text',text:`VERIFIED_FACTS: ${JSON.stringify(facts)}\nConversation history: ${JSON.stringify((history||[]).slice(-10))}\nResident message: ${message||''}`}];
 for(const p of (photos||[]).slice(0,3)){if(typeof p?.data==='string'&&p.data.startsWith('data:image/'))content.push({type:'image_url',image_url:{url:p.data}})}
 const r=await fetch(GROQ_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model:VISION_MODEL,messages:[{role:'system',content:instruction},{role:'user',content}],temperature:.1,response_format:{type:'json_object'}})});
 if(!r.ok)throw new Error(`Concierge AI error ${r.status}`);
 const j=await r.json();const raw=j.choices?.[0]?.message?.content||'{}';return JSON.parse(raw.replace(/^```json\s*|\s*```$/g,''));
}

express.application.listen=function(...args){
 if(!this.__rentpilotResidentConcierge){
  this.__rentpilotResidentConcierge=true;
  this.post('/api/resident/concierge',async(req,res)=>{
   try{
    const ctx=await auth(req,res);if(!ctx)return;
    const{message='',history=[],photos=[]}=req.body||{};
    if(!String(message).trim()&&!photos.length)return res.status(400).json({error:'Tell RentPilot what you need or attach a photo.'});
    const facts=await residentFacts(ctx);
    const result=await conciergeAI({message,history,photos,facts});
    if(result.action==='send_message'){
     const body=String(result.message_body||result.description||message).trim();
     if(!body)return res.status(422).json({error:'RentPilot could not determine the message to send.'});
     const{error}=await ctx.client.from('messages').insert({owner_id:ctx.tenant.owner_id,tenant_id:ctx.tenant.id,lease_id:ctx.lease.id,direction:'inbound',channel:'app',body,category:'resident_ai_concierge',ai_summary:result.ai_summary||'Resident asked RentPilot AI to send this message.'});
     if(error)throw error;
     result.reply=result.reply||'Done. I sent that to your property manager in RentPilot.';
     result.sent=true;
    }
    return res.json({...result,resident:{id:ctx.tenant.id,name:ctx.tenant.full_name},leaseId:ctx.lease.id});
   }catch(e){console.error('resident-concierge',e);return res.status(503).json({error:e?.message||'Resident AI is unavailable'})}
  });
 }
 return originalListen.apply(this,args);
};
