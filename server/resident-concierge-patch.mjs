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
 const{data:tenant}=await client.from('tenants').select('id,owner_id,full_name,user_id').eq('user_id',data.user.id).maybeSingle();
 if(!tenant){res.status(403).json({error:'Resident account required'});return null}
 const{data:lease}=await client.from('leases').select('id,unit_id,status,units(property_id,unit_label)').eq('tenant_id',tenant.id).eq('status','active').maybeSingle();
 if(!lease){res.status(409).json({error:'No active lease is linked to this resident'});return null}
 return{user:data.user,tenant,lease,client};
}

async function conciergeAI({message,history,photos}){
 if(!process.env.GROQ_API_KEY)throw new Error('Groq is not configured');
 const instruction=`You are RentPilot Resident AI Concierge. Your job is to make maintenance reporting conversational and nearly effortless. Determine whether the resident is trying to report a maintenance problem. Ask only ONE short follow-up question at a time, and only when a fact is genuinely needed to create a useful work order. Never ask the resident to choose a maintenance category, trade, or priority if you can infer it. Never invent facts. If there is an immediate safety risk such as active fire, suspected gas leak, sparking/electrical fire, severe flooding near electricity, or a person in danger, tell the resident to contact local emergency services or the appropriate emergency utility first. Return ONLY JSON with: action ("ask" or "create_maintenance"), reply, title, description, category, area, issue_type, priority ("routine"|"high"|"emergency"), entry_permission ("ask_first"|"permission_granted"|"resident_present"), ai_summary. When enough information exists to make a useful work order, use create_maintenance. A photo can provide missing visual details. Do not diagnose beyond what the resident or image supports.`;
 const content=[{type:'text',text:`Conversation history: ${JSON.stringify((history||[]).slice(-8))}\nResident message: ${message||''}`}];
 for(const p of (photos||[]).slice(0,3)){if(typeof p?.data==='string'&&p.data.startsWith('data:image/'))content.push({type:'image_url',image_url:{url:p.data}})}
 const r=await fetch(GROQ_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model:VISION_MODEL,messages:[{role:'system',content:instruction},{role:'user',content}],temperature:.1,response_format:{type:'json_object'}})});
 if(!r.ok)throw new Error(`Concierge AI error ${r.status}`);
 const j=await r.json();
 const raw=j.choices?.[0]?.message?.content||'{}';
 return JSON.parse(raw.replace(/^```json\s*|\s*```$/g,''));
}

express.application.listen=function(...args){
 if(!this.__rentpilotResidentConcierge){
  this.__rentpilotResidentConcierge=true;
  this.post('/api/resident/concierge',async(req,res)=>{
   try{
    const ctx=await auth(req,res);if(!ctx)return;
    const{message='',history=[],photos=[]}=req.body||{};
    if(!String(message).trim()&&!photos.length)return res.status(400).json({error:'Tell RentPilot what is wrong or attach a photo.'});
    const result=await conciergeAI({message,history,photos});
    return res.json({...result,resident:{id:ctx.tenant.id,name:ctx.tenant.full_name},leaseId:ctx.lease.id});
   }catch(e){console.error('resident-concierge',e);return res.status(503).json({error:e?.message||'Resident AI is unavailable'})}
  });
 }
 return originalListen.apply(this,args);
};
