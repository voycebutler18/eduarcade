import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
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
 return <><button type="button" className="ghost-btn" onClick={()=>setOpen(true)} style={{position:'fixed',right:24,bottom:144,zIndex:45,boxShadow:'0 8px 28px rgba(0,0,0,.16)',background:'#fff'}}>NOVA operations</button>{open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)} style={{zIndex:95}}><div className="modal" onMouseDown={e=>e.stopPropagation()} style={{maxWidth:1120,width:'min(1120px,96vw)',maxHeight:'90vh',overflow:'auto'}}><div className="section-head"><div><p className="eyebrow">Autonomous property manager</p><h2>NOVA operations</h2><p className="muted">Set standing rules once. Review only the exceptions NOVA cannot handle inside those rules.</p></div><button className="close-btn" onClick={()=>setOpen(false)}>×</button></div><NovaAutopilotSetup session={session}/><NovaExceptionInbox session={session}/><NovaResidentConversations session={session}/><NovaInspectionConsole session={session}/><NovaOperationsConsole session={session}/></div></div>}</>
}
