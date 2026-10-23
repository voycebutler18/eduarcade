import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {installPayPalSubscriptionRoutes} from './paypal-subscriptions.mjs';

const originalListen=express.application.listen;
let installed=false;
express.application.listen=function(...args){
  if(!installed){
    installed=true;
    const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
    const KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_HKpnoybJTD0ILSYMUYNXWA_Jy25MuzT';
    const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;
    async function requireAuth(req,res,next){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return res.status(401).json({error:'Authentication required'});const client=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false}});const{data,error}=await client.auth.getUser(token);if(error||!data.user)return res.status(401).json({error:'Invalid session'});req.user=data.user;next()}
    installPayPalSubscriptionRoutes(this,{admin,requireAuth});
    console.log('RentPilot PayPal subscription routes installed');
  }
  return originalListen.apply(this,args);
};
