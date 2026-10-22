import {FormEvent,useEffect,useState} from "react";
import {supabase} from "../lib/supabase";
const API=(import.meta.env.VITE_AI_API_URL||"").replace(/\/$/,"");

type Info={tenant_name:string;property_name:string;unit_label:string;amount_due:number;due_date:string|null;paid_up:boolean;account_active?:boolean};
type PublicRequest={id:string;title:string;description:string|null;priority:string;status:string;created_at:string;updated_at:string;scheduled_for:string|null;approved_at:string|null;photo_count:number};

const areas=["Kitchen","Bathroom","Bedroom","Living room","Laundry","HVAC / thermostat","Electrical","Plumbing","Exterior","Door / lock","Appliance","Other / not sure"];
const issues=["Leak / water","Sink / faucet","Toilet","No hot water","AC not cooling","Heat not working","Power / outlet","Light / fixture","Appliance not working","Door / lock","Pest issue","Smoke / CO alarm","Damage","Other / not sure"];

async function filesToDataUrls(files:File[]){
  const selected=files.slice(0,4);
  return Promise.all(selected.map(file=>new Promise<{name:string;data:string}>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve({name:file.name,data:String(reader.result||"")});
    reader.onerror=()=>reject(new Error("Unable to read photo"));
    reader.readAsDataURL(file);
  })));
}

export function PublicRentPayment({token}:{token:string}){
 const[info,setInfo]=useState<Info|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const[payerName,setPayerName]=useState(""),[receiptEmail,setReceiptEmail]=useState(""),[showPay,setShowPay]=useState(false);
 const[showActivate,setShowActivate]=useState(false),[showSignIn,setShowSignIn]=useState(false),[activateEmail,setActivateEmail]=useState(""),[activatePassword,setActivatePassword]=useState(""),[activateMessage,setActivateMessage]=useState("");
 const[tab,setTab]=useState<"payments"|"maintenance">("payments");
 const[requests,setRequests]=useState<PublicRequest[]>([]),[maintenanceMessage,setMaintenanceMessage]=useState("");
 const[maintenance,setMaintenance]=useState({area:"Kitchen",issue:"Leak / water",description:"",priority:"routine",entryPermission:"not_specified"});
 const[files,setFiles]=useState<File[]>([]);

 async function load(){
  setLoading(true);setError("");
  try{
   const r=await fetch(`${API}/api/public/pay/${encodeURIComponent(token)}`);
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to load resident access");
   setInfo(j);if(!payerName)setPayerName(j.tenant_name||"");
  }catch(e){setError(e instanceof Error?e.message:"Unable to load resident access")}finally{setLoading(false)}
 }
 async function loadMaintenance(){
  try{
   const r=await fetch(`${API}/api/public/resident/${encodeURIComponent(token)}/maintenance`);
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to load maintenance requests");
   setRequests(j.requests||[]);
  }catch(e){setMaintenanceMessage(e instanceof Error?e.message:"Unable to load maintenance requests")}
 }
 useEffect(()=>{load();loadMaintenance()},[token]);

 async function pay(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{
  const r=await fetch(`${API}/api/public/pay/${encodeURIComponent(token)}/checkout`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({payerName,receiptEmail})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to start payment");if(j.url)window.location.assign(j.url)
 }catch(e){setError(e instanceof Error?e.message:"Unable to start payment")}finally{setBusy(false)}}

 async function activate(e:FormEvent){e.preventDefault();setBusy(true);setActivateMessage("");try{
  const{data,error}=await supabase.auth.signUp({email:activateEmail,password:activatePassword,options:{data:{resident_activation_token:token,account_type:"resident"}}});
  if(error)throw error;
  if(data.session){
   const r=await fetch(`${API}/api/resident/activate`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({token})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to activate resident account");window.location.assign("/");
  }else setActivateMessage("Account created. Confirm your email, then return to this resident link and sign in.")
 }catch(e){setActivateMessage(e instanceof Error?e.message:"Unable to activate account")}finally{setBusy(false)}}

 async function signIn(e:FormEvent){e.preventDefault();setBusy(true);setActivateMessage("");try{
  const{error}=await supabase.auth.signInWithPassword({email:activateEmail,password:activatePassword});if(error)throw error;window.location.assign("/");
 }catch(e){setActivateMessage(e instanceof Error?e.message:"Unable to sign in")}finally{setBusy(false)}}

 async function submitMaintenance(e:FormEvent){e.preventDefault();setBusy(true);setMaintenanceMessage("");try{
  const photos=await filesToDataUrls(files);
  const r=await fetch(`${API}/api/public/resident/${encodeURIComponent(token)}/maintenance`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...maintenance,photos})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to submit maintenance request");
  setMaintenance({area:"Kitchen",issue:"Leak / water",description:"",priority:"routine",entryPermission:"not_specified"});setFiles([]);
  setMaintenanceMessage("Maintenance request submitted directly to your property manager.");
  await loadMaintenance();
 }catch(e){setMaintenanceMessage(e instanceof Error?e.message:"Unable to submit maintenance request")}finally{setBusy(false)}}

 const result=new URLSearchParams(window.location.search).get("payment");
 return <div className="resident-access">
  <header className="resident-access-header"><div className="logo"><div className="logo-mark">R</div><div><strong>RentPilot</strong><span>Resident Services</span></div></div><span>Secure resident access</span></header>
  <main className="resident-access-main">
   {loading?<div className="resident-access-card">Loading resident services...</div>:error&&!info?<div className="resident-access-card"><p className="form-message error">{error}</p></div>:info&&<>
    <section className="resident-property"><p className="eyebrow">Resident services</p><h1>{info.property_name}</h1><p>{info.unit_label?`Unit / Home ${info.unit_label} · `:""}{info.tenant_name}</p></section>
    {result==="success"&&<p className="form-message">Payment submitted. Your Stripe receipt will be emailed to you.</p>}
    {result==="cancelled"&&<p className="form-message">Payment was cancelled. No charge was made.</p>}
    <nav className="resident-tabs"><button className={tab==="payments"?"active":""} onClick={()=>setTab("payments")}>Payments</button><button className={tab==="maintenance"?"active":""} onClick={()=>setTab("maintenance")}>Maintenance</button></nav>

    {tab==="payments"&&<section className="resident-service-grid">
     <div className="resident-access-card"><p className="eyebrow">Current balance</p><div className="resident-amount">${Number(info.amount_due).toLocaleString(undefined,{minimumFractionDigits:2})}</div><p>{info.due_date?`Oldest unpaid rent charge due ${info.due_date}`:"You're caught up right now."}</p>
      {!info.paid_up&&<button className="primary-btn resident-wide" onClick={()=>setShowPay(v=>!v)}>Pay now</button>}
      {showPay&&!info.paid_up&&<form className="auth-form resident-inline-form" onSubmit={pay}><label>Name of person paying<input required value={payerName} onChange={e=>setPayerName(e.target.value)}/></label><label>Email for receipt<input required type="email" value={receiptEmail} onChange={e=>setReceiptEmail(e.target.value)} placeholder="receipt@example.com"/></label><button className="primary-btn" disabled={busy}>{busy?"Opening secure checkout...":`Continue to pay $${Number(info.amount_due).toFixed(2)}`}</button><small className="muted">Secure Stripe checkout. No RentPilot account required.</small></form>}
     </div>
     <div className="resident-access-card"><p className="eyebrow">Resident account</p><h2>{info.account_active?"Resident account active":"Keep your full resident history"}</h2><p>{info.account_active?"Sign in to view your complete resident portal, payment history and maintenance records.":"Activate an account from this secure lease link to keep your full payment and maintenance history."}</p>
      {!info.account_active&&<button className="ghost-btn resident-wide" onClick={()=>{setShowActivate(v=>!v);setShowSignIn(false)}}>Activate Resident Account</button>}
      {info.account_active&&<button className="ghost-btn resident-wide" onClick={()=>{setShowSignIn(v=>!v);setShowActivate(false)}}>Sign in to Resident Account</button>}
      {showActivate&&!info.account_active&&<form className="auth-form resident-inline-form" onSubmit={activate}><label>Your email<input required type="email" value={activateEmail} onChange={e=>setActivateEmail(e.target.value)}/></label><label>Create password<input required minLength={6} type="password" value={activatePassword} onChange={e=>setActivatePassword(e.target.value)}/></label><button className="primary-btn" disabled={busy}>{busy?"Creating account...":"Create resident account"}</button></form>}
      {showSignIn&&<form className="auth-form resident-inline-form" onSubmit={signIn}><label>Email<input required type="email" value={activateEmail} onChange={e=>setActivateEmail(e.target.value)}/></label><label>Password<input required type="password" value={activatePassword} onChange={e=>setActivatePassword(e.target.value)}/></label><button className="primary-btn" disabled={busy}>{busy?"Signing in...":"Sign in"}</button></form>}
      {activateMessage&&<p className="form-message">{activateMessage}</p>}<p className="resident-note">This secure link still works for rent and maintenance even without an account.</p>
     </div>
    </section>}

    {tab==="maintenance"&&<section className="resident-service-grid resident-maintenance-grid">
     <div className="resident-access-card"><p className="eyebrow">Submit request</p><h2>Maintenance request</h2><p>You do not need an account. This request is automatically attached to this home and sent to your property manager.</p>
      <form className="auth-form" onSubmit={submitMaintenance}>
       <label>Where is the problem?<select value={maintenance.area} onChange={e=>setMaintenance({...maintenance,area:e.target.value})}>{areas.map(x=><option key={x}>{x}</option>)}</select></label>
       <label>What is happening?<select value={maintenance.issue} onChange={e=>setMaintenance({...maintenance,issue:e.target.value})}>{issues.map(x=><option key={x}>{x}</option>)}</select></label>
       <label>Tell us more<textarea required value={maintenance.description} onChange={e=>setMaintenance({...maintenance,description:e.target.value})} placeholder="Example: Water is dripping under the kitchen sink whenever I turn it on."/></label>
       <label>Urgency<select value={maintenance.priority} onChange={e=>setMaintenance({...maintenance,priority:e.target.value})}><option value="routine">Routine</option><option value="high">High</option><option value="emergency">Emergency</option></select></label>
       <label>Permission to enter<select value={maintenance.entryPermission} onChange={e=>setMaintenance({...maintenance,entryPermission:e.target.value})}><option value="not_specified">Ask me before entering</option><option value="permission_granted">Permission granted to enter</option><option value="resident_present">I want to be present</option></select></label>
       <label>Photos (up to 4)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={e=>setFiles(Array.from(e.target.files||[]).slice(0,4))}/></label>
       <button className="primary-btn" disabled={busy}>{busy?"Submitting...":"Submit maintenance request"}</button>
      </form>{maintenanceMessage&&<p className={maintenanceMessage.toLowerCase().includes("unable")?"form-message error":"form-message"}>{maintenanceMessage}</p>}
     </div>
     <div className="resident-access-card"><p className="eyebrow">This home</p><h2>Maintenance requests</h2><div className="resident-request-list">{requests.length?requests.map(r=><article key={r.id}><div><b>{r.title}</b><small>{new Date(r.created_at).toLocaleDateString()} · {r.photo_count||0} photo{r.photo_count===1?"":"s"}</small></div><div className="record-right"><span className={r.priority==="emergency"?"priority emergency":r.priority==="high"?"priority high":"priority"}>{r.priority}</span><small>{r.status.replaceAll("_"," ")}</small></div></article>):<p className="muted">No maintenance requests have been submitted from this lease yet.</p>}</div><p className="resident-note">Activate a resident account to keep the full long-term history and future document export.</p></div>
    </section>}
    {error&&<p className="form-message error">{error}</p>}
   </>}
  </main>
 </div>
}
