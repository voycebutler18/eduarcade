import {createClient} from '@supabase/supabase-js';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;

function dateOnly(d=new Date()){return d.toISOString().slice(0,10)}
function addDays(n){const d=new Date();d.setUTCDate(d.getUTCDate()+n);return dateOnly(d)}
function money(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0))}

async function addNovaNotice({ownerId,type='nova',entityType='portfolio',entityId=null,title,body}){
 if(!admin)return;
 let q=admin.from('notifications').select('id').eq('owner_id',ownerId).eq('type',type).eq('title',title).eq('body',body);
 if(entityId)q=q.eq('entity_id',entityId);else q=q.is('entity_id',null);
 const {data:existing}=await q.maybeSingle();
 if(existing)return;
 await admin.from('notifications').insert({owner_id:ownerId,type,entity_type:entityType,entity_id:entityId,title,body});
}

async function addNovaAction({ownerId,actionType,entityType='portfolio',summary,status='completed'}){
 if(!admin)return;
 const since=new Date(Date.now()-24*60*60*1000).toISOString();
 const {data:existing}=await admin.from('ai_actions').select('id').eq('owner_id',ownerId).eq('action_type',actionType).eq('summary',summary).gte('created_at',since).maybeSingle();
 if(existing)return;
 await admin.from('ai_actions').insert({owner_id:ownerId,action_type:actionType,entity_type:entityType,status,summary});
}

async function runMoneyChaser(){
 try{await admin.rpc('refresh_rent_followup_queue')}catch(e){console.error('nova money chaser',e?.message||e)}
 const since=new Date(Date.now()-70*60*1000).toISOString();
 const {data:sent}=await admin.from('rent_followup_queue').select('id,owner_id,lease_id,tenant_id,balance,due_date,status,message_body,sent_at').eq('status','sent').gte('sent_at',since);
 for(const f of sent||[]){
  const {data:t}=await admin.from('tenants').select('full_name').eq('id',f.tenant_id).maybeSingle();
  const {data:l}=await admin.from('leases').select('unit_id').eq('id',f.lease_id).maybeSingle();
  const {data:u}=l?.unit_id?await admin.from('units').select('unit_label').eq('id',l.unit_id).maybeSingle():{data:null};
  const who=t?.full_name||'Resident',unit=u?.unit_label?' · Unit '+u.unit_label:'';
  const body='RentPilot sent an automated payment follow-up to '+who+unit+' for '+money(f.balance)+' tied to the '+f.due_date+' ledger item.';
  await addNovaNotice({ownerId:f.owner_id,type:'nova_payment',entityType:'lease',entityId:f.lease_id,title:'Payment follow-up sent',body});
  await addNovaAction({ownerId:f.owner_id,actionType:'nova_payment_followup',entityType:'lease',summary:body});
 }
}

async function sendUpcomingReminders(){
 const today=dateOnly(),soon=addDays(3);
 const {data:charges,error}=await admin.from('rent_charges').select('id,owner_id,lease_id,amount,due_date,status').gte('due_date',today).lte('due_date',soon).in('status',['due','partial']).order('due_date');
 if(error)throw error;
 for(const charge of charges||[]){
  const {data:paid}=await admin.from('payments').select('amount').eq('rent_charge_id',charge.id);
  const paidTotal=(paid||[]).reduce((s,p)=>s+Number(p.amount||0),0),balance=Math.max(0,Number(charge.amount||0)-paidTotal);
  if(balance<=0)continue;
  const {data:lease}=await admin.from('leases').select('id,tenant_id,unit_id,status').eq('id',charge.lease_id).maybeSingle();
  if(!lease||lease.status!=='active')continue;
  const {data:tenant}=await admin.from('tenants').select('id,full_name').eq('id',lease.tenant_id).maybeSingle();
  if(!tenant)continue;
  const days=Math.max(0,Math.ceil((new Date(charge.due_date+'T12:00:00Z')-new Date(today+'T12:00:00Z'))/86400000));
  const category='nova_due_reminder:'+charge.id;
  const {data:already}=await admin.from('messages').select('id').eq('lease_id',lease.id).eq('category',category).maybeSingle();
  if(already)continue;
  const when=days===0?'today':days===1?'tomorrow':'in '+days+' days';
  const message='Hi '+(tenant.full_name||'there')+'. This is an automatic RentPilot reminder that '+money(balance)+' is coming due '+when+'. You can review your account and payment options in your resident portal.';
  const {error:msgErr}=await admin.from('messages').insert({owner_id:charge.owner_id,tenant_id:tenant.id,lease_id:lease.id,direction:'outbound',channel:'app',body:message,category});
  if(msgErr){console.error('nova upcoming reminder',msgErr.message);continue}
  const body='NOVA sent '+tenant.full_name+' an upcoming payment reminder for '+money(balance)+' due '+charge.due_date+'.';
  await addNovaNotice({ownerId:charge.owner_id,type:'nova_payment',entityType:'rent_charge',entityId:charge.id,title:'Upcoming payment reminder sent',body});
  await addNovaAction({ownerId:charge.owner_id,actionType:'nova_upcoming_payment_reminder',entityType:'rent_charge',summary:body});
 }
}

async function summarizeAttention(){
 const {data:owners}=await admin.from('properties').select('owner_id');
 const unique=[...new Set((owners||[]).map(x=>x.owner_id).filter(Boolean))];
 for(const ownerId of unique){
  const [{data:maint},{data:charges},{data:promises}]=await Promise.all([
   admin.from('maintenance_requests').select('id').eq('owner_id',ownerId).in('status',['open','assigned','in_progress']),
   admin.from('rent_charges').select('id,due_date,amount').eq('owner_id',ownerId).lt('due_date',dateOnly()).in('status',['due','partial']),
   admin.from('payment_promises').select('id,promised_date').eq('owner_id',ownerId).eq('status','active').lt('promised_date',dateOnly())
  ]);
  const pastDue=charges?.length||0,openMaint=maint?.length||0,missed=promises?.length||0;
  if(!pastDue&&!openMaint&&!missed)continue;
  const body='Current attention queue: '+pastDue+' past-due ledger item'+(pastDue===1?'':'s')+', '+openMaint+' open maintenance request'+(openMaint===1?'':'s')+', and '+missed+' missed payment promise'+(missed===1?'':'s')+'.';
  await addNovaAction({ownerId,actionType:'nova_portfolio_watch',summary:body});
 }
}

export async function runNovaSupervisor(){
 if(!admin){console.warn('NOVA supervisor disabled: Supabase service role missing');return}
 await runMoneyChaser();
 await sendUpcomingReminders();
 await summarizeAttention();
}

export function startNovaSupervisor(){
 if(!admin)return;
 setTimeout(()=>runNovaSupervisor().catch(e=>console.error('nova-supervisor',e)),25000);
 setInterval(()=>runNovaSupervisor().catch(e=>console.error('nova-supervisor',e)),60*60*1000);
}
