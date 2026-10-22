import { FormEvent,useEffect,useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { askRentPilot } from "../lib/ai";

type Action={id:string;action_type:string;entity_type:string|null;status:string;summary:string;created_at:string};
type Snapshot={properties:any[];units:any[];tenants:any[];leases:any[];rent_charges:any[];payments:any[];payment_promises:any[];maintenance_requests:any[];messages:any[]};

export function AIActivity({session}:{session:Session}){
 const[actions,setActions]=useState<Action[]>([]),[question,setQuestion]=useState(""),[answer,setAnswer]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function loadActions(){const{data,error}=await supabase.from("ai_actions").select("id,action_type,entity_type,status,summary,created_at").order("created_at",{ascending:false}).limit(50);setActions((data||[])as Action[]);setError(error?.message||"")}
 useEffect(()=>{loadActions()},[]);
 async function getSnapshot():Promise<Snapshot>{
  const[p,u,t,l,c,pay,pr,m,msg]=await Promise.all([
   supabase.from("properties").select("id,name,city,state"),
   supabase.from("units").select("id,property_id,unit_label,monthly_rent,status,properties(name)"),
   supabase.from("tenants").select("id,full_name,email,phone"),
   supabase.from("leases").select("id,tenant_id,unit_id,monthly_rent,due_day,status,start_date,end_date,tenants(full_name),units(unit_label,properties(name))"),
   supabase.from("rent_charges").select("id,lease_id,due_date,amount,status"),
   supabase.from("payments").select("id,lease_id,rent_charge_id,amount,paid_at"),
   supabase.from("payment_promises").select("id,lease_id,promised_amount,promised_date,status"),
   supabase.from("maintenance_requests").select("id,title,description,priority,status,ai_summary,property_id,unit_id,tenant_id,vendor_id,properties(name),units(unit_label),tenants(full_name),vendors(name)").neq("status","cancelled"),
   supabase.from("messages").select("id,direction,channel,body,category,ai_summary,created_at,tenants(full_name)").order("created_at",{ascending:false}).limit(50)
  ]);
  const errors=[p.error,u.error,t.error,l.error,c.error,pay.error,pr.error,m.error,msg.error].filter(Boolean);if(errors.length)throw new Error(errors[0]?.message||"Could not load portfolio context");
  return {properties:p.data||[],units:u.data||[],tenants:t.data||[],leases:l.data||[],rent_charges:c.data||[],payments:pay.data||[],payment_promises:pr.data||[],maintenance_requests:m.data||[],messages:msg.data||[]};
 }
 async function ask(e:FormEvent){e.preventDefault();if(!question.trim())return;setBusy(true);setError("");setAnswer("");try{const snapshot=await getSnapshot();const out=await askRentPilot("portfolio_assistant",question,{portfolio:snapshot});setAnswer(out.text||"No answer returned.");await supabase.from("ai_actions").insert({owner_id:session.user.id,action_type:"portfolio_question",entity_type:"portfolio",status:"completed",summary:`Q: ${question}\nA: ${String(out.text||"").slice(0,1000)}`});setQuestion("");loadActions()}catch(err:any){setError(err.message||"Ask AI failed")}setBusy(false)}
 const suggestions=["Who owes me money right now?","What maintenance needs attention first?","Summarize everything happening across my properties.","Which tenants have active payment promises?"];
 return <section className="panel-card"><div className="section-head"><div><p className="eyebrow">Portfolio intelligence</p><h2>Ask RentPilot AI</h2></div></div>{error&&<p className="form-message error">{error}</p>}<div className="ai-console"><div><form className="auth-form setup-form" onSubmit={ask}><h3>Ask about your portfolio</h3><label>Question<textarea required value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Who owes me money right now?"/></label><button className="primary-btn" disabled={busy}>{busy?"Analyzing portfolio...":"Ask AI"}</button></form><div className="suggestion-row">{suggestions.map(s=><button className="ghost-btn" key={s} onClick={()=>setQuestion(s)}>{s}</button>)}</div>{answer&&<div className="ai-answer"><b>RentPilot AI</b><p>{answer}</p></div>}</div><div><h3 className="list-title">AI activity</h3><div className="request-list">{actions.length?actions.map(a=><article className="maintenance-card" key={a.id}><div className="maintenance-card-top"><div><span className="pill">{a.action_type.replaceAll("_"," ")}</span><h3>{a.entity_type||"AI action"}</h3><p>{new Date(a.created_at).toLocaleString()}</p></div><span className="pill">{a.status}</span></div><p className="request-description">{a.summary}</p></article>):<div className="empty-inline"><h3>No AI activity yet</h3><p>AI actions, maintenance triage, inbox analysis and portfolio questions will appear here.</p></div>}</div></div></div></section>
}