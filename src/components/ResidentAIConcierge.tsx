import {FormEvent,useState} from "react";
import {paymentApi} from "../lib/ai";

type Turn={role:"resident"|"ai";text:string};
type Props={onCreated?:()=>void};
async function photoPayload(files:File[]){return Promise.all(files.slice(0,3).map(f=>new Promise<{name:string;data:string}>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:f.name,data:String(r.result||"")});r.onerror=()=>reject(new Error("Unable to read photo"));r.readAsDataURL(f)})))}

export function ResidentAIConcierge({onCreated}:Props){
 const[turns,setTurns]=useState<Turn[]>([{role:"ai",text:"Hi. I’m your RentPilot AI. Just tell me what you need. I can handle a maintenance problem, send your property manager a message, or answer questions about your RentPilot balance, payments, lease dates, documents, and existing requests."}]);
 const[text,setText]=useState("");
 const[files,setFiles]=useState<File[]>([]);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState("");

 async function send(e:FormEvent){
  e.preventDefault();if((!text.trim()&&!files.length)||busy)return;
  const residentText=text.trim()||(files.length?"I attached a photo. Please help me with this.":"");
  const next=[...turns,{role:"resident" as const,text:residentText}];
  setTurns(next);setText("");setBusy(true);setError("");
  try{
   const photos=await photoPayload(files);setFiles([]);
   const result=await paymentApi("/api/resident/concierge",{message:residentText,history:next.map(x=>({role:x.role,text:x.text})),photos});
   if(result.action==="create_maintenance"){
    await paymentApi("/api/resident/maintenance",{
     category:result.category||"Other / Not Sure",area:result.area||"Other / Not Sure",issue:result.issue_type||"Other / Not Sure",
     description:result.description||residentText,priority:["routine","high","emergency"].includes(result.priority)?result.priority:"routine",
     entryPermission:result.entry_permission||"ask_first",photos
    });
    setTurns(v=>[...v,{role:"ai",text:result.reply||"Done. I created the maintenance request and sent it into your property manager’s RentPilot workflow."}]);
    onCreated?.();
   }else{
    setTurns(v=>[...v,{role:"ai",text:result.reply||"Tell me a little more about what you need."}]);
   }
  }catch(e){setError(e instanceof Error?e.message:"Resident AI is unavailable")}
  finally{setBusy(false)}
 }

 return <section className="panel-card">
  <div className="section-head"><div><p className="eyebrow">Resident AI</p><h2>Just tell RentPilot what you need</h2><p className="muted">Maintenance, messages, balances, payments, lease dates, documents, and existing requests—talk normally instead of hunting through forms.</p></div><span className="pill">AI ACTIVE</span></div>
  <div style={{display:"flex",flexDirection:"column",gap:9,maxHeight:430,overflowY:"auto",padding:"8px 0 14px"}}>{turns.map((t,i)=><div key={i} style={{alignSelf:t.role==="resident"?"flex-end":"flex-start",maxWidth:"84%",padding:"11px 13px",border:"1px solid #d9dfda",borderRadius:14,background:t.role==="resident"?"#eef6f0":"#fff"}}><b>{t.role==="resident"?"You":"RentPilot AI"}</b><div style={{whiteSpace:"pre-wrap",marginTop:4}}>{t.text}</div></div>)}{busy&&<div className="muted">RentPilot is handling that...</div>}</div>
  {error&&<p className="form-message error">{error}</p>}
  <form className="auth-form" onSubmit={send}><textarea rows={3} value={text} onChange={e=>setText(e.target.value)} placeholder="Try: Tell my landlord the bathroom faucet is leaking. Or: What do I owe right now?"/><label>Photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files||[]).slice(0,3))}/><small>{files.length?files.map(f=>f.name).join(" · "):"Attach up to 3 photos when they help explain what you need."}</small></label><button className="primary-btn" disabled={busy||(!text.trim()&&!files.length)}>{busy?"Working...":"Ask RentPilot"}</button></form>
 </section>
}
