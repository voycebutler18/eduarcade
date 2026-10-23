import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
type Sub={plan_code:string;annual_amount_cents:number;status:string;trial_ends_at:string;invoice_sent_at?:string|null;invoice_due_at?:string|null;invoice_status?:string|null};
const labels:Record<string,string>={owner:'Owner',growth:'Growth',portfolio:'Portfolio',scale:'Scale'};
export function SubscriptionGate({children}:{children:React.ReactNode}){
 const[loading,setLoading]=useState(true),[sub,setSub]=useState<Sub|null>(null);
 async function load(){const{data}=await supabase.from('operator_subscriptions').select('plan_code,annual_amount_cents,status,trial_ends_at,invoice_sent_at,invoice_due_at,invoice_status').maybeSingle();setSub(data as Sub|null);setLoading(false)}
 useEffect(()=>{load()},[]);
 if(loading)return <div className="loading-screen">Checking RentPilot access...</div>;
 if(!sub)return <>{children}</>;
 const trialEnd=new Date(sub.trial_ends_at).getTime(),trialValid=['trialing','pending_billing_setup'].includes(sub.status)&&trialEnd>Date.now();
 if(sub.status==='active')return <>{children}</>;\n const days=Math.max(0,Math.ceil((trialEnd-Date.now())/86400000));\n if(trialValid)return <>{days<=7&&<div style={{position:'sticky',top:0,zIndex:50,padding:'10px 16px',background:'#fff7d6',borderBottom:'1px solid #ead88b',fontWeight:700}}>Your RentPilot trial ends in {days} day{days===1?'':'s'}. {sub.invoice_sent_at?'Your PayPal invoice has been emailed to you.':'Your annual PayPal invoice will be sent to your account email before the trial ends.'}</div>}{children}</>;
 const amount=(sub.annual_amount_cents/100).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
 return <div className="subscription-wall"><div className="subscription-wall-card"><div className="subscription-lock">RP</div><p className="eyebrow">RentPilot billing</p><h1>{sub.invoice_sent_at?'Your annual invoice is ready':'Your 30-day free trial has ended'}</h1><p>{sub.invoice_sent_at?<>We sent your PayPal invoice for the <b>{labels[sub.plan_code]||sub.plan_code}</b> plan to your account email. Pay <b>{amount}/year</b> through PayPal's secure checkout to continue full access.</>:<>Your records are safe. Your <b>{labels[sub.plan_code]||sub.plan_code}</b> plan is <b>{amount}/year</b>. RentPilot will notify the account administrator so your PayPal invoice can be sent.</>}</p>{sub.invoice_status&&<div className="saved-card"><span>Invoice status</span><strong>{sub.invoice_status.replaceAll('_',' ')}</strong>{sub.invoice_due_at&&<small>Due {new Date(sub.invoice_due_at).toLocaleDateString()}</small>}</div>}<button className="text-btn" onClick={()=>location.reload()}>Refresh billing status</button><button className="text-btn" onClick={async()=>{await supabase.auth.signOut();location.href='/'}}>Log out</button></div></div>
}
