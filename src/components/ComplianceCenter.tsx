import {FormEvent,useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";
import {askRentPilot} from "../lib/ai";

type Property={id:string;name:string;address_line1:string;city:string;state:string;postal_code:string;country_code?:string|null;admin_area_1?:string|null;locality?:string|null};
type Inspection={id:string;property_id:string;inspection_type:string;last_inspection_date:string|null;next_due_date:string|null;status:string;frequency_months:number|null;notes:string|null};
type Alert={id:string;property_id:string;notification_type:string;title:string;body:string;due_at:string|null;read_at:string|null;created_at:string};
type Request={id:string;property_id:string;field_name:string;prompt:string;status:string};

export function ComplianceCenter({session}:{session:Session}){
 const[properties,setProperties]=useState<Property[]>([]),[items,setItems]=useState<Inspection[]>([]),[alerts,setAlerts]=useState<Alert[]>([]),[requests,setRequests]=useState<Request[]>([]);
 const[propertyId,setPropertyId]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const[profile,setProfile]=useState({property_type:"residential",year_built:"",unit_count:"1",owner_occupied:false,subsidized_program:"",has_pool:false,has_elevator:false,has_boiler:false,has_fire_suppression:false});

 async function load(){
   const[p,i,a,r]=await Promise.all([
     supabase.from("properties").select("id,name,address_line1,city,state,postal_code,country_code,admin_area_1,locality").order("name"),
     supabase.from("inspection_records").select("*").order("next_due_date",{ascending:true}),
     supabase.from("compliance_notifications").select("*").order("created_at",{ascending:false}).limit(100),
     supabase.from("compliance_data_requests").select("id,property_id,field_name,prompt,status").eq("status","open").order("created_at",{ascending:true})
   ]);
   setProperties((p.data||[]) as Property[]);setItems((i.data||[]) as Inspection[]);setAlerts((a.data||[]) as Alert[]);setRequests((r.data||[]) as Request[]);
   if(!propertyId&&p.data?.[0])setPropertyId(p.data[0].id);
   setError(p.error?.message||i.error?.message||a.error?.message||r.error?.message||"");
 }
 useEffect(()=>{load()},[]);
 useEffect(()=>{if(!propertyId)return;supabase.from("property_compliance_profiles").select("*").eq("property_id",propertyId).maybeSingle().then(({data})=>{if(data)setProfile({property_type:data.property_type||"residential",year_built:data.year_built?String(data.year_built):"",unit_count:data.unit_count?String(data.unit_count):"1",owner_occupied:Boolean(data.owner_occupied),subsidized_program:data.subsidized_program||"",has_pool:Boolean(data.has_pool),has_elevator:Boolean(data.has_elevator),has_boiler:Boolean(data.has_boiler),has_fire_suppression:Boolean(data.has_fire_suppression)})})},[propertyId]);

 async function generate(e:FormEvent){
   e.preventDefault();const p=properties.find(x=>x.id===propertyId);if(!p)return;setBusy(true);setError("");setNotice("RentPilot AI is building an operational safety schedule...");
   try{
     const pr=await supabase.from("property_compliance_profiles").upsert({owner_id:session.user.id,property_id:propertyId,property_type:profile.property_type,year_built:profile.year_built?Number(profile.year_built):null,unit_count:Number(profile.unit_count||1),owner_occupied:profile.owner_occupied,subsidized_program:profile.subsidized_program||null,has_pool:profile.has_pool,has_elevator:profile.has_elevator,has_boiler:profile.has_boiler,has_fire_suppression:profile.has_fire_suppression,updated_at:new Date().toISOString()},{onConflict:"property_id"});if(pr.error)throw pr.error;
     const out=await askRentPilot("inspection_schedule",`Build a conservative PROPERTY CONDITION inspection schedule, not legal advice. Return ONLY JSON array items with inspection_type, frequency_months, notes. Never claim a legal requirement. Property: ${JSON.stringify({...p,...profile})}`,{});
     let rows:any[];try{rows=JSON.parse(String(out.text).replace(/^\`\`\`json\s*|\s*\`\`\`$/g,""))}catch{throw new Error("AI could not structure the schedule.")}
     await supabase.from("inspection_records").delete().eq("property_id",propertyId).eq("ai_generated",true);
     const now=new Date(),payload=rows.slice(0,30).map(r=>{const months=Math.max(1,Math.min(120,Number(r.frequency_months||12))),due=new Date(now);due.setMonth(due.getMonth()+months);return{owner_id:session.user.id,property_id:propertyId,inspection_type:String(r.inspection_type||"Property condition review").slice(0,160),next_due_date:due.toISOString().slice(0,10),status:"upcoming",frequency_months:months,notes:String(r.notes||"").slice(0,1000),ai_generated:true}});
     if(payload.length){const ins=await supabase.from("inspection_records").insert(payload);if(ins.error)throw ins.error}
     setNotice("Schedule created. Legal requirements are handled separately by the verified Compliance Law Monitor.");await load();
   }catch(e){setError(e instanceof Error?e.message:"Unable to build schedule");setNotice("")}finally{setBusy(false)}
 }
 async function complete(x:Inspection){const today=new Date(),next=new Date(today);next.setMonth(next.getMonth()+Number(x.frequency_months||12));const r=await supabase.from("inspection_records").update({last_inspection_date:today.toISOString().slice(0,10),next_due_date:next.toISOString().slice(0,10),status:"upcoming",updated_at:new Date().toISOString()}).eq("id",x.id);if(r.error)setError(r.error.message);else load()}
 async function markRead(id:string){await supabase.from("compliance_notifications").update({read_at:new Date().toISOString()}).eq("id",id);load()}
 async function saveMissing(req:Request,value:string){
   const v=value.trim();if(!v)return;
   const propertyFields=["country_code","admin_area_1","locality","address_line1","postal_code"];
   if(propertyFields.includes(req.field_name)){
     const patch:any={};patch[req.field_name]=req.field_name==="country_code"?v.toUpperCase():v;
     if(req.field_name==="locality")patch.city=v;if(req.field_name==="admin_area_1")patch.state=v;
     const x=await supabase.from("properties").update(patch).eq("id",req.property_id);if(x.error)return setError(x.error.message);
   }else{
     const patch:any={owner_id:session.user.id,property_id:req.property_id,updated_at:new Date().toISOString()};patch[req.field_name]=["year_built","unit_count"].includes(req.field_name)?Number(v):v;
     const x=await supabase.from("property_compliance_profiles").upsert(patch,{onConflict:"property_id"});if(x.error)return setError(x.error.message);
   }
   await supabase.from("compliance_data_requests").update({status:"resolved",resolved_at:new Date().toISOString()}).eq("id",req.id);setNotice("Saved. The compliance monitor will re-check this property automatically.");load();
 }
 const shown=items.filter(x=>x.property_id===propertyId),shownAlerts=alerts.filter(x=>x.property_id===propertyId),shownRequests=requests.filter(x=>x.property_id===propertyId);
 return <section className="panel-card">
   <div className="section-head"><div><p className="eyebrow">Compliance operations</p><h2>Compliance & inspections</h2><p className="muted">Operational inspections are AI-assisted. Legal requirements only appear after deterministic matching to verified sources.</p></div></div>
   {error&&<p className="form-message error">{error}</p>}{notice&&<p className="form-message">{notice}</p>}
   <label>Property<select required value={propertyId} onChange={e=>setPropertyId(e.target.value)}><option value="">Choose property</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name} · {p.locality||p.city||"City needed"} · {p.admin_area_1||p.state||"Region needed"}</option>)}</select></label>
   {shownRequests.length>0&&<div className="setup-form" style={{marginTop:16}}><h3>Needs information</h3><p className="muted">RentPilot will not guess missing jurisdiction or property facts.</p>{shownRequests.map(r=><Missing key={r.id} request={r} onSave={saveMissing}/>)}</div>}
   {shownAlerts.length>0&&<div style={{marginTop:16}}><h3>Compliance Law Monitor</h3><div className="record-list">{shownAlerts.map(a=><article key={a.id}><div><b>{a.title}</b><small>{a.body}</small>{a.due_at&&<small>Due: {new Date(a.due_at).toLocaleDateString()}</small>}</div><div className="record-right"><span className="pill">{a.notification_type.replaceAll("_"," ")}</span>{!a.read_at&&<button className="ghost-btn" onClick={()=>markRead(a.id)}>Mark read</button>}</div></article>)}</div></div>}
   <div className="manager-grid" style={{marginTop:16}}>
     <form className="auth-form setup-form" onSubmit={generate}><h3>Property compliance profile</h3><label>Property type<select value={profile.property_type} onChange={e=>setProfile({...profile,property_type:e.target.value})}><option value="residential">Residential</option><option value="multifamily">Multifamily</option><option value="commercial">Commercial</option><option value="mixed">Mixed use</option></select></label><div className="form-row"><label>Year built<input type="number" value={profile.year_built} onChange={e=>setProfile({...profile,year_built:e.target.value})}/></label><label>Units<input type="number" min="1" value={profile.unit_count} onChange={e=>setProfile({...profile,unit_count:e.target.value})}/></label></div><label>Subsidized / housing program<input value={profile.subsidized_program} onChange={e=>setProfile({...profile,subsidized_program:e.target.value})}/></label>{[["owner_occupied","Owner occupied"],["has_pool","Pool"],["has_elevator","Elevator"],["has_boiler","Boiler"],["has_fire_suppression","Fire suppression / sprinkler system"]].map(([k,l])=><label key={k}><input type="checkbox" checked={(profile as any)[k]} onChange={e=>setProfile({...profile,[k]:e.target.checked})}/> {l}</label>)}<button className="primary-btn" disabled={busy||!propertyId}>{busy?"AI building schedule...":"Save + create inspection schedule"}</button></form>
     <div className="record-list">{shown.length?shown.map(x=><article key={x.id}><div><b>{x.inspection_type}</b><small>{x.last_inspection_date?`Last: ${x.last_inspection_date}`:"No inspection recorded"} · Next: {x.next_due_date||"Set date"}</small>{x.notes&&<small>{x.notes}</small>}</div><div className="record-right"><span className="pill">{x.status}</span><button className="ghost-btn" type="button" onClick={()=>complete(x)}>Mark completed</button></div></article>):<div className="empty-inline"><h3>No schedule yet</h3><p>Choose a property and create its inspection and safety schedule.</p></div>}</div>
   </div>
 </section>
}
function Missing({request,onSave}:{request:Request;onSave:(r:Request,v:string)=>void}){const[value,setValue]=useState("");return <div className="form-row"><label style={{flex:1}}>{request.prompt}<input value={value} onChange={e=>setValue(e.target.value)} placeholder={request.field_name.replaceAll("_"," ")}/></label><button className="primary-btn" type="button" onClick={()=>onSave(request,value)}>Save</button></div>}
