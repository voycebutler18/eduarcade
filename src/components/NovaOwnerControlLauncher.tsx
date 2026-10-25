import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {NovaMissionControl} from './NovaMissionControl';
import {NovaAutopilotSetup} from './NovaAutopilotSetup';
import {NovaExceptionInbox} from './NovaExceptionInbox';
import {NovaOperationsConsole} from './NovaOperationsConsole';
import {NovaInspectionConsole} from './NovaInspectionConsole';
import {NovaResidentConversations} from './NovaResidentConversations';
import type {Session} from '@supabase/supabase-js';

export function NovaOwnerControlLauncher(){
 const[session,setSession]=useState<Session|null>(null),[eligible,setEligible]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{let alive=true;(async()=>{const{data}=await supabase.auth.getSession();const s=data.session;if(!alive)return;setSession(s);if(!s)return;const{data:owned}=await supabase.from('properties').select('id').eq('owner_id',s.user.id).limit(1);if(alive)setEligible(Boolean(owned?.length))})();return()=>{alive=false}},[]);
 if(!eligible||!session)return null;
 return <><button type="button" className="ghost-btn" onClick={()=>setOpen(true)} style={{position:'fixed',right:24,bottom:144,zIndex:45,boxShadow:'0 8px 28px rgba(0,0,0,.16)',background:'#fff'}}>NOVA Mission Control</button>{open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)} style={{zIndex:95}}><div className="modal" onMouseDown={e=>e.stopPropagation()} style={{maxWidth:1180,width:'min(1180px,96vw)',maxHeight:'92vh',overflow:'auto'}}><div className="section-head"><div><p className="eyebrow">Autonomous property manager</p><h2>NOVA operations</h2><p className="muted">Mission Control watches the system. Below it, set standing rules and review only the exceptions NOVA cannot safely handle.</p></div><button className="close-btn" onClick={()=>setOpen(false)}>×</button></div><NovaMissionControl session={session}/><NovaAutopilotSetup session={session}/><NovaExceptionInbox session={session}/><NovaResidentConversations session={session}/><NovaInspectionConsole session={session}/><NovaOperationsConsole session={session}/></div></div>}</>
}
