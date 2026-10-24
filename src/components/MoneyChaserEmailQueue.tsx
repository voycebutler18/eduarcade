import {useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";
import {moneyChaserSend} from "../lib/ai";

type BusinessRow={id:string;debtor_id:string;reference:string|null;amount_outstanding:number;due_date:string;state:string};
type Debtor={id:string;display_name:string;email:string|null};
type RentRow={id:string;tenant_id:string;balance:number;due_date:string;reason:string;email_sent_at:string|null;email_delivery_status:string|null;tenants?:{full_name:string;email:string|null}|null};
type Communication={receivable_id:string;status:string;occurred_at:string;provider_message_id:string|null};

export function MoneyChaserEmailQueue({session,scope}:{session:Session;scope:"property"|"business"}){
 const[rows,setRows]=useState<any[]>([]),[busy,setBusy]=useState<string|null>(null),[bulkBusy,setBulkBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function load(){
  setError("");
  if(scope==="property"){
   await supabase.rpc("refresh_rent_followup_queue");
   const{data,error}=await supabase.from("rent_followup_queue").select("id,tenant_id,balance,due_date,reason,email_sent_at,email_delivery_status,tenants(full_name,email)").eq("owner_id",session.user.id).eq("status","sent").order("generated_at",{ascending:false}).limit(50);
   if(error)return setError(error.message);setRows((data||[])as unknown as RentRow[]);return;
  }
  const[{data:r,error:rErr},{data:d,error:dErr},{data:c,error:cErr}]=await Promise.all([
   supabase.from("money_chaser_receivables").select("id,debtor_id,reference,amount_outstanding,due_date,state").eq("owner_id",session.user.id).gt("amount_outstanding",0).not("state","in",'(paid,paused,disputed)').order("due_date"),
   supabase.from("money_chaser_debtors").select("id,display_name,email").eq("owner_id",session.user.id),
   supabase.from("money_chaser_communications").select("receivable_id,status,occurred_at,provider_message_id").eq("owner_id",session.user.id).eq("direction","outbound").eq("channel","email").order("occurred_at",{ascending:false})
  ]);
  if(rErr||dErr||cErr)return setError(rErr?.message||dErr?.message||cErr?.message||"");
  const debtorMap=new Map(((d||[])as Debtor[]).map(x=>[x.id,x])),commMap=new Map<string,Communication>();
  for(const x of (c||[])as Communication[])if(!commMap.has(x.receivable_id))commMap.set(x.receivable_id,x);
  setRows(((r||[])as BusinessRow[]).map(x=>({...x,debtor:debtorMap.get(x.debtor_id),communication:commMap.get(x.id)||null})));
 }
 useEffect(()=>{load()},[scope]);
 async function send(id:string){setBusy(id);setError("");setNotice("");try{const out=await moneyChaserSend(scope==="property"?"rent":"business",id);setNotice(`Email sent to ${out.to}.`);await load()}catch(e:any){setError(e?.message||"Unable to send email")}finally{setBusy(null)}}
 async function sendAll(){setBulkBusy(true);setError("");setNotice("");const eligible=rows.filter((x:any)=>scope==="property"?Boolean(x.tenants?.email&&!x.email_sent_at):Boolean(x.debtor?.email&&!x.communication));let sent=0,failed=0;for(const x of eligible){try{await moneyChaserSend(scope==="property"?"rent":"business",x.id);sent++}catch{failed++}}setBulkBusy(false);setNotice(`${sent} reminder${sent===1?"":"s"} sent${failed?` · ${failed} could not be sent`:""}.`);await load()}
 const eligibleCount=rows.filter((x:any)=>scope==="property"?Boolean(x.tenants?.email&&!x.email_sent_at):Boolean(x.debtor?.email&&!x.communication)).length;
 function statusLabel(x:any){if(scope==="property")return x.email_delivery_status||"sent";return x.communication?.status||null}
 const emptyCopy=scope==="property"?"No past-due rent balances are waiting for an email reminder.":"No eligible overdue business balances are waiting for an email reminder.";
 return <section className="panel-card" style={{marginTop:16}}><div className="section-head"><div><p className="eyebrow">Real inbox delivery</p><h2>Money Chaser email queue</h2><p className="muted">Money Chaser prepares factual reminders from verified overdue balances. Delivery status updates automatically from Resend after each email is sent.</p></div><div className="maintenance-actions"><span className="pill">RESEND CONNECTED</span><button className="primary-btn" disabled={bulkBusy||!eligibleCount} onClick={sendAll}>{bulkBusy?"Sending all...":`Send all eligible (${eligibleCount})`}</button></div></div>{error&&<p className="form-message error">{error}</p>}{notice&&<p className="form-message">{notice}</p>}<div className="record-list">{rows.length?rows.map((x:any)=>scope==="property"?<article key={x.id}><div><b>{x.tenants?.full_name||"Resident"}</b><small>{x.tenants?.email||"No email address"}</small><small>{x.reason} · Due {x.due_date}</small></div><div className="record-right"><b>${Number(x.balance).toFixed(2)}</b>{x.email_sent_at?<span className={['bounced','complained','failed'].includes(statusLabel(x))?"pill warn":"pill"}>{statusLabel(x)}</span>:<button className="primary-btn" disabled={busy===x.id||bulkBusy||!x.tenants?.email} onClick={()=>send(x.id)}>{busy===x.id?"Sending...":"Email reminder"}</button>}</div></article>:<article key={x.id}><div><b>{x.debtor?.display_name||"Customer"}</b><small>{x.debtor?.email||"No email address"}</small><small>{x.reference||"Invoice"} · Due {x.due_date} · {String(x.state).replaceAll("_"," ")}</small></div><div className="record-right"><b>${Number(x.amount_outstanding).toFixed(2)}</b>{x.communication?<span className={['bounced','complained','failed'].includes(statusLabel(x))?"pill warn":"pill"}>{statusLabel(x)}</span>:<button className="primary-btn" disabled={busy===x.id||bulkBusy||!x.debtor?.email} onClick={()=>send(x.id)}>{busy===x.id?"Sending...":"Email reminder"}</button>}</div></article>):<p className="muted">{emptyCopy}</p>}</div></section>
}
