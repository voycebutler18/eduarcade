import {readFile,writeFile} from 'node:fs/promises';

const sourceUrl=new URL('./ai-server.mjs',import.meta.url);
const runtimeUrl=new URL('./ai-server-runtime.mjs',import.meta.url);
let source=await readFile(sourceUrl,'utf8');

const legacy="const account=await stripe.accounts.create({type:'express',country:'US',email:req.user.email||undefined,capabilities:{card_payments:{requested:true},transfers:{requested:true}},metadata:{rentpilot_owner_id:req.user.id}});";
const v2="const account=await stripe.v2.core.accounts.create({contact_email:req.user.email||undefined,display_name:req.user.email||'RentPilot landlord',dashboard:'full',identity:{country:'us'},configuration:{merchant:{capabilities:{card_payments:{requested:true}}},recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}},defaults:{currency:'usd',responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},metadata:{rentpilot_owner_id:req.user.id}});";

if(!source.includes(legacy))throw new Error('Stripe Connect patch target not found');
source=source.replace(legacy,v2);
await writeFile(runtimeUrl,source,'utf8');
await import(runtimeUrl.href+`?v=${Date.now()}`);
