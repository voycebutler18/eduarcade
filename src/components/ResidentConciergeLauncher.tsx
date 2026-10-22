import {useEffect,useState} from "react";
import {supabase} from "../lib/supabase";
import {ResidentAIConcierge} from "./ResidentAIConcierge";

export function ResidentConciergeLauncher(){
 const[resident,setResident]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{let alive=true;async function detect(){const{data:{session}}=await supabase.auth.getSession();if(!session){if(alive)setResident(false);return}const{data}=await supabase.from("resident_account_claims").select("tenant_id").eq("user_id",session.user.id).eq("active",true).maybeSingle();if(alive)setResident(Boolean(data?.tenant_id))}detect();const{data}=supabase.auth.onAuthStateChange(()=>detect());return()=>{alive=false;data.subscription.unsubscribe()}},[]);
 if(!resident)return null;
 return <><button type="button" className="resident-ai-launcher" onClick={()=>setOpen(true)} aria-label="Open RentPilot AI maintenance concierge"><span>✦</span><div><b>Need something fixed?</b><small>Tell RentPilot AI</small></div></button>{open&&<div className="resident-ai-backdrop" onMouseDown={()=>setOpen(false)}><div className="resident-ai-modal" onMouseDown={e=>e.stopPropagation()}><div className="resident-ai-modal-head"><div><p className="eyebrow">Fast maintenance help</p><h2>RentPilot AI</h2></div><button type="button" className="close-btn" onClick={()=>setOpen(false)}>×</button></div><ResidentAIConcierge onCreated={()=>setOpen(false)}/><details className="resident-ai-manual-note"><summary>Prefer the manual form?</summary><p>You can still use the maintenance form in your resident portal. The AI concierge is simply the faster option.</p></details></div></div>}</>
}
