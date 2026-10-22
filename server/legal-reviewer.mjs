import {createClient} from '@supabase/supabase-js';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';
const MODEL=process.env.GROQ_MODEL||'llama-3.3-70b-versatile';

function jsonFrom(text){
  const cleaned=String(text||'').replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  return JSON.parse(cleaned);
}
function safeRules(v){
  const allowed=['year_built_before','year_built_on_or_after','property_type_in','unit_count_min','unit_count_max','owner_occupied','subsidized_program_in','has_pool','has_elevator','has_boiler','has_fire_suppression'];
  const out={};for(const k of allowed)if(v&&Object.prototype.hasOwnProperty.call(v,k))out[k]=v[k];return out;
}
function safeFields(v){
  const allowed=new Set(['country_code','admin_area_1','locality','address_line1','postal_code','year_built','property_type','unit_count','owner_occupied','subsidized_program','has_pool','has_elevator','has_boiler','has_fire_suppression']);
  return Array.isArray(v)?[...new Set(v.filter(x=>allowed.has(x)))]:[];
}
async function reviewCandidate(c){
  if(!process.env.GROQ_API_KEY)return null;
  const prompt=`You are a conservative legal-rule extraction reviewer for RentPilot. Analyze ONLY the official statutory section below. Do not use memory or outside law. Return ONLY JSON.\n\nA rule may be promoted only if this exact section itself states a concrete landlord/property operational duty, prohibition, deadline, required disclosure, required record, required device/condition, or directly measurable condition. Definitions, remedies, court procedure, tenant-only rights, defenses, penalties alone, and vague context are NOT independently promotable.\n\nJSON schema:\n{\"promotable\":boolean,\"title\":string,\"category\":string,\"summary\":string,\"applies_when\":string,\"legal_citation\":string,\"effective_date\":string|null,\"required_fields\":string[],\"applicability_rules\":object,\"confidence\":number,\"reason\":string}\n\nAllowed required_fields/applicability keys are only: country_code, admin_area_1, locality, address_line1, postal_code, year_built, property_type, unit_count, owner_occupied, subsidized_program, has_pool, has_elevator, has_boiler, has_fire_suppression. Do not invent dates or applicability facts not stated in the section. If the rule depends on facts outside those fields, explain them in applies_when but do not fabricate a machine rule. Confidence must be <=1.\n\nAuthority: ${c.authority_name}\nJurisdiction: ${[c.country_code,c.admin_area_1,c.admin_area_2,c.locality].filter(Boolean).join(' / ')}\nCandidate title: ${c.title}\nOfficial section text:\n${c.rule_text.slice(0,14000)}`;
  const r=await fetch(GROQ_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:'Extract legal rules conservatively. Never add law not present in supplied official text.'},{role:'user',content:prompt}],temperature:0,response_format:{type:'json_object'}})});
  if(!r.ok)throw new Error('review AI HTTP '+r.status);
  const j=await r.json();return jsonFrom(j.choices?.[0]?.message?.content||'{}');
}
async function promote(c,r){
  const confidence=Math.max(0,Math.min(1,Number(r.confidence||0)));
  const excerpt=String(c.source_excerpt||c.rule_text||'').slice(0,4000);
  const citation=String(r.legal_citation||'').trim();
  if(!r.promotable||confidence<0.92||!citation||!excerpt)return false;
  const required=safeFields(r.required_fields);const rules=safeRules(r.applicability_rules);
  const {data:req,error}=await admin.from('compliance_requirements').insert({
    title:String(r.title||c.title).slice(0,300),category:String(r.category||c.category||'legal'),jurisdiction:[c.locality,c.admin_area_2,c.admin_area_1,c.country_code].filter(Boolean).join(', '),requirement_summary:String(r.summary||'').slice(0,5000),applies_when:String(r.applies_when||'').slice(0,5000),effective_date:r.effective_date||c.effective_date||null,source_url:c.source_url,source_authority:c.authority_name,last_verified_at:new Date().toISOString(),status:'active',ai_generated:true,country_code:c.country_code,admin_area_1:c.admin_area_1,admin_area_2:c.admin_area_2,locality:c.locality,source_id:c.source_registry_id,source_fingerprint:c.source_fingerprint,verification_state:'source_verified',source_excerpt:excerpt,applicability_rules:rules,required_fields:required,rule_version:c.candidate_version,legal_citation:citation,evidence_state:'source_verified',verified_effective_at:new Date().toISOString()
  }).select('id').single();
  if(error)throw error;
  await admin.from('compliance_evidence_chain').insert({requirement_id:req.id,source_registry_id:c.source_registry_id,rule_candidate_id:c.id,evidence_type:'official_source_and_ai_extraction',evidence:{candidate_version:c.candidate_version,review:r,model:MODEL,guardrail:'promotion requires exact official source candidate and confidence >= 0.92'},source_url:c.source_url,source_fingerprint:c.source_fingerprint});
  await admin.from('compliance_rule_candidates').update({review_state:'promoted',confidence,ai_review:r,reviewed_at:new Date().toISOString(),verified_at:new Date().toISOString(),promoted_requirement_id:req.id}).eq('id',c.id);
  return true;
}
export async function runLegalReviewer(){
  if(!admin||!process.env.GROQ_API_KEY)return [];
  const {data,error}=await admin.from('compliance_rule_candidates').select('*').eq('review_state','parsed').order('discovered_at',{ascending:true}).limit(12);if(error)throw error;
  const results=[];
  for(const c of data||[]){
    try{
      const r=await reviewCandidate(c);if(!r)continue;
      const promoted=await promote(c,r);
      if(!promoted)await admin.from('compliance_rule_candidates').update({review_state:'ai_reviewed',confidence:Math.max(0,Math.min(1,Number(r.confidence||0))),ai_review:r,reviewed_at:new Date().toISOString()}).eq('id',c.id);
      results.push({id:c.id,promoted,confidence:r.confidence});
    }catch(e){console.error('legal-reviewer',c.id,e?.message||e)}
  }
  return results;
}
export function startLegalReviewer(){
  if(!admin||!process.env.GROQ_API_KEY)return;
  setTimeout(()=>runLegalReviewer().catch(e=>console.error('legal-reviewer',e)),2*60*1000);
  setInterval(()=>runLegalReviewer().catch(e=>console.error('legal-reviewer',e)),60*60*1000);
}
