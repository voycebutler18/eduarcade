import {FormEvent,useEffect,useState} from 'react';
import {paymentApi} from '../lib/ai';

type ThreadMessage={channel:string;direction:string;body:string;subject?:string|null;topic?:string|null;resolution_type?:string|null;created_at:string};

export function ResidentUnifiedInbox(){
 const[messages,setMessages]=useState<ThreadMessage[]>([]),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){try{const data=await paymentApi('/api/resident/thread-history',{},'GET');setMessages((data?.messages||[]) as ThreadMessage[])}catch(e:any){setError(e?.message||'Unable to load your NOVA inbox')}}
 useEffect(()=>{load()},[]);
 async function send(e:FormEvent){e.preventDefault();const q=text.trim();if(!q||busy)return;setBusy(true);setError('');setText('');try{const out=await paymentApi('/api/resident/nova',{message:q});if(!out?.handled)await paymentApi('/api/resident/concierge',{message:q,history:messages.slice(-12).map(m=>({role:m.direction==='inbound'?'user':'assistant',content:m.body})),photos:[]});await load()}catch(e:any){setError(e?.message||'Unable to send your message')}finally{setBusy(false)}}
 return <section style={{marginTop:12,padding:'14px',background:'white',border:'1px solid #dfe7df',borderRadius:14}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
   <div><p className="eyebrow" style={{marginBottom:3}}>Resident communications</p><h3 style={{margin:'0 0 4px'}}>NOVA Inbox</h3><p className="muted" style={{margin:0}}>Email and portal conversations stay together here.</p></div>
   <div style={{fontSize:12,textAlign:'right'}}><b>Email NOVA</b><br/><span style={{color:'#5e6d62'}}>nova@ydokibe.resend.app</span></div>
  </div>
  {error&&<p className="form-message error">{error}</p>}
  <div style={{display:'flex',flexDirection:'column',gap:9,maxHeight:360,overflowY:'auto',padding:'14px 2px'}}>
   {messages.length?messages.map((m,i)=>{const mine=m.direction==='inbound';return <div key={`${m.created_at}-${i}`} style={{alignSelf:mine?'flex-end':'flex-start',maxWidth:'86%',padding:'10px 12px',border:'1px solid #d9dfda',borderRadius:14,background:mine?'#f2f6f2':'#fbfcfb'}}><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><b>{mine?'You':'NOVA'}</b><small style={{textTransform:'capitalize'}}>{m.channel||'portal'}</small>{m.topic&&<small>• {m.topic.replaceAll('_',' ')}</small>}</div><div style={{marginTop:4,whiteSpace:'pre-wrap'}}>{m.body}</div><small style={{display:'block',marginTop:5,color:'#6a756c'}}>{new Date(m.created_at).toLocaleString()}</small></div>}) : <div className="nova-empty"><b>No messages yet</b><p>Ask NOVA here or email nova@ydokibe.resend.app. Both will appear in this same inbox.</p></div>}
  </div>
  <form className="auth-form" onSubmit={send} style={{marginTop:8}}><textarea rows={3} value={text} onChange={e=>setText(e.target.value)} placeholder="Message NOVA…"/><button className="primary-btn" disabled={busy||!text.trim()}>{busy?'Sending…':'Send to NOVA'}</button></form>
 </section>
}
