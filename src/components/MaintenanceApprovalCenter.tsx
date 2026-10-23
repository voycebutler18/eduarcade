import {useEffect,useState} from "react";
import {supabase} from "../lib/supabase";

type ApprovalRequest={
  id:string;
  title:string;
  priority:string;
  repair_cost:number|null;
  created_at:string;
  properties?:{name:string}|null;
};

export function MaintenanceApprovalCenter(){
  const[eligible,setEligible]=useState(false);
  const[open,setOpen]=useState(false);
  const[busyId,setBusyId]=useState<string|null>(null);
  const[items,setItems]=useState<ApprovalRequest[]>([]);
  const[error,setError]=useState("");

  async function load(){
    const{data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const{data:owned}=await supabase.from("properties").select("id").eq("owner_id",user.id).limit(1);
    if(!owned?.length){setEligible(false);return}
    setEligible(true);
    const{data,error}=await supabase
      .from("maintenance_requests")
      .select("id,title,priority,repair_cost,created_at,properties(name)")
      .eq("owner_id",user.id)
      .eq("approval_required",true)
      .not("status","in",'(completed,cancelled)')
      .order("created_at",{ascending:false});
    setError(error?.message||"");
    setItems((data||[]) as unknown as ApprovalRequest[]);
  }

  useEffect(()=>{load();const timer=setInterval(load,15000);return()=>clearInterval(timer)},[]);
  if(!eligible)return null;

  async function approve(item:ApprovalRequest){
    const{data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    setBusyId(item.id);setError("");
    const now=new Date().toISOString();
    const{error}=await supabase.from("maintenance_requests").update({approved_at:now,approval_required:false,maintenance_auto_routed_at:null,updated_at:now}).eq("id",item.id).eq("owner_id",user.id);
    if(!error){
      await supabase.from("maintenance_events").insert({maintenance_request_id:item.id,owner_id:user.id,event_type:"landlord_approval",status:"approved",note:`Landlord approved this maintenance request${item.repair_cost!=null?` at the recorded $${Number(item.repair_cost).toFixed(2)} repair amount`:""}. NOVA will automatically resume routing and vendor search.`});
    }
    setError(error?.message||"");
    setBusyId(null);
    await load();
  }

  return <>
    <button type="button" className="ghost-btn" onClick={()=>{setOpen(true);load()}} style={{position:"fixed",right:24,bottom:142,zIndex:45,boxShadow:"0 8px 28px rgba(0,0,0,.16)",background:"#fff"}}>
      Approvals{items.length?` (${items.length})`:""}
    </button>
    {open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)} style={{zIndex:81}}>
      <div className="modal" onMouseDown={e=>e.stopPropagation()} style={{maxWidth:720,maxHeight:"86vh",overflow:"auto"}}>
        <div className="section-head"><div><p className="eyebrow">Only what needs you</p><h2>Maintenance approvals</h2><p className="muted">Approve consequential decisions here. After approval, NOVA automatically resumes routing and vendor search.</p></div><button className="close-btn" onClick={()=>setOpen(false)}>×</button></div>
        {error&&<p className="form-message error">{error}</p>}
        {!items.length?<div className="empty-inline"><h3>No approvals waiting</h3><p>NOVA is handling routine maintenance operations in the background.</p></div>:<div className="request-list">{items.map(item=><article className="maintenance-card" key={item.id}><div className="maintenance-card-top"><div><span className={item.priority==="emergency"?"priority emergency":item.priority==="high"?"priority high":"priority"}>{item.priority}</span><h3>{item.title}</h3><p>{item.properties?.name||"Property"}</p><small>Submitted {new Date(item.created_at).toLocaleString()}</small></div><span className="pill">approval required</span></div><p><b>Recorded repair amount:</b> {item.repair_cost==null?"Not entered yet":`$${Number(item.repair_cost).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}</p><div className="maintenance-actions"><button className="primary-btn" disabled={busyId===item.id} onClick={()=>approve(item)}>{busyId===item.id?"Handing back to NOVA...":"Approve & let NOVA handle it"}</button></div></article>)}</div>}
      </div>
    </div>}
  </>;
}
