const PAYPAL_BASE=(process.env.PAYPAL_ENV||'live').toLowerCase()==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
const FRONTEND=(process.env.FRONTEND_ORIGIN||'https://rentpilot-ai.onrender.com').replace(/\/$/,'');
const PLANS={owner:{name:'RentPilot Owner',amount:'99.00'},growth:{name:'RentPilot Growth',amount:'249.00'},portfolio:{name:'RentPilot Portfolio',amount:'499.00'},scale:{name:'RentPilot Scale',amount:'799.00'}};
let tokenCache={token:'',expires:0};

async function accessToken(){
  if(tokenCache.token&&Date.now()<tokenCache.expires-60000)return tokenCache.token;
  const id=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET;
  if(!id||!secret)throw new Error('PayPal is not configured');
  const body=new URLSearchParams({grant_type:'client_credentials'});
  const r=await fetch(`${PAYPAL_BASE}/v1/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!r.ok)throw new Error(`PayPal authentication failed (${r.status})`);
  const j=await r.json();tokenCache={token:j.access_token,expires:Date.now()+Number(j.expires_in||300)*1000};return tokenCache.token;
}

async function browserSafeClientToken(){
  const id=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET;
  if(!id||!secret)throw new Error('PayPal is not configured');
  const body=new URLSearchParams();
  body.set('grant_type','client_credentials');body.set('response_type','client_token');body.append('domains[]',new URL(FRONTEND).hostname);
  const r=await fetch(`${PAYPAL_BASE}/v1/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  const t=await r.text();let j={};try{j=t?JSON.parse(t):{}}catch{}
  if(!r.ok||!j.access_token)throw new Error(j.error_description||`Unable to initialize secure card fields (${r.status})`);
  return j.access_token;
}

async function pp(path,options={}){
  const token=await accessToken();
  const r=await fetch(`${PAYPAL_BASE}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json','Prefer':'return=representation',...(options.headers||{})}});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok)throw new Error(data?.message||data?.details?.[0]?.description||`PayPal error ${r.status}`);
  return data;
}
function plusDays(date,n){const d=new Date(date);d.setUTCDate(d.getUTCDate()+n);return d}
function plusYear(date){const d=new Date(date);d.setUTCFullYear(d.getUTCFullYear()+1);return d}
async function getVault(admin,userId){const{data,error}=await admin.schema('rentpilot_internal').from('operator_payment_vault').select('*').eq('user_id',userId).maybeSingle();if(error)throw error;return data}
async function saveVault(admin,userId,token){const card=token.payment_source?.card||{};const{error}=await admin.schema('rentpilot_internal').from('operator_payment_vault').upsert({user_id:userId,provider:'paypal',payment_token_id:token.id,customer_id:token.customer?.id||null,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;return card}

async function chargeSubscription(admin,sub){
  const vault=await getVault(admin,sub.user_id);if(!vault?.payment_token_id)throw new Error('No saved payment method');
  const amount=(Number(sub.annual_amount_cents||0)/100).toFixed(2);if(Number(amount)<=0)throw new Error('Invalid subscription amount');
  const dueKey=(sub.next_billing_at||sub.trial_ends_at||new Date().toISOString()).slice(0,10);
  const requestId=`rentpilot-${sub.user_id}-${dueKey}`;
  await admin.from('operator_subscriptions').update({last_billing_attempt_at:new Date().toISOString(),last_billing_error:null,updated_at:new Date().toISOString()}).eq('user_id',sub.user_id);
  try{
    let order=await pp('/v2/checkout/orders',{method:'POST',headers:{'PayPal-Request-Id':requestId},body:JSON.stringify({intent:'CAPTURE',purchase_units:[{description:`${PLANS[sub.plan_code]?.name||'RentPilot'} annual subscription`,custom_id:sub.user_id,invoice_id:`rp-${sub.user_id.slice(0,8)}-${dueKey}`,amount:{currency_code:'USD',value:amount}}],payment_source:{card:{vault_id:vault.payment_token_id}}})});
    if(order.status==='APPROVED')order=await pp(`/v2/checkout/orders/${order.id}/capture`,{method:'POST',headers:{'PayPal-Request-Id':`${requestId}-capture`},body:'{}'});
    if(order.status!=='COMPLETED')throw new Error(`Payment status ${order.status||'unknown'}`);
    const paidAt=new Date();const next=plusYear(paidAt);
    await admin.from('operator_subscriptions').update({status:'active',provider_status:'CARD_CHARGE_COMPLETED',last_payment_at:paidAt.toISOString(),last_payment_amount_cents:Number(sub.annual_amount_cents),current_period_ends_at:next.toISOString(),next_billing_at:next.toISOString(),last_billing_order_id:order.id,last_billing_error:null,grace_ends_at:null,updated_at:paidAt.toISOString()}).eq('user_id',sub.user_id);
    return order;
  }catch(e){
    const now=new Date(),existingGrace=sub.grace_ends_at?new Date(sub.grace_ends_at):null,grace=existingGrace&&existingGrace>now?existingGrace:plusDays(now,3),restricted=existingGrace&&existingGrace<=now;
    await admin.from('operator_subscriptions').update({status:restricted?'restricted':'past_due',provider_status:'CARD_CHARGE_FAILED',grace_ends_at:grace.toISOString(),next_billing_at:plusDays(now,1).toISOString(),last_billing_error:String(e?.message||e).slice(0,500),updated_at:now.toISOString()}).eq('user_id',sub.user_id);
    throw e;
  }
}

async function processDueBilling(admin){
  if(!admin)return;
  const now=new Date().toISOString();
  const{data,error}=await admin.from('operator_subscriptions').select('*').not('next_billing_at','is',null).lte('next_billing_at',now).in('status',['trialing','active','past_due']).limit(25);
  if(error){console.error('paypal-billing-scan',error.message);return}
  for(const sub of data||[]){try{await chargeSubscription(admin,sub);console.log('RentPilot annual subscription charged',sub.user_id)}catch(e){console.error('paypal-annual-charge',sub.user_id,e?.message||e)}}
}

export function installPayPalSubscriptionRoutes(app,{admin,requireAuth}){
  app.get('/api/subscriptions/config',requireAuth,async(req,res)=>{
    if(!admin)return res.status(503).json({error:'Subscription database unavailable'});
    try{const{data:sub}=await admin.from('operator_subscriptions').select('plan_code,annual_amount_cents,status,trial_started_at,trial_ends_at,current_period_ends_at,billing_approved_at,grace_ends_at,payment_method_brand,payment_method_last4,payment_method_expiry,next_billing_at,last_billing_error').eq('user_id',req.user.id).maybeSingle();return res.json({ready:true,mode:'card_vault',subscription:sub})}
    catch(e){return res.status(503).json({error:e.message||'Billing unavailable'})}
  });

  app.get('/api/subscriptions/browser-token',requireAuth,async(_req,res)=>{
    try{return res.json({clientToken:await browserSafeClientToken()})}catch(e){console.error('paypal-client-token',e);return res.status(503).json({error:e.message||'Unable to initialize secure card entry'})}
  });

  app.post('/api/subscriptions/vault/setup-token',requireAuth,async(req,res)=>{
    if(!admin)return res.status(503).json({error:'Subscription database unavailable'});
    try{
      const{data:sub}=await admin.from('operator_subscriptions').select('user_id').eq('user_id',req.user.id).maybeSingle();if(!sub)return res.status(404).json({error:'Choose a RentPilot plan first'});
      const setup=await pp('/v3/vault/setup-tokens',{method:'POST',headers:{'PayPal-Request-Id':`rentpilot-setup-${req.user.id}-${Date.now()}`},body:JSON.stringify({payment_source:{card:{verification_method:'SCA_WHEN_REQUIRED',experience_context:{brand_name:'RentPilot',locale:'en-US',return_url:`${FRONTEND}/?billing=card-approved`,cancel_url:`${FRONTEND}/?billing=card-cancelled`}}}})});
      return res.json({setupToken:setup.id});
    }catch(e){console.error('paypal-vault-setup',e);return res.status(500).json({error:e.message||'Unable to start secure card setup'})}
  });

  app.post('/api/subscriptions/vault/payment-token',requireAuth,async(req,res)=>{
    if(!admin)return res.status(503).json({error:'Subscription database unavailable'});
    try{
      const vaultSetupToken=String(req.body?.vaultSetupToken||'');if(!vaultSetupToken)return res.status(400).json({error:'Vault setup token is required'});
      const{data:sub}=await admin.from('operator_subscriptions').select('*').eq('user_id',req.user.id).single();if(!sub)return res.status(404).json({error:'Subscription record not found'});
      const token=await pp('/v3/vault/payment-tokens',{method:'POST',headers:{'PayPal-Request-Id':`rentpilot-vault-${req.user.id}-${vaultSetupToken}`},body:JSON.stringify({payment_source:{token:{id:vaultSetupToken,type:'SETUP_TOKEN'}}})});
      const card=await saveVault(admin,req.user.id,token),now=new Date(),firstApproval=!sub.billing_approved_at;
      const trialEnd=firstApproval?plusDays(now,30):new Date(sub.trial_ends_at||now);
      const trialStillValid=trialEnd>now;
      await admin.from('operator_subscriptions').update({status:trialStillValid?'trialing':'past_due',provider:'paypal',provider_status:'CARD_VAULTED',billing_approved_at:sub.billing_approved_at||now.toISOString(),trial_started_at:firstApproval?now.toISOString():sub.trial_started_at,trial_ends_at:trialEnd.toISOString(),next_billing_at:trialStillValid?trialEnd.toISOString():now.toISOString(),paypal_subscription_id:null,paypal_plan_id:null,paypal_customer_id:token.customer?.id||null,payment_method_brand:card.brand||null,payment_method_last4:card.last_digits||null,payment_method_expiry:card.expiry||null,last_billing_error:null,updated_at:now.toISOString()}).eq('user_id',req.user.id);
      if(!trialStillValid){const refreshed={...sub,status:'past_due',next_billing_at:now.toISOString()};try{await chargeSubscription(admin,refreshed)}catch(e){return res.status(402).json({saved:true,charged:false,error:e.message||'Card saved but annual payment failed'})}}
      return res.json({saved:true,trialEndsAt:trialEnd.toISOString(),card:{brand:card.brand||null,last4:card.last_digits||null,expiry:card.expiry||null}});
    }catch(e){console.error('paypal-vault-confirm',e);return res.status(500).json({error:e.message||'Unable to save payment method'})}
  });

  app.post('/api/subscriptions/retry-charge',requireAuth,async(req,res)=>{
    if(!admin)return res.status(503).json({error:'Subscription database unavailable'});
    try{const{data:sub}=await admin.from('operator_subscriptions').select('*').eq('user_id',req.user.id).single();if(!sub)return res.status(404).json({error:'Subscription record not found'});const order=await chargeSubscription(admin,sub);return res.json({paid:true,orderId:order.id})}
    catch(e){return res.status(402).json({error:e.message||'Annual payment failed'})}
  });

  processDueBilling(admin).catch(e=>console.error('paypal-billing-start',e));
  const timer=setInterval(()=>processDueBilling(admin).catch(e=>console.error('paypal-billing-loop',e)),15*60*1000);timer.unref?.();
  console.log('RentPilot PayPal card-vault billing routes installed');
}
