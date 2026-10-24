import {useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";
import {paymentApi} from "../lib/ai";

type Provider="quickbooks"|"xero"|"stripe"|"square";
type Integration={provider:Provider;status:string;external_account_name:string|null;last_synced_at:string|null;last_sync_status:string|null;last_sync_error:string|null};
const labels:Record<Provider,string>={quickbooks:"QuickBooks Online",xero:"Xero",stripe:"Stripe Invoicing",square:"Square"};
const descriptions:Record<Provider,string>={quickbooks:"Sync customers and open invoices from QuickBooks.",xero:"Sync contacts and accounts receivable from Xero.",stripe:"Sync open Stripe invoices and payment status.",square:"Sync Square customers, invoices and payment status."};

export function MoneyChaserIntegrations({session}:{session:Session}){
 const[rows,setRows]=useState<Integration[]>([]),[busy,setBusy]=useState<Provider|null>(null),[error,setError]=useState("");
 async function load(){const{data,error}=await supabase.from("money_chaser_integrations").select("provider,status,external_account_name,last_synced_at,last_sync_status,last_sync_error").eq("owner_id",session.user.id);if(error)setError(error.message);else setRows((data||[]) as Integration[])}
 useEffect(()=>{load()},[]);
 function row(provider:Provider){return rows.find(x=>x.provider===provider)}
 async function connect(provider:Provider){setBusy(provider);setError("");try{const out=await paymentApi(`/api/money-chaser/integrations/${provider}/connect`,{});if(out?.url)window.location.assign(out.url);else throw new Error("Connection URL was not returned")}catch(e:any){setError(e?.message||`Unable to connect ${labels[provider]}`);setBusy(null)}}
 const providers:Provider[]=["quickbooks","xero","stripe","square"];
 return <section className="panel-card" style={{marginTop:18}}><div className="section-head"><div><p className="eyebrow">Live accounting connections</p><h2>Connected receivable systems</h2><p className="muted">Once connected, these providers can feed verified customer balances into the same Money Chaser receivables pipeline.</p></div></div>{error&&<p className="form-message error">{error}</p>}<div className="record-list">{providers.map(provider=>{const x=row(provider),connected=x?.status==="connected";return <article key={provider}><div><b>{labels[provider]}</b><small>{descriptions[provider]}</small>{x?.external_account_name&&<small>{x.external_account_name}</small>}{x?.last_synced_at&&<small>Last synced {new Date(x.last_synced_at).toLocaleString()}</small>}{x?.last_sync_error&&<small>{x.last_sync_error}</small>}</div><div className="record-right"><span className={x?.status==="error"?"pill warn":"pill"}>{x?.status?.replaceAll("_"," ")||"not connected"}</span>{!connected&&<button className="primary-btn" disabled={busy===provider} onClick={()=>connect(provider)}>{busy===provider?"Opening…":"Connect"}</button>}{connected&&<button className="ghost-btn" onClick={()=>load()}>Refresh status</button>}</div></article>})}</div></section>
}
