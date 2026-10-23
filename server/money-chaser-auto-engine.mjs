import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL=process.env.SUPABASE_URL||'https://pxikovdxfgsvqvvpwnky.supabase.co';
const admin=process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;

function daysLate(dueDate){const due=new Date(`${dueDate}T12:00:00Z`);const now=new Date();return Math.max(0,Math.floor((Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-Date.UTC(due.getUTCFullYear(),due.getUTCMonth(),due.getUTCDate()))/86400000))}
function nextState(row,promises,profile){
 if(Number(row.amount_outstanding)<=0)return'paid';
 if(['disputed','paused'].includes(row.state))return row.state;
 if(promises.some(p=>p.receivable_id===row.id&&p.status==='active'))return'promise_tracked';
 const late=daysLate(row.due_date);
 if(late>=Number(profile.escalation_days||21))return'escalated';
 if(late>=Number(profile.firm_notice_days||7))return'firm_notice';
 if(late>=Number(profile.soft_nudge_days||1))return'soft_nudge';
 return'current';
}
function risk(row,promises){const late=daysLate(row.due_date),amount=Number(row.amount_outstanding||0),missed=promises.some(p=>p.receivable_id===row.id&&p.status==='missed');return Math.min(100,Math.max(0,Math.min(70,late*2)+(amount>=5000?15:amount>=1000?8:2)+(missed?15:0)))}

async function processOwner(profile){
 const ownerId=profile.owner_id,now=new Date().toISOString(),today=new Date().toISOString().slice(0,10);
 const{data:promises,error:pErr}=await admin.from('money_chaser_payment_promises').select('id,receivable_id,status,promised_date').eq('owner_id',ownerId);
 if(pErr)throw pErr;
 for(const p of promises||[]){if(p.status==='active'&&p.promised_date<today){await admin.from('money_chaser_payment_promises').update({status:'missed',updated_at:now}).eq('id',p.id);p.status='missed'}}
 const{data:rows,error:rErr}=await admin.from('money_chaser_receivables').select('id,debtor_id,amount_outstanding,due_date,state,risk_score').eq('owner_id',ownerId).not('state','eq','paid');
 if(rErr)throw rErr;
 for(const row of rows||[]){const state=nextState(row,promises||[],profile),score=risk(row,promises||[]),changed=state!==row.state||Number(score)!==Number(row.risk_score||0);if(!changed)continue;await admin.from('money_chaser_receivables').update({state,risk_score:score,next_action_at:['paid','paused','disputed'].includes(state)?null:now,paid_at:state==='paid'?now:null,updated_at:now}).eq('id',row.id);await admin.from('money_chaser_events').insert({owner_id:ownerId,receivable_id:row.id,debtor_id:row.debtor_id,event_type:'autopilot_state_change',note:`Money Chaser moved this receivable from ${row.state.replaceAll('_',' ')} to ${state.replaceAll('_',' ')}.`,metadata:{previous_state:row.state,new_state:state,risk_score:score}})}
}

async function tick(){if(!admin)return;const{data:profiles,error}=await admin.from('money_chaser_profiles').select('owner_id,autopilot_enabled,soft_nudge_days,firm_notice_days,escalation_days').eq('autopilot_enabled',true);if(error){console.error('money-chaser-profiles',error.message);return}for(const profile of profiles||[]){try{await processOwner(profile)}catch(e){console.error('money-chaser-owner',profile.owner_id,e?.message||e)}}}

export function startMoneyChaserAutoEngine(){if(!admin)return;tick().catch(e=>console.error('money-chaser-start',e));const timer=setInterval(()=>tick().catch(e=>console.error('money-chaser-loop',e)),5*60_000);timer.unref?.();console.log('Mendlyx universal Money Chaser background state engine active')}
