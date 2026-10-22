import express from 'express';
import {createClient} from '@supabase/supabase-js';

const originalListen=express.application.listen;
express.application.listen=function(...args){
  if(!this.__rentpilotLeaseVision){
    this.__rentpilotLeaseVision=true;
    this.post('/api/lease/vision',async(req,res)=>{
      try{
        const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
        if(!token)return res.status(401).json({error:'Authentication required'});
        const url=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
        const key=process.env.SUPABASE_PUBLISHABLE_KEY;
        if(!key)return res.status(503).json({error:'Authentication service is not configured'});
        const auth=createClient(url,key,{auth:{persistSession:false}});
        const {data,error}=await auth.auth.getUser(token);
        if(error||!data.user)return res.status(401).json({error:'Invalid session'});
        const pages=Array.isArray(req.body?.pages)?req.body.pages.slice(0,3).filter(x=>typeof x==='string'&&x.startsWith('data:image/')):[];
        if(!pages.length)return res.status(400).json({error:'Lease page images are required'});
        if(!process.env.GROQ_API_KEY)return res.status(503).json({error:'Lease vision is not configured'});
        const prompt=`Read these lease pages visually and preserve the relationship between labels and filled values. Return ONLY JSON with exactly these string keys: full_name, occupants, property_name, address_line1, city, state, postal_code, unit_label, monthly_rent, start_date, end_date, due_day. full_name is ONLY people explicitly labeled Resident/Residents, Tenant/Tenants, or Lessee(s). occupants is ONLY people explicitly labeled Occupant/Occupants/Authorized Occupants. Never swap those roles. Ignore blank underline placeholders. unit_label is Apartment No./Unit No. and must preserve leading zeroes. monthly_rent is recurring Monthly Base Rent/Base Rent only, numbers only, never deposit, prorated rent, fees or concessions. due_day is the day recurring rent is due, not a late-fee day. Dates must be YYYY-MM-DD. Use an empty string when a field is not visible. Never infer.`;
        const content=[{type:'text',text:prompt},...pages.map(p=>({type:'image_url',image_url:{url:p}}))];
        const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model:'qwen/qwen3.8-27b',messages:[{role:'user',content}],temperature:0,reasoning_effort:'none',response_format:{type:'json_object'},max_completion_tokens:1200})});
        if(!response.ok)return res.status(502).json({error:`Lease vision provider error ${response.status}`});
        const payload=await response.json();
        const text=payload.choices?.[0]?.message?.content||'{}';
        let fields;try{fields=JSON.parse(text)}catch{return res.status(502).json({error:'Lease vision returned invalid data'})}
        return res.json({fields,provider:'groq',model:'qwen/qwen3.8-27b'});
      }catch(e){return res.status(500).json({error:e?.message||'Unable to analyze lease visually'})}
    });
  }
  return originalListen.apply(this,args);
};
