import {useEffect,useState} from "react";
import {supabase} from "../lib/supabase";
import {ResidentAIConcierge} from "./ResidentAIConcierge";

export function ResidentConciergeLauncher(){
 const[resident,setResident]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{let alive=true;async function detect(){const{data:{session}}=await supabase.auth.getSession();if(!session){if(alive)setResident(false);return}const{data}=await supabase.from("resident_account_claims").select("tenant_id").eq("user_id",session.user.id).eq("active",true).maybeSingle();if(alive)setResident(Boolean(data?.tenant_id))}detect();const{data}=supabase.auth.onAuthStateChange(()=>detect());return()=>{alive=false;data.subscription.unsubscribe()}},[]);
 if(!resident)return null;
 const launchStyle={position:"fixed" as const,right:22,bottom:22,zIndex:70,border:0,borderRadius:18,padding:"13px 17px",background:"#173f2a",color:"white",boxShadow:"0 14px 38px #10261a40",display:"flex",alignItems:"center",gap:11,cursor:"pointer",textAlign:"left" as const};
 const backdrop={position:"fixed" as const,inset:0,zIndex:90,background:"#0c1710b8",display:"grid",placeItems:"center",padding:18};
 const modal={width:"min(680px,100%)",maxHeight:"92vh",overflowY:"auto" as const,background:"#f4f7f4",borderRadius:22,padding:18,boxShadow:"0 25px 80px #0006"};
 return <><button type="button" style={launchStyle} onClick={()=>setOpen(true)} aria-label="Open RentPilot AI maintenance concierge"><span style={{fontSize:22,color:"#dfff86"}}>✦</span><div><b style={{display:"block"}}>Need something fixed?</b><small style={{display:"block",color:"#bed0c2",marginTop:2}}>Tell RentPilot AI</small></div></button>{open&&<div style={backdrop} onMouseDown={()=>setOpen(false)}><div style={modal} onMouseDown={e=>e.stopPropagation()}><div className="section-head"><div><p className="eyebrow">Fast maintenance help</p><h2 style={{margin:"4px 0 0"}}>RentPilot AI</h2></div><button type="button" className="close-btn" onClick={()=>setOpen(false)}>×</button></div><ResidentAIConcierge onCreated={()=>setOpen(false)}/><details style={{marginTop:12,padding:"12px 14px",background:"white",border:"1px solid #dfe7df",borderRadius:12}}><summary style={{cursor:"pointer",fontWeight:800}}>Prefer the manual form?</summary><p className="muted" style={{marginBottom:0}}>You can still use the maintenance form in your resident portal. The AI concierge is simply the faster option.</p></details></div></div>}</>
}
