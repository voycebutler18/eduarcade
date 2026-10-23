import {useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";

type Policy={automation_policy_approved_at:string|null;automatic_email_enabled:boolean;autopilot_enabled:boolean};

export function MoneyChaserAuthorization({session}:{session:Session}){
 const[policy,setPolicy]=useState<Policy>({automation_policy_approved_at:null,automatic_email_enabled:false,autopilot_enabled:true});
 const[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function load(){const{data,error}=await supabase.from("money_chaser_profiles").select("automation_policy_approved_at,automatic_email_enabled,autopilot_enabled").eq("owner_id",session.user.id).maybeSingle();if(error)setError(error.message);else if(data)setPolicy(data as Policy)}
 useEffect(()=>{load()},[]);
 async function approve(){setBusy(true);setError("");const now=new Date().toISOString();const{error}=await supabase.from("money_chaser_profiles").upsert({owner_id:session.user.id,autopilot_enabled:true,automatic_email_enabled:true,automation_policy_approved_at:now,automation_policy_version:"v1",updated_at:now},{onConflict:"owner_id"});setBusy(false);if(error)return setError(error.message);await load()}
 const active=Boolean(policy.automation_policy_approved_at&&policy.automatic_email_enabled&&policy.autopilot_enabled);
 return <section className="panel-card" style={{marginBottom:16}}>
  <div className="section-head"><div><p className="eyebrow">Standing authorization</p><h2>{active?"Money Chaser automation approved":"Approve Money Chaser once"}</h2><p className="muted">This single account-level approval applies to every verified tenant and customer balance under this owner. You are not asked to approve individual people or individual routine reminders.</p></div><span className={active?"pill":"pill warn"}>{active?"APPROVED":"NOT APPROVED"}</span></div>
  {error&&<p className="form-message error">{error}</p>}
  {!active&&<><div className="record-list"><article><div><b>What this authorizes</b><small>Money Chaser may process verified overdue balances using the account rules you set, prepare routine factual reminders, track payment promises, stop on payment, and pause disputed records.</small></div></article><article><div><b>Applies to everyone under this account</b><small>Current and future tenants, customers and clients use the same approved Money Chaser policy. No per-person approval is required.</small></div></article></div><button className="primary-btn" disabled={busy} onClick={approve}>{busy?"Approving...":"Approve Money Chaser automation"}</button></>}
  {active&&<p className="form-message">Approved {new Date(policy.automation_policy_approved_at as string).toLocaleString()}. This authorization covers the whole account.</p>}
 </section>
}
