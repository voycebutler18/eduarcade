import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Choice={optional:boolean;analytics:boolean;updatedAt:string};
const key='mendlyx_cookie_consent';
export function CookieConsent(){
 const[open,setOpen]=useState(false),[manage,setManage]=useState(false),[optional,setOptional]=useState(false),[analytics,setAnalytics]=useState(false),[gpc,setGpc]=useState(false);
 useEffect(()=>{const gp=Boolean((navigator as any).globalPrivacyControl);setGpc(gp);const raw=localStorage.getItem(key);if(raw){try{const c=JSON.parse(raw);setOptional(Boolean(c.optional));setAnalytics(Boolean(c.analytics));return}catch{}}setOpen(true)},[]);
 async function save(choice:Choice){localStorage.setItem(key,JSON.stringify(choice));setOptional(choice.optional);setAnalytics(choice.analytics);setOpen(false);setManage(false);const{data}=await supabase.auth.getSession();const user=data.session?.user;if(user)await supabase.from('account_privacy_settings').upsert({user_id:user.id,optional_cookies:choice.optional,analytics_cookies:choice.analytics,sale_share_opt_out:true,gpc_observed:gpc,updated_at:choice.updatedAt},{onConflict:'user_id'})}
 const reject=()=>save({optional:false,analytics:false,updatedAt:new Date().toISOString()});
 const accept=()=>save({optional:!gpc,analytics:!gpc,updatedAt:new Date().toISOString()});
 if(!open)return <button className="cookie-settings-link" onClick={()=>setOpen(true)}>Cookie settings</button>;
 return <div className="cookie-banner" role="dialog" aria-modal="false" aria-label="Cookie choices"><div><b>Privacy choices</b><p>Mendlyx uses essential storage for sign-in, security, and core features. Optional and analytics cookies are off unless you choose them. Mendlyx does not sell personal information or use it for third-party targeted advertising.</p>{gpc&&<small>Global Privacy Control detected. Optional tracking remains off.</small>}{manage&&<div className="cookie-options"><label><span>Essential storage <small>Required for secure sign-in and core features</small></span><input type="checkbox" checked disabled/></label><label><span>Optional cookies</span><input type="checkbox" checked={optional&&!gpc} disabled={gpc} onChange={e=>setOptional(e.target.checked)}/></label><label><span>Analytics cookies</span><input type="checkbox" checked={analytics&&!gpc} disabled={gpc} onChange={e=>setAnalytics(e.target.checked)}/></label></div>}</div><div className="cookie-actions">{manage?<><button className="ghost-btn" onClick={reject}>Reject optional</button><button className="primary-btn" onClick={()=>save({optional:!gpc&&optional,analytics:!gpc&&analytics,updatedAt:new Date().toISOString()})}>Save choices</button></>:<><button className="ghost-btn" onClick={reject}>Essential only</button><button className="ghost-btn" onClick={()=>setManage(true)}>Manage</button><button className="primary-btn" onClick={accept} disabled={gpc}>Accept optional</button></>}</div></div>
}

export function UnsubscribePage({token}:{token:string}){
 const[state,setState]=useState<'working'|'done'|'error'>('working');
 useEffect(()=>{(async()=>{const{error}=await supabase.rpc('unsubscribe_optional_emails',{token_input:token});setState(error?'error':'done')})()},[token]);
 return <div className="unsubscribe-page"><div className="unsubscribe-card"><div className="logo-mark">M</div><p className="eyebrow">Mendlyx email preferences</p><h1>{state==='working'?'Updating preferences…':state==='done'?'You’re unsubscribed from optional emails':'We could not update that link'}</h1><p>{state==='done'?'Marketing and optional product-news emails are now off. Transactional messages about your account, property, lease, payments, maintenance, security, or requested services may still be sent when necessary.':state==='error'?'The link may be invalid or expired. Sign in to Settings to manage your preferences.':'Please wait.'}</p><a className="primary-btn" href="/?settings=1">Open Settings & Privacy</a></div></div>
}
