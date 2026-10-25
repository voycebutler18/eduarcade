import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const LAW_KEYWORDS=['landlord','tenant','dwelling','lease','rent','security deposit','repair','habitability','notice','eviction','forcible detainer','smoke','fire','security device','utility','lock','application fee','late fee','retaliation','disclosure','inspection','mold','bed bug'];
const TARGET_PROPERTY_CHAPTERS=new Set(['24','92']);

function sha256(buf){return createHash('sha256').update(buf).digest('hex')}
function normalizeText(s){return String(s||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
function htmlText(s){return normalizeText(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"'))}
function relevant(text){const n=text.toLowerCase();return LAW_KEYWORDS.some(k=>n.includes(k))}
function targetSection(section){const chapter=String(section||'').split('.')[0];return TARGET_PROPERTY_CHAPTERS.has(chapter)}
function sectionTitle(section,text){const first=normalizeText(text).slice(0,220);const m=first.match(/^([A-Z][A-Z0-9 ’'(),\-\/&]{4,120})\./);return m?m[1].replace(/\s+/g,' ').trim():`Texas Property Code § ${section}`}
function splitTexasSections(text){
  const clean=normalizeText(text);
  const re=/Sec\.?\s*(\d+\.\d+[A-Za-z0-9-]*)\.?\s*/g;
  const hits=[];let m;
  while((m=re.exec(clean)))hits.push({section:m[1],start:m.index,bodyStart:re.lastIndex});
  const out=[];
  for(let i=0;i<hits.length;i++){
    const h=hits[i],end=i+1<hits.length?hits[i+1].start:clean.length;
    const body=clean.slice(h.bodyStart,end).trim();
    if(body.length>=80&&targetSection(h.section))out.push({section:h.section,title:sectionTitle(h.section,body),body});
  }
  return out;
}
async function pdfRelevantText(bytes){
  const task=getDocument({data:new Uint8Array(bytes),disableWorker:true});
  const pdf=await task.promise;
  const pages=[];
  let currentChapter=null;
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    const raw=content.items.map(x=>x.str||'').join(' ');
    const chapterHits=[...raw.matchAll(/CHAPTER\s+(\d+[A-Z]?)\b/gi)];
    if(chapterHits.length)currentChapter=chapterHits[chapterHits.length-1][1];
    if(TARGET_PROPERTY_CHAPTERS.has(String(currentChapter)))pages.push(raw);
    try{page.cleanup()}catch{}
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
    source_registry_id:source.id,country_code:source.country_code,admin_area_1:source.admin_area_1,admin_area_2:source.admin_area_2,locality:source.locality,
    authority_name:source.authority_name,category:'statute',title,rule_text:item.body,source_excerpt:item.body.slice(0,1200),
    source_url:source.machine_endpoint||source.base_url,source_fingerprint:fingerprint,candidate_version:candidateVersion,
    extraction_method:'deterministic_section_parser',review_state:'parsed',confidence:1
  });
  if(error){console.error('legal-ingestor candidate',error.message);return false}
  return true;
}
async function ingest(source){
  const url=source.machine_endpoint||source.base_url;
  const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mendlyx-Legal-Ingestor/1.3 (+https://mendlyx.com)','accept':'application/pdf,text/html;q=0.9,*/*;q=0.5'}});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());
  const fingerprint=sha256(bytes);
  const {data:already}=await admin.from('compliance_rule_candidates').select('id').eq('source_registry_id',source.id).eq('source_fingerprint',fingerprint).limit(1);
  if((already||[]).length)return {source:source.authority_name,skipped:true,fingerprint};
  const contentType=(r.headers.get('content-type')||'').toLowerCase();
  const magic=bytes.subarray(0,8).toString('latin1');
  const isPdf=contentType.includes('application/pdf')||magic.startsWith('%PDF-');
  let text;
  if(isPdf){
    try{text=await pdfRelevantText(bytes)}catch(e){throw new Error('PDF parse failed: '+(e?.message||e))}
  }else{
    if(source.ingestion_mode==='pdf')console.warn('legal-ingestor expected PDF but received',contentType||'unknown content type','from',source.authority_name);
    text=htmlText(bytes.toString('utf8'));
  }
  const sections=splitTexasSections(text).filter(x=>relevant(x.body));
  if(!sections.length)throw new Error(`No Chapter 24/92 statutory sections parsed from official Property Code source (${isPdf?'pdf':'html'})`);
  let inserted=0;
  for(const item of sections)if(await recordCandidate(source,fingerprint,item))inserted++;
  await admin.from('compliance_source_registry').update({
    last_fingerprint:fingerprint,last_http_status:r.status,last_checked_at:new Date().toISOString(),
    discovery_state:inserted?'parsed':'registered',last_error:null
  }).eq('id',source.id);
  console.log('legal-ingestor parsed',source.authority_name,'sections',sections.length,'inserted',inserted,'format',isPdf?'pdf':'html');
  return {source:source.authority_name,inserted,fingerprint,sections:sections.length,format:isPdf?'pdf':'html'};
}
export async function runLegalIngestor(){
  if(!admin)return [];
  const {data:sources,error}=await admin.from('compliance_source_registry').select('*').eq('active',true).eq('verification_required',true).in('ingestion_mode',['pdf','statute_html']);
  if(error)throw error;
  const results=[];
  for(const source of sources||[]){
    try{results.push(await ingest(source))}
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
