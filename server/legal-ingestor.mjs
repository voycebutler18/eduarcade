import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;

const LAW_KEYWORDS=[
  'landlord','tenant','dwelling','lease','rent','security deposit','repair','habitability',
  'notice','eviction','forcible detainer','smoke','fire','security device','utility','lock',
  'application fee','late fee','retaliation','disclosure','inspection','mold','bed bug'
];

function sha256(buf){return createHash('sha256').update(buf).digest('hex')}
function normalizeText(s){return String(s||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
function relevant(text){const n=text.toLowerCase();return LAW_KEYWORDS.some(k=>n.includes(k))}
function sectionTitle(section,text){
  const first=normalizeText(text).slice(0,220);
  const m=first.match(/^([A-Z][A-Z0-9 ’'(),\-\/&]{4,120})\./);
  return m?m[1].replace(/\s+/g,' ').trim():`Texas Property Code § ${section}`;
}
function splitTexasSections(text){
  const clean=normalizeText(text);
  const re=/Sec\.?\s*(\d+\.\d+[A-Za-z0-9-]*)\.?\s*/g;
  const hits=[];let m;
  while((m=re.exec(clean)))hits.push({section:m[1],start:m.index,bodyStart:re.lastIndex});
  const out=[];
  for(let i=0;i<hits.length;i++){
    const h=hits[i],end=i+1<hits.length?hits[i+1].start:clean.length;
    const body=clean.slice(h.bodyStart,end).trim();
    if(body.length<80)continue;
    out.push({section:h.section,title:sectionTitle(h.section,body),body});
  }
  return out;
}
async function pdfText(bytes){
  const task=getDocument({data:new Uint8Array(bytes),disableWorker:true});
  const pdf=await task.promise;const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);const content=await page.getTextContent();
    pages.push(content.items.map(x=>x.str||'').join(' '));
  }
  await pdf.destroy();
  return normalizeText(pages.join('\n'));
}
async function recordCandidate(source,fingerprint,item){
  const title=`${source.authority_name}: § ${item.section} — ${item.title}`;
  const {data:existing}=await admin.from('compliance_rule_candidates').select('id').eq('source_registry_id',source.id).eq('source_fingerprint',fingerprint).eq('title',title).maybeSingle();
  if(existing)return false;
  const candidateVersion=sha256(Buffer.from(item.section+'|'+item.body)).slice(0,16);
  const {error}=await admin.from('compliance_rule_candidates').insert({
    source_registry_id:source.id,
    country_code:source.country_code,
    admin_area_1:source.admin_area_1,
    admin_area_2:source.admin_area_2,
    locality:source.locality,
    authority_name:source.authority_name,
    category:'statute',
    title,
    rule_text:item.body,
    source_excerpt:item.body.slice(0,1200),
    source_url:source.machine_endpoint||source.base_url,
    source_fingerprint:fingerprint,
    candidate_version:candidateVersion,
    extraction_method:'deterministic_section_parser',
    review_state:'parsed',
    confidence:1
  });
  if(error){console.error('legal-ingestor candidate',error.message);return false}
  return true;
}
async function ingestOfficialPdf(source){
  const r=await fetch(source.machine_endpoint||source.base_url,{redirect:'follow',headers:{'user-agent':'RentPilot-Legal-Ingestor/1.0 (+https://rentpilot-ai.onrender.com)'}});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());
  const fingerprint=sha256(bytes);
  const {data:already}=await admin.from('compliance_rule_candidates').select('id').eq('source_registry_id',source.id).eq('source_fingerprint',fingerprint).limit(1);
  if((already||[]).length)return {source:source.authority_name,skipped:true,fingerprint};
  const text=await pdfText(bytes);
  const sections=splitTexasSections(text).filter(x=>relevant(x.body));
  let inserted=0;
  for(const item of sections)if(await recordCandidate(source,fingerprint,item))inserted++;
  await admin.from('compliance_source_registry').update({
    last_fingerprint:fingerprint,
    last_http_status:r.status,
    last_checked_at:new Date().toISOString(),
    discovery_state:inserted?'parsed':'registered',
    last_error:null
  }).eq('id',source.id);
  return {source:source.authority_name,inserted,fingerprint,sections:sections.length};
}
export async function runLegalIngestor(){
  if(!admin)return [];
  const {data:sources,error}=await admin.from('compliance_source_registry').select('*')
    .eq('active',true).eq('verification_required',true).eq('ingestion_mode','pdf');
  if(error)throw error;
  const results=[];
  for(const source of sources||[]){
    try{results.push(await ingestOfficialPdf(source))}
    catch(e){
      console.error('legal-ingestor',source.authority_name,e?.message||e);
      await admin.from('compliance_source_registry').update({last_error:String(e?.message||e).slice(0,1000)}).eq('id',source.id);
    }
  }
  return results;
}
export function startLegalIngestor(){
  if(!admin)return;
  setTimeout(()=>runLegalIngestor().catch(e=>console.error('legal-ingestor',e)),45000);
  setInterval(()=>runLegalIngestor().catch(e=>console.error('legal-ingestor',e)),12*60*60*1000);
}
