import { FormEvent,useEffect,useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { askRentPilot } from "../lib/ai";

type Tenant={id:string;full_name:string};
type Lease={id:string;tenant_id:string;units?:{unit_label:string;properties?:{name:string}|null}|null};
type Msg={id:string;tenant_id:string|null;lease_id:string|null;direction:"inbound"|"outbound";channel:string;body:string;category:string|null;ai_summary:string|null;created_at:string;tenants?:{full_name:string}|null;leases?:{units?:{unit_label:string;properties?:{name:string}|null}|null}|null};

export function InboxManager({session}:{session:Session}){
 const[tenants,setTenants]=useState<Tenant[]>([]),[leases,setLeases]=useState<Lease[]>([]),[messages,setMessages]=useState<Msg[]>([]);
 const[error,setError]=useState(""),[busy,setBusy]=useState(false),[draft,setDraft]=useState("");
 const[form,setForm]=useState({tenant_id:"",lease_id:"",channel:"app",body:""});
 async function load(){const[t,l,m]=await Promise.all([
   supabase.from("tenants").select("id,full_name").order("full_name"),
   supabase.from("leases").select("id,tenant_id,units(unit_label,properties(name))").eq("status","active"),
   supabase.from("messages").select("id,tenant_id,lease_id,direction,channel,body,category,ai_summary,created_at,tenants(full_name),leases(units(unit_label,properties(name)))").order("created_at",{ascending:false})
 ]);setTenants((t.data||[])as Tenant[]);setLeases((l.data||[])as unknown as Lease[]);setMessages((m.data||[])as unknown as Msg[]);setError(t.error?.message||l.error?.message||m.error?.message||"")}
 useEffect(()=>{load()},[]);
 function leaseLabel(id:string){const l=leases.find(x=>x.id===id);return l?`${l.units?.properties?.name||"Property"} · ${l.units?.unit_label||"Unit"}`:"Lease"}
 async function processInbound(e:FormEvent){e.preventDefault();setBusy(true);setError("");setDraft("");let category="general",summary="",reply="";
   try{
     const context={tenant:tenants.find(t=>t.id===form.tenant_id)?.full_name||null,lease:form.lease_id?leaseLabel(form.lease_id):null,channel:form.channel};
     const analysis=await askRentPilot("property_inbox_classify",`Classify and summarize this tenant message. Return concise JSON with category, summary, urgency (routine|high|emergency): ${form.body}`,context);
     let parsed:any;try{parsed=JSON.parse(String(analysis.text).replace(/^\`\`\`json\s*|\s*\`\`\`$/g,""))}catch{parsed={category:"general",summary:analysis.text}}
     category=parsed.category||"general";summary=parsed.summary||analysis.text||"";
     const drafted=await askRentPilot("tenant_reply_draft",`Draft a short professional reply to this tenant message: ${form.body}`,{...context,category,summary});
     reply=drafted.text||"";
   }catch(err:any){summary="AI unavailable. Message saved for manual review.";reply=""}
   const{data,error}=await supabase.from("messages").insert({owner_id:session.user.id,tenant_id:form.tenant_id||null,lease_id:form.lease_id||null,direction:"inbound",channel:form.channel,body:form.body,category,ai_summary:summary}).select("id").single();
   if(error){setBusy(false);return setError(error.message)}
   if(summary)await supabase.from("ai_actions").insert({owner_id:session.user.id,action_type:"inbox_analysis",entity_type:"message",entity_id:data.id,status:"completed",summary});
   setDraft(reply);setForm({...form,body:""});setBusy(false);load()
 }
 async function sendDraft(){if(!draft.trim())return;setBusy(true);const{error}=await supabase.from("messages").insert({owner_id:session.user.id,tenant_id:form.tenant_id||null,lease_id:form.lease_id||null,direction:"outbound",channel:form.channel,body:draft,category:"reply",ai_summary:"AI-assisted draft approved by landlord."});if(error)setError(error.message);else{setDraft("");load()}setBusy(false)}
 return <section className="panel-card"><div className="section-head"><div><p className="eyebrow">Tenant communication</p><h2>Property Inbox</h2></div></div>{error&&<p className="form-message error">{error}</p>}
 <div className="maintenance-layout"><div className="maintenance-forms"><form className="auth-form setup-form" onSubmit={processInbound}><h3>Log tenant message</h3><label>Tenant<select value={form.tenant_id} onChange={e=>setForm({...form,tenant_id:e.target.value,lease_id:""})}><option value="">Unknown / unassigned</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label><label>Lease<select value={form.lease_id} onChange={e=>setForm({...form,lease_id:e.target.value})}><option value="">No lease selected</option>{leases.filter(l=>!form.tenant_id||l.tenant_id===form.tenant_id).map(l=><option key={l.id} value={l.id}>{leaseLabel(l.id)}</option>)}</select></label><label>Channel<select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}><option value="app">App</option><option value="sms">SMS</option><option value="email">Email</option><option value="phone">Phone</option></select></label><label>Message<textarea required value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder="Paste or type the tenant's message"/></label><button className="primary-btn" disabled={busy}>{busy?"AI is analyzing...":"Save + AI analyze"}</button></form>{draft&&<div className="setup-form"><h3>AI reply draft</h3><textarea value={draft} onChange={e=>setDraft(e.target.value)} /><div className="maintenance-actions"><button className="primary-btn" onClick={sendDraft} disabled={busy}>Approve & save reply</button><button className="ghost-btn" onClick={()=>setDraft("")}>Discard</button></div></div>}</div>
 <div className="request-list">{messages.length?messages.map(m=><article className="maintenance-card" key={m.id}><div className="maintenance-card-top"><div><span className="pill">{m.direction}</span><h3>{m.tenants?.full_name||"Unassigned tenant"}</h3><p>{m.leases?.units?.properties?.name||""}{m.leases?.units?.unit_label?` · ${m.leases.units.unit_label}`:""} · {m.channel}</p></div>{m.category&&<span className="pill">{m.category}</span>}</div><p className="request-description">{m.body}</p>{m.ai_summary&&<div className="ai-summary"><b>AI summary</b><span>{m.ai_summary}</span></div>}</article>):<div className="empty-inline"><h3>No messages yet</h3><p>Log the first tenant message and RentPilot will categorize, summarize, and draft a response.</p></div>}</div></div></section>
}