import {lazy,Suspense,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {MoneyChaser} from "./MoneyChaser";
import {MoneyChaserEmailQueue} from "./MoneyChaserEmailQueue";
import {MoneyChaserAuthorization} from "./MoneyChaserAuthorization";

const UniversalBusinessMoneyChaser=lazy(()=>import("./UniversalBusinessMoneyChaser").then(m=>({default:m.UniversalBusinessMoneyChaser})));
const MoneyChaserImportCenter=lazy(()=>import("./MoneyChaserImportCenter").then(m=>({default:m.MoneyChaserImportCenter})));
const MoneyChaserIntegrations=lazy(()=>import("./MoneyChaserIntegrations").then(m=>({default:m.MoneyChaserIntegrations})));

export function MoneyChaserHub({session}:{session:Session}){
 const[scope,setScope]=useState<"property"|"business">("property"),[importRefresh,setImportRefresh]=useState(0);
 return <>
  <MoneyChaserAuthorization session={session}/>
  <section className="panel-card" style={{marginBottom:16}}>
   <div className="section-head"><div><p className="eyebrow">AI Money Chaser</p><h2>Choose what money you want chased</h2><p className="muted">One recovery engine for rental income and any other business you operate.</p></div></div>
   <div className="subtabs">
    <button className={scope==="property"?"active":""} onClick={()=>setScope("property")}>Property AR</button>
    <button className={scope==="business"?"active":""} onClick={()=>setScope("business")}>Other Business AR</button>
   </div>
  </section>
  {scope==="property"?<MoneyChaser session={session}/>:<Suspense fallback={<section className="panel-card"><p>Loading business receivables...</p></section>}><UniversalBusinessMoneyChaser key={importRefresh} session={session}/><MoneyChaserImportCenter session={session} onImported={()=>setImportRefresh(x=>x+1)}/><MoneyChaserIntegrations session={session}/></Suspense>}
  <MoneyChaserEmailQueue key={`${scope}-${importRefresh}`} session={session} scope={scope}/>
 </>;
}
