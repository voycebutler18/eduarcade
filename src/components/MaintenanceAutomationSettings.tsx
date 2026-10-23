import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Settings={
 routing_mode:'team_first'|'team_only'|'vendors_first'|'vendors_only'|'both';
 service_radius_miles:number;
 vendor_recommendations_enabled:boolean;
 show_vendor_recommendations_with_team:boolean;
 approval_threshold_amount:number;
 minimum_vendor_rating:number;
 emergency_team_first:boolean;
 emergency_notify_landlord:boolean;
 emergency_requires_approval:boolean;
};
const defaults:Settings={routing_mode:'team_first',service_radius_miles:15,vendor_recommendations_enabled:true,show_vendor_recommendations_with_team:false,approval_threshold_amount:250,minimum_vendor_rating:3,emergency_team_first:true,emergency_notify_landlord:true,emergency_requires_approval:true};

export function MaintenanceAutomationSettings(){
 const[eligible,setEligible]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[settings,setSettings]=useState<Settings>(defaults),[ownerId,setOwnerId]=useState('');
 useEffect(()=>{let alive=true;(async()=>{const{data:{user}}=await supabase.auth.getUser();if(!user||!alive)return;const{data:owned}=await supabase.from('properties').select('id').eq('owner_id',user.id).limit(1);if(!alive||!owned?.length)return;setEligible(true);setOwnerId(user.id);const{data}=await supabase.from('maintenance_routing_settings').select('routing_mode,service_radius_miles,vendor_recommendations_enabled,show_vendor_recommendations_with_team,approval_threshold_amount,minimum_vendor_rating,emergency_team_first,emergency_notify_landlord,emergency_requires_approval').eq('owner_id',user.id).maybeSingle();if(data&&alive)setSettings({...defaults,...data,approval_threshold_amount:Number(data.approval_threshold_amount??250),minimum_vendor_rating:Number(data.minimum_vendor_rating??3)} as Settings)})();return()=>{alive=false}},[]);
 if(!eligible)return null;
 async function save(){if(!ownerId)return;setBusy(true);setMessage('');const{error}=await supabase.from('maintenance_routing_settings').upsert({owner_id:ownerId,...settings,updated_at:new Date().toISOString()},{onConflict:'owner_id'});setBusy(false);setMessage(error?error.message:'Automation rules saved. New work orders will use these settings.');}
 const set=<K extends keyof Settings>(key:K,value:Settings[K])=>setSettings(s=>({...s,[key]:value}));
 return <>
  <button type="button" className="ghost-btn" onClick={()=>setOpen(true)} style={{position:'fixed',right:24,bottom:88,zIndex:45,boxShadow:'0 8px 28px rgba(0,0,0,.16)',background:'#fff'}}>Maintenance automation</button>
  {open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)} style={{zIndex:80}}><div className="modal" onMouseDown={e=>e.stopPropagation()} style={{maxWidth:760,maxHeight:'86vh',overflow:'auto'}}><div className="section-head"><div><p className="eyebrow">NOVA routing rules</p><h2>Maintenance automation</h2><p className="muted">Choose how Mendlyx handles new tenant work orders after photo triage. Vendor dispatch and spending still require human approval.</p></div><button className="close-btn" onClick={()=>setOpen(false)}>×</button></div>
   <div className="auth-form">
    <label>Routing strategy<select value={settings.routing_mode} onChange={e=>set('routing_mode',e.target.value as Settings['routing_mode'])}><option value="team_first">My maintenance team first, vendors as fallback</option><option value="team_only">My maintenance team only</option><option value="vendors_first">Outside vendor recommendations first, team as fallback</option><option value="vendors_only">Outside vendor recommendations only</option><option value="both">Route to my team and also show outside vendors</option></select></label>
    <div className="form-row"><label>Vendor search radius (miles)<input type="number" min="1" max="100" value={settings.service_radius_miles} onChange={e=>set('service_radius_miles',Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></label><label>Repair approval threshold ($)<input type="number" min="0" step="25" value={settings.approval_threshold_amount} onChange={e=>set('approval_threshold_amount',Math.max(0,Number(e.target.value)||0))}/><small>Mendlyx flags costs above this amount. It does not authorize spending automatically.</small></label></div>
    <div className="form-row"><label>Minimum vendor rating when a real rating source exists<input type="number" min="0" max="5" step="0.1" value={settings.minimum_vendor_rating} onChange={e=>set('minimum_vendor_rating',Math.max(0,Math.min(5,Number(e.target.value)||0)))}/><small>Unrated open-data vendors remain clearly labeled instead of receiving a made-up score.</small></label></div>
    <label className="check-row"><input type="checkbox" checked={settings.vendor_recommendations_enabled} onChange={e=>set('vendor_recommendations_enabled',e.target.checked)}/>Automatically build nearby vendor recommendations when routing rules call for them</label>
    <label className="check-row"><input type="checkbox" checked={settings.show_vendor_recommendations_with_team} onChange={e=>set('show_vendor_recommendations_with_team',e.target.checked)}/>Also show outside vendor options when an internal maintenance team receives the job</label>
    <hr style={{border:0,borderTop:'1px solid #e4e8e5',width:'100%'}}/>
    <h3>Emergency rules</h3>
    <label className="check-row"><input type="checkbox" checked={settings.emergency_team_first} onChange={e=>set('emergency_team_first',e.target.checked)}/>For emergency-classified requests, prioritize my active maintenance team when available</label>
    <label className="check-row"><input type="checkbox" checked={settings.emergency_notify_landlord} onChange={e=>set('emergency_notify_landlord',e.target.checked)}/>Flag emergency requests for landlord attention in the activity history</label>
    <label className="check-row"><input type="checkbox" checked={settings.emergency_requires_approval} onChange={e=>set('emergency_requires_approval',e.target.checked)}/>Require landlord approval before consequential emergency vendor dispatch or repair authorization</label>
    {message&&<p className="form-message">{message}</p>}
    <button className="primary-btn" disabled={busy} onClick={save}>{busy?'Saving...':'Save automation rules'}</button>
   </div>
  </div></div>}
 </>;
}
