import {useEffect,useMemo,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "../lib/supabase";

type Property={id:string;name:string};
type Lease={id:string;tenant_id:string;tenants?:{full_name:string}|null;units?:{unit_label:string;property_id:string}|null};
type Doc={id:string;name:string;document_type:string;created_at:string;lease_id?:string;property_id?:string;visible_to_resident?:boolean;storage_path:string};

export function DocumentVault({session}:{session:Session}){
 const[properties,setProperties]=useState<Property[]>([]),[leases,setLeases]=useState<Lease[]>([]),[leaseDocs,setLeaseDocs]=useState<Doc[]>([]),[propertyDocs,setPropertyDocs]=useState<Doc[]>([]);
 const[selectedLeaseId,setSelectedLeaseId]=useState(""),[propertyTarget,setPropertyTarget]=useState(""),[mode,setMode]=useState<"tenants"|"property">("tenants");
 const[type,setType]=useState("addendum"),[visible,setVisible]=useState(true),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");

 async function load(){
  const[p,l,ld,pd]=await Promise.all([
   supabase.from("properties").select("id,name").order("name"),
   supabase.from("leases").select("id,tenant_id,tenants(full_name),units(unit_label,property_id)").eq("status","active"),
   supabase.from("lease_documents").select("id,lease_id,name,document_type,created_at,visible_to_resident,storage_path").order("created_at",{ascending:false}),
   supabase.from("property_documents").select("id,property_id,name,document_type,created_at,storage_path").order("created_at",{ascending:false})
  ]);
  setProperties((p.data||[])as Property[]);setLeases((l.data||[])as unknown as Lease[]);setLeaseDocs((ld.data||[])as Doc[]);setPropertyDocs((pd.data||[])as Doc[])
 }
 useEffect(()=>{load()},[]);

 const propertyMap=useMemo(()=>new Map(properties.map(p=>[p.id,p.name])),[properties]);
 const selectedLease=leases.find(l=>l.id===selectedLeaseId)||null;
 const selectedLeaseDocs=leaseDocs.filter(d=>d.lease_id===selectedLeaseId);
 const selectedPropertyDocs=propertyDocs.filter(d=>d.property_id===propertyTarget);
 function leaseLabel(l:Lease){return `${l.tenants?.full_name||"Resident"} · Unit ${l.units?.unit_label||"—"} · ${propertyMap.get(l.units?.property_id||"")||"Property"}`}

 async function uploadLease(){
  if(!file||!selectedLeaseId)return;setBusy(true);setMessage("");
  try{const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${session.user.id}/${selectedLeaseId}/${crypto.randomUUID()}-${safe}`;const u=await supabase.storage.from("lease-documents").upload(path,file);if(u.error)throw u.error;const r=await supabase.from("lease_documents").insert({owner_id:session.user.id,lease_id:selectedLeaseId,name:file.name,storage_path:path,document_type:type,visible_to_resident:visible,mime_type:file.type,file_size:file.size});if(r.error)throw r.error;setFile(null);setMessage("Document added to this tenant.");await load()}catch(e){setMessage(e instanceof Error?e.message:"Unable to upload document")}finally{setBusy(false)}
 }
 async function uploadProperty(){
  if(!file||!propertyTarget)return;setBusy(true);setMessage("");
  try{const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=`property/${session.user.id}/${propertyTarget}/${crypto.randomUUID()}-${safe}`;const u=await supabase.storage.from("lease-documents").upload(path,file);if(u.error)throw u.error;const r=await supabase.from("property_documents").insert({owner_id:session.user.id,property_id:propertyTarget,name:file.name,storage_path:path,document_type:type,mime_type:file.type,file_size:file.size});if(r.error)throw r.error;setFile(null);setMessage("Property document saved securely.");await load()}catch(e){setMessage(e instanceof Error?e.message:"Unable to upload document")}finally{setBusy(false)}
 }
 async function openDoc(d:Doc){const s=await supabase.storage.from("lease-documents").createSignedUrl(d.storage_path,300);if(s.data?.signedUrl)window.open(s.data.signedUrl,"_blank")}

 return <section className="panel-card">
  <div className="section-head"><div><p className="eyebrow">Secure records</p><h2>Document & lease vault</h2><p className="muted">Documents are organized by tenant, unit and property so you can open one resident record instead of searching through a flat file list.</p></div></div>
  <div className="subtabs" style={{marginBottom:18}}><button className={mode==="tenants"?"active":""} onClick={()=>{setMode("tenants");setMessage("")}}>Tenant documents</button><button className={mode==="property"?"active":""} onClick={()=>{setMode("property");setMessage("")}}>Property documents</button></div>

  {mode==="tenants"&&!selectedLease&&<div><div className="section-head"><div><h3>Tenants</h3><p className="muted">Select a tenant to view or add documents linked only to that lease.</p></div></div><div className="record-list">{leases.length?leases.map(l=>{const count=leaseDocs.filter(d=>d.lease_id===l.id).length;return <article key={l.id} style={{cursor:"pointer"}} onClick={()=>{setSelectedLeaseId(l.id);setFile(null);setMessage("")}}><div><b>{l.tenants?.full_name||"Resident"}</b><small>Unit {l.units?.unit_label||"—"}</small><small>{propertyMap.get(l.units?.property_id||"")||"Property"}</small></div><div className="record-right"><span className="pill">{count} document{count===1?"":"s"}</span><button className="primary-btn" onClick={e=>{e.stopPropagation();setSelectedLeaseId(l.id)}}>Open record</button></div></article>}):<p className="muted">No active tenant leases found.</p>}</div></div>}

  {mode==="tenants"&&selectedLease&&<div><div className="section-head"><div><button className="ghost-btn" onClick={()=>{setSelectedLeaseId("");setFile(null);setMessage("")}}>← All tenants</button><h2 style={{marginTop:12}}>{selectedLease.tenants?.full_name||"Resident"}</h2><p className="muted">Unit {selectedLease.units?.unit_label||"—"} · {propertyMap.get(selectedLease.units?.property_id||"")||"Property"}</p></div><span className="pill">{selectedLeaseDocs.length} DOCUMENT{selectedLeaseDocs.length===1?"":"S"}</span></div><div className="maintenance-layout"><div className="maintenance-forms"><div className="auth-form setup-form"><h3>Add document for this tenant</h3><label>Document type<select value={type} onChange={e=>setType(e.target.value)}><option value="lease">Lease</option><option value="addendum">Addendum</option><option value="renewal">Renewal</option><option value="notice">Notice</option><option value="inspection">Inspection</option><option value="insurance">Insurance</option><option value="other">Other</option></select></label><label className="check-row"><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/>Show this document in resident portal</label><input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="primary-btn" disabled={busy||!file} onClick={uploadLease}>{busy?"Uploading...":"Add document"}</button>{message&&<p className="form-message">{message}</p>}</div></div><div className="request-list"><h3>Documents</h3>{selectedLeaseDocs.length?selectedLeaseDocs.map(d=><article className="maintenance-card" key={d.id}><div><b>{d.name}</b><p>{d.document_type} · {d.visible_to_resident?"Resident can view":"Landlord only"}</p></div><button className="ghost-btn" onClick={()=>openDoc(d)}>Open</button></article>):<p className="muted">No documents have been added for this tenant yet.</p>}</div></div></div>}

  {mode==="property"&&<div className="maintenance-layout"><div className="maintenance-forms"><div className="auth-form setup-form"><h3>Property records</h3><label>Property<select value={propertyTarget} onChange={e=>{setPropertyTarget(e.target.value);setFile(null);setMessage("")}}><option value="">Choose property...</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Document type<select value={type} onChange={e=>setType(e.target.value)}><option value="inspection">Inspection</option><option value="insurance">Insurance</option><option value="tax">Tax record</option><option value="other">Other</option></select></label><input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="primary-btn" disabled={busy||!file||!propertyTarget} onClick={uploadProperty}>{busy?"Uploading...":"Add property document"}</button>{message&&<p className="form-message">{message}</p>}</div></div><div className="request-list"><h3>{propertyTarget?propertyMap.get(propertyTarget):"Property documents"}</h3>{propertyTarget?(selectedPropertyDocs.length?selectedPropertyDocs.map(d=><article className="maintenance-card" key={d.id}><div><b>{d.name}</b><p>{d.document_type} · Private property record</p></div><button className="ghost-btn" onClick={()=>openDoc(d)}>Open</button></article>):<p className="muted">No documents have been added for this property yet.</p>):<p className="muted">Choose a property to view its private records.</p>}</div></div>}
 </section>
}
