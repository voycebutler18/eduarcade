import {FormEvent,useEffect,useMemo,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";

type Lease={id:string;tenant_id:string;monthly_rent:number;tenants?:{full_name:string}|null;units?:{unit_label:string;properties?:{name:string}|null}|null};
type Charge={id:string;lease_id:string;amount:number;due_date:string;status:string};
type Payment={id:string;lease_id:string;rent_charge_id:string|null;amount:number;paid_at:string};
type PromiseRow={id:string;lease_id:string;promised_amount:number;promised_date:string;status:string};
type Followup={id:string;lease_id:string;tenant_id:string;source_type:"rent_charge"|"payment_promise";reason:string;balance:number;due_date:string;status:string;message_body:string;generated_at:string;sent_at?:string|null;resolved_at?:string|null};

export function MoneyChaser({session}:{session:Session}){
 const[leases,setLeases]=useState<Lease[]>([]);
 const[charges,setCharges]=useState<Charge[]>([]);
 const[payments,setPayments]=useState<Payment[]>([]);
 const[promises,setPromises]=useState<PromiseRow[]>([]);
 const[followups,setFollowups]=useState<Followup[]>([]);
 const[error,setError]=useState("");
 const[notice,setNotice]=useState("");
 const[busy,setBusy]=useState(false);
 const[mode,setMode]=useState<"charge"|"payment"|"promise">("charge");
 const[form,setForm]=useState({lease_id:"",charge_id:"",amount:"",date:"",note:""});

 async function load(){
  const[l,c,p,pr,f]=await Promise.all([
   supabase.from("leases").select("id,tenant_id,monthly_rent,tenants(full_name),units(unit_label,properties(name))").eq("status","active"),
   supabase.from("rent_charges").select("id,lease_id,amount,due_date,status").order("due_date",{ascending:false}),
   supabase.from("payments").select("id,lease_id,rent_charge_id,amount,paid_at").order("paid_at",{ascending:false}),
   supabase.from("payment_promises").select("id,lease_id,promised_amount,promised_date,status").order("promised_date"),
   supabase.from("rent_followup_queue").select("id,lease_id,tenant_id,source_type,reason,balance,due_date,status,message_body,generated_at,sent_at,resolved_at").order("generated_at",{ascending:false}).limit(100)
  ]);
  setLeases((l.data||[])as unknown as Lease[]);
  setCharges((c.data||[])as Charge[]);
  setPayments((p.data||[])as Payment[]);
  setPromises((pr.data||[])as PromiseRow[]);
  setFollowups((f.data||[])as Followup[]);
  setError(l.error?.message||c.error?.message||p.error?.message||pr.error?.message||f.error?.message||"");
 }

 useEffect(()=>{load()},[]);
 const paidByCharge=useMemo(()=>payments.reduce((a,p)=>{if(p.rent_charge_id)a[p.rent_charge_id]=(a[p.rent_charge_id]||0)+Number(p.amount);return a},{} as Record<string,number>),[payments]);
 const outstanding=charges.reduce((s,c)=>s+Math.max(0,Number(c.amount)-(paidByCharge[c.id]||0)),0);
 const collected=payments.reduce((s,p)=>s+Number(p.amount),0);
 const pastDue=charges.filter(c=>new Date(c.due_date+"T12:00:00")<new Date()&&Number(c.amount)>(paidByCharge[c.id]||0));
 const missedPromises=promises.filter(p=>p.status==="active"&&new Date(p.promised_date+"T23:59:59")<new Date());
 const sent=followups.filter(f=>f.status==="sent");

 function leaseLabel(id:string){
  const l=leases.find(x=>x.id===id);
  return l?`${l.tenants?.full_name||"Resident"} · ${l.units?.properties?.name||"Property"} · Unit ${l.units?.unit_label||"—"}`:"Lease";
 }
 function selectLease(id:string){const l=leases.find(x=>x.id===id);setForm({...form,lease_id:id,amount:l?String(l.monthly_rent):form.amount})}

 async function runAutopilotNow(){
  setBusy(true);setError("");setNotice("");
  try{
   const{data,error}=await supabase.rpc("refresh_rent_followup_queue");
   if(error)throw error;
   setNotice(`Autopilot checked the ledger. ${Number(data?.sent_messages||0)} message${Number(data?.sent_messages||0)===1?"":"s"} sent.`);
   await load();
  }catch(e:any){setError(e.message||"Unable to run Money Chaser Autopilot")}
  finally{setBusy(false)}
 }

 async function save(e:FormEvent){
  e.preventDefault();setError("");setNotice("");
  let err:any;
  if(mode==="charge"){
   ({error:err}=await supabase.from("rent_charges").insert({owner_id:session.user.id,lease_id:form.lease_id,amount:Number(form.amount),due_date:form.date,status:"due"}));
  }else if(mode==="payment"){
   ({error:err}=await supabase.from("payments").insert({owner_id:session.user.id,lease_id:form.lease_id,rent_charge_id:form.charge_id||null,amount:Number(form.amount),paid_at:new Date(form.date+"T12:00:00").toISOString(),reference:form.note||null}));
   if(!err&&form.charge_id){
    const c=charges.find(x=>x.id===form.charge_id),total=(paidByCharge[form.charge_id]||0)+Number(form.amount);
    await supabase.from("rent_charges").update({status:total>=Number(c?.amount||0)?"paid":"partial"}).eq("id",form.charge_id);
   }
  }else{
   ({error:err}=await supabase.from("payment_promises").insert({owner_id:session.user.id,lease_id:form.lease_id,promised_amount:Number(form.amount),promised_date:form.date,status:"active",notes:form.note||null}));
  }
  if(err)return setError(err.message);
  setForm({lease_id:"",charge_id:"",amount:"",date:"",note:""});
  await load();
 }

 return <section className="panel-card">
  <div className="section-head">
   <div>
    <p className="eyebrow">2050 automation</p>
    <h2>Money Chaser Autopilot</h2>
    <p className="muted">RentPilot automatically determines past-due balances from the recorded due date and remaining ledger balance, then sends resident follow-ups without waiting for you.</p>
   </div>
   <div className="maintenance-actions">
    <span className="pill">AUTOPILOT ON</span>
    <button className="ghost-btn" disabled={busy} onClick={runAutopilotNow}>{busy?"Checking...":"Run now"}</button>
   </div>
  </div>

  <div className="mini-grid">
   <div className="metric"><span>Outstanding</span><strong>${outstanding.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Verified unpaid ledger balance</small></div>
   <div className="metric"><span>Past due now</span><strong>{pastDue.length}</strong><small>Due date passed + balance remains</small></div>
   <div className="metric"><span>Missed promises</span><strong>{missedPromises.length}</strong><small>Promise date passed</small></div>
   <div className="metric"><span>Automated follow-ups</span><strong>{sent.length}</strong><small>Tracked messages sent by Autopilot</small></div>
   <div className="metric"><span>Collected</span><strong>${collected.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Recorded payments</small></div>
  </div>

  <div className="setup-form" style={{marginTop:16}}>
   <p className="eyebrow">How AI decides</p>
   <h3>Past due = due date passed + unpaid balance remains</h3>
   <p className="muted">RentPilot does not guess from behavior, credit, demographics, or conversation history. It checks the lease charge, recorded payments, and payment-promise dates. Automatic messages are payment reminders only—not late-fee calculations, eviction notices, or legal notices.</p>
  </div>

  {error&&<p className="form-message error">{error}</p>}
  {notice&&<p className="form-message">{notice}</p>}

  <div className="money-grid">
   <div>
    <div className="subtabs">
     <button className={mode==="charge"?"active":""} onClick={()=>setMode("charge")}>Add charge</button>
     <button className={mode==="payment"?"active":""} onClick={()=>setMode("payment")}>Record payment</button>
     <button className={mode==="promise"?"active":""} onClick={()=>setMode("promise")}>Payment promise</button>
    </div>
    <form className="auth-form setup-form" onSubmit={save}>
     <label>Lease<select required value={form.lease_id} onChange={e=>selectLease(e.target.value)}><option value="">Choose resident / unit</option>{leases.map(l=><option key={l.id} value={l.id}>{leaseLabel(l.id)}</option>)}</select></label>
     {mode==="payment"&&<label>Apply to charge<select value={form.charge_id} onChange={e=>setForm({...form,charge_id:e.target.value})}><option value="">Unapplied payment</option>{charges.filter(c=>!form.lease_id||c.lease_id===form.lease_id).map(c=><option key={c.id} value={c.id}>{c.due_date} · ${Math.max(0,Number(c.amount)-(paidByCharge[c.id]||0)).toFixed(2)} remaining</option>)}</select></label>}
     <label>Amount<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
     <label>{mode==="charge"?"Due date":mode==="payment"?"Payment date":"Promised date"}<input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
     <label>Note<input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Optional"/></label>
     <button className="primary-btn" disabled={!leases.length}>{mode==="charge"?"Create charge":mode==="payment"?"Record payment":"Save promise"}</button>
    </form>
   </div>

   <div>
    <div className="section-head"><div><p className="eyebrow">Automation log</p><h3>Recent Money Chaser actions</h3></div></div>
    <div className="record-list">
     {followups.length?followups.map(f=><article key={f.id}><div><b>{leaseLabel(f.lease_id)}</b><small>{f.source_type==="rent_charge"?"Past-due balance":"Payment promise"} · {f.due_date}</small><small>{f.message_body}</small></div><div className="record-right"><b>${Number(f.balance).toFixed(2)}</b><span className={f.status==="sent"?"pill":"pill warn"}>{f.status}</span>{f.sent_at&&<small>{new Date(f.sent_at).toLocaleString()}</small>}</div></article>):<p className="muted">No automated follow-ups have been generated yet.</p>}
    </div>
   </div>
  </div>

  <div style={{marginTop:18}}>
   <h3 className="list-title">Rent ledger</h3>
   <div className="record-list">{charges.length?charges.map(c=>{const paid=paidByCharge[c.id]||0,balance=Math.max(0,Number(c.amount)-paid),late=new Date(c.due_date+"T12:00:00")<new Date()&&balance>0;return <article key={c.id}><div><b>{leaseLabel(c.lease_id)}</b><small>Due {c.due_date}</small></div><div className="record-right"><b>${balance.toFixed(2)} remaining</b><span className={late?"pill warn":"pill"}>{balance===0?"paid":late?"past due":c.status}</span></div></article>}):<p className="muted">No rent charges yet.</p>}</div>
  </div>
 </section>
}
