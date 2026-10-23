import {FormEvent,useEffect,useMemo,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";

type Profile={business_name:string|null;vertical_code:string;debtor_label:string;receivable_label:string;context_label:string;autopilot_enabled:boolean;soft_nudge_days:number;firm_notice_days:number;escalation_days:number};
type Debtor={id:string;display_name:string;email:string|null;phone:string|null;company_name:string|null;source:string};
type Receivable={id:string;debtor_id:string;reference:string|null;description:string|null;amount_total:number;amount_outstanding:number;due_date:string;state:string;risk_score:number;source:string;created_at:string};

const profileDefaults:Profile={business_name:null,vertical_code:"general",debtor_label:"Customer",receivable_label:"Invoice",context_label:"Job",autopilot_enabled:true,soft_nudge_days:1,firm_notice_days:7,escalation_days:21};
const presets:Record<string,Pick<Profile,"debtor_label"|"receivable_label"|"context_label">>={
 general:{debtor_label:"Customer",receivable_label:"Invoice",context_label:"Job"},
 contractor:{debtor_label:"Customer",receivable_label:"Invoice",context_label:"Job"},
 hvac:{debtor_label:"Customer",receivable_label:"Invoice",context_label:"Service call"},
 agency:{debtor_label:"Client",receivable_label:"Invoice",context_label:"Project"},
 consulting:{debtor_label:"Client",receivable_label:"Invoice",context_label:"Engagement"},
 trucking:{debtor_label:"Customer",receivable_label:"Invoice",context_label:"Load"},
 cleaning:{debtor_label:"Customer",receivable_label:"Invoice",context_label:"Service"},
 property_management:{debtor_label:"Resident",receivable_label:"Rent charge",context_label:"Lease"}
};

export function UniversalBusinessMoneyChaser({session}:{session:Session}){
 const[profile,setProfile]=useState<Profile>(profileDefaults),[debtors,setDebtors]=useState<Debtor[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[filter,setFilter]=useState("all");
 const[debtorForm,setDebtorForm]=useState({display_name:"",company_name:"",email:"",phone:""});
 const[itemForm,setItemForm]=useState({debtor_id:"",reference:"",description:"",amount:"",due_date:""});

 async function load(){
  const[p,d,r]=await Promise.all([
   supabase.from("money_chaser_profiles").select("business_name,vertical_code,debtor_label,receivable_label,context_label,autopilot_enabled,soft_nudge_days,firm_notice_days,escalation_days").eq("owner_id",session.user.id).maybeSingle(),
   supabase.from("money_chaser_debtors").select("id,display_name,email,phone,company_name,source").eq("owner_id",session.user.id).neq("source","mendlyx_rent").order("display_name"),
   supabase.from("money_chaser_receivables").select("id,debtor_id,reference,description,amount_total,amount_outstanding,due_date,state,risk_score,source,created_at").eq("owner_id",session.user.id).neq("source","mendlyx_rent").order("due_date",{ascending:true})
  ]);
  if(p.data)setProfile({...profileDefaults,...p.data} as Profile);
  setDebtors((d.data||[])as Debtor[]);setReceivables((r.data||[])as Receivable[]);
  setError(p.error?.message||d.error?.message||r.error?.message||"");
 }
 useEffect(()=>{load()},[]);

 const metrics=useMemo(()=>{
  const outstanding=receivables.reduce((s,r)=>s+Number(r.amount_outstanding||0),0);
  const paidDown=receivables.reduce((s,r)=>s+Math.max(0,Number(r.amount_total||0)-Number(r.amount_outstanding||0)),0);
  const promised=receivables.filter(r=>r.state==="promise_tracked").reduce((s,r)=>s+Number(r.amount_outstanding||0),0);
  const chasing=receivables.filter(r=>["soft_nudge","firm_notice"].includes(r.state)).reduce((s,r)=>s+Number(r.amount_outstanding||0),0);
  const attention=receivables.filter(r=>["disputed","escalated"].includes(r.state)).reduce((s,r)=>s+Number(r.amount_outstanding||0),0);
  return{outstanding,paidDown,promised,chasing,attention};
 },[receivables]);

 async function saveProfile(){setBusy(true);setError("");const{error}=await supabase.from("money_chaser_profiles").upsert({owner_id:session.user.id,...profile,updated_at:new Date().toISOString()},{onConflict:"owner_id"});setBusy(false);if(error)setError(error.message);else setNotice("Business Money Chaser settings saved.")}
 function setVertical(vertical:string){const preset=presets[vertical]||presets.general;setProfile(p=>({...p,vertical_code:vertical,...preset}))}

 async function addDebtor(e:FormEvent){e.preventDefault();setError("");const{error}=await supabase.from("money_chaser_debtors").insert({owner_id:session.user.id,display_name:debtorForm.display_name,company_name:debtorForm.company_name||null,email:debtorForm.email||null,phone:debtorForm.phone||null,source:"manual"});if(error)return setError(error.message);setDebtorForm({display_name:"",company_name:"",email:"",phone:""});await load()}
 async function addReceivable(e:FormEvent){e.preventDefault();setError("");const amount=Number(itemForm.amount);const{error}=await supabase.from("money_chaser_receivables").insert({owner_id:session.user.id,debtor_id:itemForm.debtor_id,reference:itemForm.reference||null,description:itemForm.description||null,amount_total:amount,amount_outstanding:amount,due_date:itemForm.due_date,state:"current",source:"manual"});if(error)return setError(error.message);setItemForm({debtor_id:"",reference:"",description:"",amount:"",due_date:""});await runEngine()}
 async function runEngine(){setBusy(true);setError("");setNotice("");const{data,error}=await supabase.rpc("refresh_money_chaser_states");setBusy(false);if(error)return setError(error.message);setNotice(`Money Chaser checked ${Number(data?.receivables_checked||0)} receivable${Number(data?.receivables_checked||0)===1?"":"s"}.`);await load()}
 async function markPaid(r:Receivable){const{error}=await supabase.from("money_chaser_receivables").update({amount_outstanding:0,state:"paid",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",r.id).eq("owner_id",session.user.id);if(error)return setError(error.message);await load()}
 async function pause(r:Receivable){const{error}=await supabase.from("money_chaser_receivables").update({state:"paused",paused_reason:"Paused by owner",updated_at:new Date().toISOString()}).eq("id",r.id).eq("owner_id",session.user.id);if(error)return setError(error.message);await load()}

 function debtorName(id:string){return debtors.find(d=>d.id===id)?.display_name||profile.debtor_label}
 const shown=receivables.filter(r=>filter==="all"||filter==="attention"&&["disputed","escalated"].includes(r.state)||filter==="chasing"&&["soft_nudge","firm_notice"].includes(r.state)||filter==="promised"&&r.state==="promise_tracked"||filter==="recovered"&&r.state==="paid"||filter==="escalated"&&r.state==="escalated");

 return <section className="panel-card">
  <div className="section-head"><div><p className="eyebrow">Universal accounts receivable</p><h2>AI Money Chaser — Business AR</h2><p className="muted">Track money owed by any customer or client. The engine uses balances, due dates and recorded commitments to decide what needs attention. It does not invent debts or send legal notices.</p></div><div className="maintenance-actions"><span className="pill">{profile.autopilot_enabled?"AUTOPILOT ON":"AUTOPILOT OFF"}</span><button className="ghost-btn" disabled={busy} onClick={runEngine}>{busy?"Checking...":"Run engine"}</button></div></div>

  <div className="mini-grid">
   <div className="metric"><span>Outstanding</span><strong>${metrics.outstanding.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Open receivables</small></div>
   <div className="metric"><span>Recovered / paid</span><strong>${metrics.paidDown.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Recorded reduction in balances</small></div>
   <div className="metric"><span>Promised</span><strong>${metrics.promised.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Active payment commitments</small></div>
   <div className="metric"><span>AI chasing</span><strong>${metrics.chasing.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Soft or firm follow-up state</small></div>
   <div className="metric"><span>Needs owner</span><strong>${metrics.attention.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Disputed or escalated</small></div>
  </div>

  {error&&<p className="form-message error">{error}</p>}{notice&&<p className="form-message">{notice}</p>}

  <div className="money-grid" style={{marginTop:18}}>
   <form className="auth-form setup-form" onSubmit={e=>{e.preventDefault();saveProfile()}}><h3>Business language & rules</h3><label>Business name<input value={profile.business_name||""} onChange={e=>setProfile({...profile,business_name:e.target.value||null})}/></label><label>Business type<select value={profile.vertical_code} onChange={e=>setVertical(e.target.value)}><option value="general">General business</option><option value="contractor">Contractor</option><option value="hvac">HVAC</option><option value="agency">Agency</option><option value="consulting">Consulting</option><option value="trucking">Trucking</option><option value="cleaning">Cleaning</option></select></label><div className="form-row"><label>Who owes you?<input value={profile.debtor_label} onChange={e=>setProfile({...profile,debtor_label:e.target.value})}/></label><label>What do you call the bill?<input value={profile.receivable_label} onChange={e=>setProfile({...profile,receivable_label:e.target.value})}/></label></div><div className="form-row"><label>Soft nudge after days overdue<input type="number" min="0" value={profile.soft_nudge_days} onChange={e=>setProfile({...profile,soft_nudge_days:Number(e.target.value)||0})}/></label><label>Firm notice after<input type="number" min="0" value={profile.firm_notice_days} onChange={e=>setProfile({...profile,firm_notice_days:Number(e.target.value)||0})}/></label><label>Escalate after<input type="number" min="0" value={profile.escalation_days} onChange={e=>setProfile({...profile,escalation_days:Number(e.target.value)||0})}/></label></div><label className="check-row"><input type="checkbox" checked={profile.autopilot_enabled} onChange={e=>setProfile({...profile,autopilot_enabled:e.target.checked})}/>Enable Money Chaser autopilot</label><button className="primary-btn" disabled={busy}>Save rules</button></form>

   <div><form className="auth-form setup-form" onSubmit={addDebtor}><h3>Add {profile.debtor_label.toLowerCase()}</h3><label>Name<input required value={debtorForm.display_name} onChange={e=>setDebtorForm({...debtorForm,display_name:e.target.value})}/></label><label>Company<input value={debtorForm.company_name} onChange={e=>setDebtorForm({...debtorForm,company_name:e.target.value})}/></label><div className="form-row"><label>Email<input type="email" value={debtorForm.email} onChange={e=>setDebtorForm({...debtorForm,email:e.target.value})}/></label><label>Phone<input value={debtorForm.phone} onChange={e=>setDebtorForm({...debtorForm,phone:e.target.value})}/></label></div><button className="ghost-btn">Save {profile.debtor_label.toLowerCase()}</button></form>
   <form className="auth-form setup-form" onSubmit={addReceivable} style={{marginTop:14}}><h3>Add money owed</h3><label>{profile.debtor_label}<select required value={itemForm.debtor_id} onChange={e=>setItemForm({...itemForm,debtor_id:e.target.value})}><option value="">Choose {profile.debtor_label.toLowerCase()}</option>{debtors.map(d=><option key={d.id} value={d.id}>{d.display_name}{d.company_name?` · ${d.company_name}`:""}</option>)}</select></label><label>{profile.receivable_label} reference<input value={itemForm.reference} onChange={e=>setItemForm({...itemForm,reference:e.target.value})}/></label><label>Description<input value={itemForm.description} onChange={e=>setItemForm({...itemForm,description:e.target.value})}/></label><div className="form-row"><label>Amount owed<input required type="number" min="0.01" step="0.01" value={itemForm.amount} onChange={e=>setItemForm({...itemForm,amount:e.target.value})}/></label><label>Due date<input required type="date" value={itemForm.due_date} onChange={e=>setItemForm({...itemForm,due_date:e.target.value})}/></label></div><button className="primary-btn" disabled={!debtors.length}>Add receivable</button></form></div>
  </div>

  <div style={{marginTop:20}}><div className="subtabs"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>All</button><button className={filter==="attention"?"active":""} onClick={()=>setFilter("attention")}>Needs Attention</button><button className={filter==="chasing"?"active":""} onClick={()=>setFilter("chasing")}>AI Chasing</button><button className={filter==="promised"?"active":""} onClick={()=>setFilter("promised")}>Promised Payments</button><button className={filter==="recovered"?"active":""} onClick={()=>setFilter("recovered")}>Recovered</button><button className={filter==="escalated"?"active":""} onClick={()=>setFilter("escalated")}>Escalated</button></div><div className="record-list">{shown.length?shown.map(r=><article key={r.id}><div><b>{debtorName(r.debtor_id)}</b><small>{r.reference||profile.receivable_label} · Due {r.due_date}</small><small>{r.description||"No description"}</small></div><div className="record-right"><b>${Number(r.amount_outstanding).toFixed(2)}</b><span className={r.state==="escalated"||r.state==="disputed"?"pill warn":"pill"}>{r.state.replaceAll("_"," ")}</span><small>Risk {Number(r.risk_score).toFixed(0)}/100</small>{r.state!=="paid"&&<div className="maintenance-actions"><button className="ghost-btn" onClick={()=>pause(r)}>Pause</button><button className="primary-btn" onClick={()=>markPaid(r)}>Mark paid</button></div>}</div></article>):<p className="muted">No receivables in this state yet.</p>}</div></div>
 </section>
}
