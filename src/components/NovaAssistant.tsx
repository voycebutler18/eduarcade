import {FormEvent,useEffect,useMemo,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";
import {askRentPilot} from "../lib/ai";

type Notice={id:string;type:string;title:string;body:string;created_at:string;entity_type?:string|null;entity_id?:string|null};
type Action={id:string;action_type:string;status:string;summary:string;created_at:string};

export function NovaAssistant({session,onOpenAI,onOpenInbox}:{session:Session;onOpenAI:()=>void;onOpenInbox:(tenantId?:string)=>void}){
 const[open,setOpen]=useState(false);
 const[tab,setTab]=useState<"feed"|"chat">("feed");
 const[notices,setNotices]=useState<Notice[]>([]);
 const[actions,setActions]=useState<Action[]>([]);
 const[question,setQuestion]=useState("");
 const[chat,setChat]=useState<{role:"user"|"nova";text:string}[]>([]);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState("");
 const[feedError,setFeedError]=useState("");
 const[lastSeen,setLastSeen]=useState(()=>localStorage.getItem("mendlyx_nova_seen")||localStorage.getItem("rentpilot_nova_seen")||"1970-01-01T00:00:00.000Z");

 async function load(){
  try{
   const[n,a]=await Promise.all([
    supabase.from("notifications").select("id,type,title,body,created_at,entity_type,entity_id").order("created_at",{ascending:false}).limit(60),
    supabase.from("ai_actions").select("id,action_type,status,summary,created_at").order("created_at",{ascending:false}).limit(40)
   ]);
   if(n.error)throw n.error;
   if(a.error)throw a.error;
   setNotices((n.data||[])as Notice[]);
   setActions((a.data||[])as Action[]);
   setFeedError("");
  }catch(e:any){
   console.warn("NOVA live-feed refresh failed",e);
   setFeedError("NOVA briefly lost its live connection. Reconnecting…");
  }
 }

 useEffect(()=>{
  load();
  const timer=window.setInterval(load,30000);
  const onOnline=()=>load();
  window.addEventListener("online",onOnline);
  const channel=supabase.channel("nova-live")
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"owner_id=eq."+session.user.id},()=>load())
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"ai_actions",filter:"owner_id=eq."+session.user.id},()=>load())
   .subscribe(status=>{
    if(status==="SUBSCRIBED")setFeedError("");
    if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")setFeedError("NOVA briefly lost its live connection. Reconnecting…");
   });
  return()=>{
   window.clearInterval(timer);
   window.removeEventListener("online",onOnline);
   supabase.removeChannel(channel);
  }
 },[session.user.id]);

 const unread=useMemo(()=>notices.filter(n=>n.created_at>lastSeen).length,[notices,lastSeen]);
 function markSeen(){const now=new Date().toISOString();localStorage.setItem("mendlyx_nova_seen",now);setLastSeen(now)}
 async function openNoticeInbox(n:Notice){
  try{
   if(n.entity_type==="maintenance_request"&&n.entity_id){
    const{data,error}=await supabase.from("maintenance_requests").select("tenant_id").eq("id",n.entity_id).maybeSingle();
    if(error)throw error;
    setOpen(false);
    onOpenInbox(data?.tenant_id||undefined);
    window.setTimeout(()=>{
     const url=new URL(window.location.href);
     url.searchParams.set("maintenance",n.entity_id!);
     window.history.replaceState({},"",url);
     window.dispatchEvent(new PopStateEvent("popstate"));
    },0);
    return;
   }
  }catch(e:any){setError(e?.message||"Unable to open resident inbox")}
  setOpen(false);onOpenInbox();
 }

 async function snapshot(){
  const[p,u,t,l,c,pay,pr,m,msg,fu]=await Promise.all([
   supabase.from("properties").select("id,name,city,state"),
   supabase.from("units").select("id,property_id,unit_label,monthly_rent,status,properties(name)"),
   supabase.from("tenants").select("id,full_name,email,phone"),
   supabase.from("leases").select("id,tenant_id,unit_id,monthly_rent,due_day,status,start_date,end_date,tenants(full_name),units(unit_label,properties(name))"),
   supabase.from("rent_charges").select("id,lease_id,due_date,amount,status"),
   supabase.from("payments").select("id,lease_id,rent_charge_id,amount,paid_at"),
   supabase.from("payment_promises").select("id,lease_id,promised_amount,promised_date,status"),
   supabase.from("maintenance_requests").select("id,title,description,priority,status,ai_summary,property_id,unit_id,tenant_id").neq("status","cancelled"),
   supabase.from("messages").select("id,direction,channel,body,category,created_at,tenant_id,lease_id").order("created_at",{ascending:false}).limit(100),
   supabase.from("rent_followup_queue").select("id,lease_id,tenant_id,reason,balance,due_date,status,message_body,generated_at,sent_at").order("generated_at",{ascending:false}).limit(100)
  ]);
  const first=[p,u,t,l,c,pay,pr,m,msg,fu].find(x=>x.error);if(first?.error)throw first.error;
  return{properties:p.data||[],units:u.data||[],tenants:t.data||[],leases:l.data||[],rent_charges:c.data||[],payments:pay.data||[],payment_promises:pr.data||[],maintenance_requests:m.data||[],messages:msg.data||[],followups:fu.data||[]}
 }

 async function ask(e:FormEvent){
  e.preventDefault();const q=question.trim();if(!q||busy)return;
  setQuestion("");setChat(x=>[...x,{role:"user",text:q}]);setBusy(true);setError("");
  try{
   const data=await snapshot();
   const out=await askRentPilot("nova_supervisor_chat","Answer using ONLY supplied live Mendlyx records. Never invent actions, dates, fees, lease terms or legal requirements. Keep it concise and operational. User: "+q,{portfolio:data,notifications:notices.slice(0,30),ai_actions:actions.slice(0,20)});
   setChat(x=>[...x,{role:"nova",text:out.text||"I could not produce a verified answer."}]);
  }catch(e:any){setError(e.message||"NOVA is unavailable")}
  finally{setBusy(false)}
 }

 return <>
  <button className="nova-launcher" onClick={()=>{setOpen(v=>!v);markSeen()}} aria-label="Open NOVA"><span className="nova-orb">N</span><span className="nova-launch-copy"><b>NOVA</b><small>{unread?(unread+" new update"+(unread===1?"":"s")):"Property copilot"}</small></span>{unread>0&&<span className="nova-badge">{unread>9?"9+":unread}</span>}</button>
  {open&&<aside className="nova-drawer">
   <header className="nova-head"><div><span className="nova-kicker">Mendlyx autonomous assistant</span><h3>NOVA</h3><p>Watching leases, payments, maintenance and system activity.</p></div><button onClick={()=>setOpen(false)}>×</button></header>
   <div className="nova-tabs"><button className={tab==="feed"?"active":""} onClick={()=>{setTab("feed");markSeen()}}>Updates{unread>0&&<span>{unread}</span>}</button><button className={tab==="chat"?"active":""} onClick={()=>setTab("chat")}>Chat</button></div>
   {error&&<div className="nova-error">{error}</div>}
   {tab==="feed"?<div className="nova-feed">
    {feedError&&<div className="nova-error">{feedError} <button type="button" onClick={load}>Retry now</button></div>}
    {notices.length?notices.map(n=><article className="nova-card" key={n.id}><div className="nova-card-top"><span className="nova-type">{n.type?.replaceAll("_"," ")||"update"}</span><time>{new Date(n.created_at).toLocaleString()}</time></div><b>{n.title}</b><p>{n.body}</p>{n.type==="maintenance"&&<button onClick={()=>openNoticeInbox(n)}>Open {n.body?.split(" · ")[0]||"resident"} inbox</button>}</article>):<div className="nova-empty"><b>No NOVA updates yet</b><p>Verified actions and alerts will appear here automatically.</p></div>}
    {actions.length>0&&<button className="nova-full-activity" onClick={onOpenAI}>View full AI activity →</button>}
   </div>:<div className="nova-chat"><div className="nova-chat-scroll">{chat.length?chat.map((m,i)=><div key={i} className={m.role==="user"?"nova-msg user":"nova-msg"}><b>{m.role==="user"?"You":"NOVA"}</b><p>{m.text}</p></div>):<div className="nova-empty"><b>Ask NOVA anything about Mendlyx</b><p>Try “What needs my attention today?”</p></div>}{busy&&<div className="nova-thinking">NOVA is checking live records…</div>}</div><form className="nova-compose" onSubmit={ask}><textarea rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about payments, leases, residents, maintenance…"/><button disabled={busy||!question.trim()}>Ask NOVA</button></form></div>}
  </aside>}
 </>
}
