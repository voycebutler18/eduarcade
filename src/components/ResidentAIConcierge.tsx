import {FormEvent,useState} from "react";
import {paymentApi} from "../lib/ai";

type Turn={role:"resident"|"ai";text:string};
type Props={onCreated?:()=>void};
async function photoPayload(files:File[]){return Promise.all(files.slice(0,3).map(f=>new Promise<{name:string;data:string}>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:f.name,data:String(r.result||"")});r.onerror=()=>reject(new Error("Unable to read photo"));r.readAsDataURL(f)})))}

export function ResidentAIConcierge({onCreated}:Props){
 const[turns,setTurns]=useState<Turn[]>([{role:"ai",text:"Hi. Just tell me what’s wrong in your home. You can explain it normally or send me a photo. I’ll handle the maintenance request for you."}]);
 const[text,setText]=useState("");
 const[files,setFiles]=useState<File[]>([]);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState("");

 async function send(e:FormEvent){
  e.preventDefault();if((!text.trim()&&!files.length)||busy)return;
  const residentText=text.trim()||(files.length?"I attached a photo of the problem.":"");
  const next=[...turns,{role:"resident" as const,text:residentText}];
  setTurns(next);setText("");setBusy(true);setError("");
  try{
   const photos=await photoPayload(files);setFiles([]);
   const result=await paymentApi("/api/resident/concierge",{message:residentText,history:next.map(x=>({role:x.role,text:x.text})),photos});
   if(result.action==="create_maintenance"){
    await paymentApi("/api/resident/maintenance",{
     category:result.category||"Other / Not Sure",
     area:result.area||"Other / Not Sure",
     issue:result.issue_type||"Other / Not Sure",
     description:result.description||residentText,
     priority:["routine","high","emergency"].includes(result.priority)?result.priority:"routine",
     entryPermission:result.entry_permission||"ask_first",
     photos
    });
    setTurns(v=>[...v,{role:"ai",text:result.reply||"Done. I created the maintenance request and sent it into your property manager’s RentPilot maintenance workflow."}]);
    onCreated?.();
   }else{
    setTurns(v=>[...v,{role:"ai",text:result.reply||"Tell me a little more about what is happening."}]);
   }
  }catch(e){setError(e instanceof Error?e.message:"Resident AI is unavailable")}
  finally{setBusy(false)}
 }

 return <section className="panel-card">
  <div className="section-head"><div><p className="eyebrow">AI resident concierge</p><h2>Tell RentPilot what’s wrong</h2><p className="muted">No maintenance form required. Talk naturally and RentPilot will ask only what it still needs.</p></div><span className="pill">AI ACTIVE</span></div>
  <div style={{display:"flex",flexDirection:"column",gap:9,maxHeight:380,overflowY:"auto",padding:"8px 0 14px"}}>{turns.map((t,i)=><div key={i} style={{alignSelf:t.role==="resident"?"flex-end":"flex-start",maxWidth:"84%",padding:"11px 13px",border:"1px solid #d9dfda",borderRadius:14,background:t.role==="resident"?"#eef6f0":"#fff"}}><b>{t.role==="resident"?"You":"RentPilot AI"}</b><div style={{whiteSpace:"pre-wrap",marginTop:4}}>{t.text}</div></div>)}{busy&&<div className="muted">RentPilot is handling that...</div>}</div>
  {error&&<p className="form-message error">{error}</p>}
  <form className="auth-form" onSubmit={send}><textarea rows={3} value={text} onChange={e=>setText(e.target.value)} placeholder="Example: My kitchen sink is leaking under the cabinet..."/><label>Photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files||[]).slice(0,3))}/><small>{files.length?files.map(f=>f.name).join(" · "):"Add up to 3 photos if it helps show the problem."}</small></label><button className="primary-btn" disabled={busy||(!text.trim()&&!files.length)}>{busy?"Working...":"Tell RentPilot"}</button></form>
 </section>
}
