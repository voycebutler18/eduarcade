import {useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {MoneyChaser} from "./MoneyChaser";
import {UniversalBusinessMoneyChaser} from "./UniversalBusinessMoneyChaser";
import {MoneyChaserEmailQueue} from "./MoneyChaserEmailQueue";
import {MoneyChaserAuthorization} from "./MoneyChaserAuthorization";
import {MoneyChaserImportCenter} from "./MoneyChaserImportCenter";

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
  {scope==="property"?<MoneyChaser session={session}/>:<><UniversalBusinessMoneyChaser key={importRefresh} session={session}/><MoneyChaserImportCenter session={session} onImported={()=>setImportRefresh(x=>x+1)}/></>} 
  <MoneyChaserEmailQueue key={`${scope}-${importRefresh}`} session={session} scope={scope}/>
 </>;
}
