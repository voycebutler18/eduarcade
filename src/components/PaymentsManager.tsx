import {useEffect,useMemo,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";
import {paymentApi} from "../lib/ai";

type Account={processor_account_id?:string|null;onboarding_status?:string;charges_enabled:boolean;payouts_enabled:boolean;details_submitted:boolean};
type Tx={id:string;amount:number;status:string;payment_method_type:string|null;created_at:string;tenant_id:string|null;lease_id:string|null;rent_charge_id:string|null};
type Charge={id:string;lease_id:string;amount:number;due_date:string;status:string};
type Lease={id:string;unit_id:string;units?:{unit_label:string;properties?:{name:string}|null}|null};
type StripeFinancials={connected:boolean;feeTotal:number;fees:{transactionId:string;fee:number;amount:number;net:number;created:string}[];payouts:{id:string;amount:number;currency:string;status:string;arrivalDate:string;createdAt:string;method:string|null}[]};

export function PaymentsManager({session}:{session:Session}){
  const[account,setAccount]=useState<Account|null>(null);
  const[tx,setTx]=useState<Tx[]>([]);
  const[charges,setCharges]=useState<Charge[]>([]);
  const[leases,setLeases]=useState<Lease[]>([]);
  const[financials,setFinancials]=useState<StripeFinancials|null>(null);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");

  async function load(){
    setLoading(true);
    let live:any=null, stripeFinancials:StripeFinancials|null=null;
    try{live=await paymentApi("/api/payments/account",undefined,"GET")}catch{}
    try{stripeFinancials=await paymentApi("/api/payments/financials",undefined,"GET")}catch{}
    const[a,t,c,l]=await Promise.all([
      supabase.from("payment_accounts").select("processor_account_id,onboarding_status,charges_enabled,payouts_enabled,details_submitted").eq("owner_id",session.user.id).maybeSingle(),
      supabase.from("payment_transactions").select("id,amount,status,payment_method_type,created_at,tenant_id,lease_id,rent_charge_id").eq("owner_id",session.user.id).order("created_at",{ascending:false}).limit(250),
      supabase.from("rent_charges").select("id,lease_id,amount,due_date,status").eq("owner_id",session.user.id).order("due_date",{ascending:false}),
      supabase.from("leases").select("id,unit_id,units(unit_label,properties(name))").eq("owner_id",session.user.id)
    ]);
    const db=a.data as Account|null;
    setAccount(db?{...db,...(live?.connected===false?{processor_account_id:null,onboarding_status:"not_started",charges_enabled:false,payouts_enabled:false,details_submitted:false}:live||{})}:db);
    setFinancials(stripeFinancials);
    setTx((t.data||[])as Tx[]);
    setCharges((c.data||[])as Charge[]);
    setLeases((l.data||[])as unknown as Lease[]);
    setLoading(false);
  }

  useEffect(()=>{load()},[]);
  const successful=useMemo(()=>tx.filter(x=>x.status==="succeeded"),[tx]);
  const collected=successful.reduce((s,x)=>s+Number(x.amount),0);
  const pending=tx.filter(x=>["created","processing","pending"].includes(x.status)).reduce((s,x)=>s+Number(x.amount),0);
  const billed=charges.reduce((s,x)=>s+Number(x.amount),0);
  const outstanding=charges.filter(x=>x.status!=="paid").reduce((s,x)=>s+Number(x.amount),0);
  const thisMonth=new Date().toISOString().slice(0,7);
  const monthCollected=successful.filter(x=>x.created_at.slice(0,7)===thisMonth).reduce((s,x)=>s+Number(x.amount),0);
  const actualFees=Number(financials?.feeTotal||0);
  const paidPayouts=(financials?.payouts||[]).filter(x=>x.status==="paid").reduce((s,x)=>s+Number(x.amount||0),0);
  const propertyTotals=useMemo(()=>{
    const leaseMap=new Map(leases.map(l=>[l.id,l]));
    const m=new Map<string,number>();
    successful.forEach(x=>{
      const name=leaseMap.get(x.lease_id||"")?.units?.properties?.name||"Unassigned";
      m.set(name,(m.get(name)||0)+Number(x.amount));
    });
    return [...m.entries()].sort((a,b)=>b[1]-a[1]);
  },[successful,leases]);

  const connected=Boolean(account?.processor_account_id);
  const ready=Boolean(account?.details_submitted&&account?.charges_enabled&&account?.payouts_enabled);
  const submitted=Boolean(account?.details_submitted);

  async function setup(){
    setBusy(true);setMessage("");
    try{
      const data=await paymentApi("/api/payments/connect");
      if(data?.url){window.location.assign(data.url);return}
      setMessage("Stripe onboarding is not available yet.");
    }catch{setMessage("Unable to open Stripe right now.")}
    finally{setBusy(false);await load()}
  }

  return <div className="payments-admin">
    <section className="panel-card">
      <div className="section-head"><div><p className="eyebrow">Financial command center</p><h2>Cash flow & payouts</h2></div><span className="pill">Stripe Connect</span></div>
      {loading?<p>Loading financials...</p>:<>
        <div className="mini-grid">
          <div className="metric"><span>Collected this month</span><strong>${monthCollected.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Successful resident payments</small></div>
          <div className="metric"><span>Total collected</span><strong>${collected.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Recorded through Stripe</small></div>
          <div className="metric"><span>Outstanding ledger</span><strong>${outstanding.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Open housing charges</small></div>
          <div className="metric"><span>Stripe fees observed</span><strong>${actualFees.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>Actual processor balance data</small></div>
          <div className="metric"><span>Paid payouts</span><strong>${paidPayouts.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>Actual connected-account payouts</small></div>
          <div className="metric"><span>In progress</span><strong>${pending.toLocaleString(undefined,{minimumFractionDigits:2})}</strong><small>Pending payment attempts</small></div>
        </div>
        <p className="muted">Gross ledger billed: ${billed.toLocaleString(undefined,{minimumFractionDigits:2})}. RentPilot shows processor fees and payouts only when Stripe returns verified values.</p>
        <div className="stripe-setup">
          <div><h3>{ready?"Stripe payouts connected":submitted?"Stripe verification pending":connected?"Finish Stripe setup":"Connect your payouts"}</h3><p>{ready?"Your account is ready to receive resident payments.":"Stripe handles identity, payment details and payout verification."}</p></div>
          {!ready&&!submitted&&<button className="primary-btn" disabled={busy} onClick={setup}>{busy?"Opening Stripe...":connected?"Finish Stripe setup":"Connect Stripe"}</button>}
          {submitted&&!ready&&<button className="ghost-btn" onClick={load}>Check status</button>}
        </div>
        {message&&<p className="form-message">{message}</p>}
      </>}
    </section>

    <section className="panel-card" style={{marginTop:16}}>
      <div className="section-head"><div><p className="eyebrow">Stripe settlement</p><h2>Recent payouts</h2></div><button className="ghost-btn" onClick={load}>Refresh</button></div>
      <div className="record-list">
        {financials?.payouts?.length?financials.payouts.map(p=><article key={p.id}><div><b>${Number(p.amount).toFixed(2)}</b><small>Expected {new Date(p.arrivalDate).toLocaleDateString()} · {p.method||"standard"}</small></div><div className="record-right"><span className={p.status==="failed"?"pill warn":"pill"}>{p.status}</span></div></article>):<p className="muted">No Stripe payouts are available yet.</p>}
      </div>
    </section>

    <section className="panel-card" style={{marginTop:16}}>
      <div className="section-head"><div><p className="eyebrow">Property performance</p><h2>Collected by property</h2></div></div>
      <div className="record-list">{propertyTotals.length?propertyTotals.map(([name,total])=><article key={name}><b>{name}</b><strong>${total.toFixed(2)}</strong></article>):<p className="muted">No successful payments yet.</p>}</div>
    </section>

    <section className="panel-card" style={{marginTop:16}}>
      <div className="section-head"><div><p className="eyebrow">Audit trail</p><h2>Payment transactions</h2></div><button className="ghost-btn" onClick={load}>Refresh</button></div>
      <div className="record-list">{tx.length?tx.map(x=><article key={x.id}><div><b>${Number(x.amount).toFixed(2)}</b><small>{x.payment_method_type==="us_bank_account"?"ACH bank account":x.payment_method_type==="card"?"Card":"Payment"} · {new Date(x.created_at).toLocaleString()}</small></div><span className={x.status==="failed"||x.status==="returned"||x.status==="disputed"?"pill warn":"pill"}>{x.status.replaceAll("_"," ")}</span></article>):<p className="muted">No payment transactions yet.</p>}</div>
    </section>
  </div>
}
