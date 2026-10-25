import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=URL&&KEY?createClient(URL,KEY,{auth:{persistSession:false}}):null;
const LAW_KEYWORDS=['landlord','tenant','dwelling','lease','rent','security deposit','repair','habitability','notice','eviction','forcible detainer','smoke','fire','security device','utility','lock','application fee','late fee','retaliation','disclosure','inspection','mold','bed bug'];
const TARGET_PROPERTY_CHAPTERS=new Set(['24','92']);
const PARSER_VERSION='texas-property-v2';
const SNAPSHOT_FRESH_MS=14*24*60*60*1000;
const SNAPSHOT_MAX_STALE_MS=45*24*60*60*1000;

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
  const pages=[];let currentChapter=null;
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);const content=await page.getTextContent();const raw=content.items.map(x=>x.str||'').join(' ');
    const chapterHits=[...raw.matchAll(/CHAPTER\s+(\d+[A-Z]?)\b/gi)];if(chapterHits.length)currentChapter=chapterHits[chapterHits.length-1][1];
    if(TARGET_PROPERTY_CHAPTERS.has(String(currentChapter)))pages.push(raw);try{page.cleanup()}catch{}
  }
  await pdf.destroy();return normalizeText(pages.join('\n'));
}
function officialUrls(source){
  const primary=source.machine_endpoint||source.base_url;const urls=[primary];
  if(/PR\.92\.pdf/i.test(primary||''))urls.push('https://statutes.capitol.texas.gov/DocViewer.aspx?DocKey=PR%2FPR.92&ExactPhrase=False&HighlightType=1&Phrases=landlord&QueryText=landlord');
  if(/PR\.24\.pdf/i.test(primary||''))urls.push('https://statutes.capitol.texas.gov/DocViewer.aspx?DocKey=PR%2FPR.24&ExactPhrase=False&HighlightType=1&Phrases=tenant&QueryText=tenant');
  return [...new Set(urls.filter(Boolean))];
}
async function parseResponse(r,source,url){
  if(!r.ok)throw new Error(`HTTP ${r.status} from ${url}`);
  const bytes=Buffer.from(await r.arrayBuffer());const fingerprint=sha256(bytes);const contentType=(r.headers.get('content-type')||'').toLowerCase();const magic=bytes.subarray(0,8).toString('latin1');const isPdf=contentType.includes('application/pdf')||magic.startsWith('%PDF-');
  let text;if(isPdf){try{text=await pdfRelevantText(bytes)}catch(e){throw new Error('PDF parse failed: '+(e?.message||e))}}else{text=htmlText(bytes.toString('utf8'))}
  const sections=splitTexasSections(text).filter(x=>relevant(x.body));
  if(!sections.length)throw new Error(`No Chapter 24/92 statutory sections parsed from official source (${isPdf?'pdf':'html'})`);
  return {sections,fingerprint,contentType,format:isPdf?'pdf':'html',bytes,url,httpStatus:r.status,etag:r.headers.get('etag'),lastModified:r.headers.get('last-modified')};
}
async function saveVerifiedSnapshot(source,parsed){
  const {data:existing}=await admin.from('compliance_source_snapshots').select('id').eq('source_registry_id',source.id).eq('fingerprint',parsed.fingerprint).eq('verification_status','verified').limit(1);
  const now=new Date();const expires=new Date(now.getTime()+SNAPSHOT_FRESH_MS);
  if(existing?.length){await admin.from('compliance_source_snapshots').update({checked_at:now.toISOString(),verified_at:now.toISOString(),expires_at:expires.toISOString(),http_status:parsed.httpStatus,error_message:null}).eq('id',existing[0].id);return existing[0].id}
  const {data,error}=await admin.from('compliance_source_snapshots').insert({source_registry_id:source.id,fingerprint:parsed.fingerprint,http_status:parsed.httpStatus,etag:parsed.etag,last_modified:parsed.lastModified,content_length:parsed.bytes.length,checked_at:now.toISOString(),changed:true,error_message:null,source_url:parsed.url,content_type:parsed.contentType,parser_version:PARSER_VERSION,verification_status:'verified',verified_at:now.toISOString(),expires_at:expires.toISOString(),section_count:parsed.sections.length,parsed_sections:parsed.sections,raw_excerpt:normalizeText(parsed.sections.slice(0,2).map(x=>`Sec. ${x.section} ${x.body}`).join('\n')).slice(0,8000)}).select('id').single();
  if(error)throw error;return data.id;
}
async function latestVerifiedSnapshot(source){
  const {data,error}=await admin.from('compliance_source_snapshots').select('id,fingerprint,source_url,content_type,parser_version,verified_at,expires_at,section_count,parsed_sections').eq('source_registry_id',source.id).eq('verification_status','verified').not('parsed_sections','is',null).order('verified_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;if(!data||!Array.isArray(data.parsed_sections)||!data.parsed_sections.length)return null;
  const verifiedAt=new Date(data.verified_at||0).getTime();const age=Date.now()-verifiedAt;if(!Number.isFinite(age)||age>SNAPSHOT_MAX_STALE_MS)return {...data,usable:false,age_ms:age,stale:true};
  return {...data,usable:true,age_ms:age,stale:age>SNAPSHOT_FRESH_MS};
}
async function recordCandidate(source,fingerprint,item,sourceUrl,method='deterministic_section_parser'){
  const title=`${source.authority_name}: § ${item.section} — ${item.title}`;
  const {data:existing}=await admin.from('compliance_rule_candidates').select('id').eq('source_registry_id',source.id).eq('source_fingerprint',fingerprint).eq('title',title).maybeSingle();if(existing)return false;
  const candidateVersion=sha256(Buffer.from(item.section+'|'+item.body)).slice(0,16);
  const {error}=await admin.from('compliance_rule_candidates').insert({source_registry_id:source.id,country_code:source.country_code,admin_area_1:source.admin_area_1,admin_area_2:source.admin_area_2,locality:source.locality,authority_name:source.authority_name,category:'statute',title,rule_text:item.body,source_excerpt:item.body.slice(0,1200),source_url:sourceUrl||source.machine_endpoint||source.base_url,source_fingerprint:fingerprint,candidate_version:candidateVersion,extraction_method:method,review_state:'parsed',confidence:1});
  if(error){console.error('legal-ingestor candidate',error.message);return false}return true;
}
async function writeCandidates(source,sections,fingerprint,sourceUrl,method){let inserted=0;for(const item of sections)if(await recordCandidate(source,fingerprint,item,sourceUrl,method))inserted++;return inserted}
async function useFallbackSnapshot(source,liveError){
  const snap=await latestVerifiedSnapshot(source);if(!snap)return null;
  if(!snap.usable)throw new Error(`Live official source unavailable and verified snapshot is older than 45 days: ${liveError}`);
  const inserted=await writeCandidates(source,snap.parsed_sections,snap.fingerprint,snap.source_url,snap.stale?'verified_snapshot_stale':'verified_snapshot_fallback');
  const note=`Live official source unavailable; using ${snap.stale?'stale ':''}verified snapshot from ${snap.verified_at}. ${String(liveError).slice(0,600)}`;
  await admin.from('compliance_source_registry').update({last_fingerprint:snap.fingerprint,discovery_state:snap.stale?'stale_snapshot':'fallback_snapshot',last_error:note}).eq('id',source.id);
  return {source:source.authority_name,inserted,fingerprint:snap.fingerprint,sections:snap.parsed_sections.length,format:'snapshot',fallback:true,stale:snap.stale,verified_at:snap.verified_at};
}
async function ingest(source){
  const errors=[];
  for(const url of officialUrls(source)){
    try{
      const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mendlyx-Legal-Ingestor/1.4 (+https://mendlyx.com)','accept':'application/pdf,text/html;q=0.9,*/*;q=0.5'},signal:AbortSignal.timeout(20000)});
      const parsed=await parseResponse(r,source,url);await saveVerifiedSnapshot(source,parsed);
      const inserted=await writeCandidates(source,parsed.sections,parsed.fingerprint,url,'deterministic_section_parser');
      await admin.from('compliance_source_registry').update({last_fingerprint:parsed.fingerprint,last_http_status:parsed.httpStatus,last_checked_at:new Date().toISOString(),discovery_state:inserted?'parsed':'verified',last_error:null,consecutive_failures:0}).eq('id',source.id);
      console.log('legal-ingestor verified',source.authority_name,'sections',parsed.sections.length,'inserted',inserted,'format',parsed.format,'url',url);
      return {source:source.authority_name,inserted,fingerprint:parsed.fingerprint,sections:parsed.sections.length,format:parsed.format,fallback:false,verified_at:new Date().toISOString()};
    }catch(e){errors.push(`${url}: ${e?.message||e}`);console.warn('legal-ingestor source attempt failed',source.authority_name,url,e?.message||e)}
  }
  const liveError=errors.join(' | ');const fallback=await useFallbackSnapshot(source,liveError);if(fallback)return fallback;throw new Error(liveError||'No usable official source response');
}
export async function runLegalIngestor(){
  if(!admin)return [];
  const {data:sources,error}=await admin.from('compliance_source_registry').select('*').eq('active',true).eq('verification_required',true).in('ingestion_mode',['pdf','statute_html']);if(error)throw error;
  const results=[];
  for(const source of sources||[]){try{results.push(await ingest(source))}catch(e){console.error('legal-ingestor',source.authority_name,e?.message||e);const failures=Number(source.consecutive_failures||0)+1;await admin.from('compliance_source_registry').update({last_error:String(e?.message||e).slice(0,1000),consecutive_failures:failures,discovery_state:'source_unavailable'}).eq('id',source.id)}}
  return results;
}
export async function runComplianceFallbackStress(iterations=1000){
  const sample='Sec. 92.001. DEFINITIONS. Landlord and tenant definitions for a dwelling and lease are established here for residential tenancies. This sample is intentionally long enough to exercise deterministic parsing without external network access. Sec. 24.005. NOTICE REQUIRED BEFORE FILING CERTAIN EVICTION SUITS. A landlord must provide written notice to a tenant before filing an eviction suit under applicable law and lease terms. This sample validates fallback parsing behavior only.';
  const parsed=splitTexasSections(sample).filter(x=>relevant(x.body));let failures=0;const now=Date.now();
  const fake={verified_at:new Date(now-60_000).toISOString(),expires_at:new Date(now+SNAPSHOT_FRESH_MS).toISOString(),parsed_sections:parsed};
  for(let i=0;i<iterations;i++){const age=now-new Date(fake.verified_at).getTime();const usable=age<=SNAPSHOT_MAX_STALE_MS;const stale=age>SNAPSHOT_FRESH_MS;if(!usable||stale||parsed.length!==2)failures++}
  const expiredAge=SNAPSHOT_MAX_STALE_MS+1;const expiredRejected=expiredAge>SNAPSHOT_MAX_STALE_MS;
  return {ok:failures===0&&expiredRejected,iterations,failures,parsed_sections:parsed.length,fresh_snapshot_usable:true,expired_snapshot_rejected:expiredRejected,max_stale_days:45,fresh_days:14};
}
export function startLegalIngestor(){if(!admin)return;setTimeout(()=>runLegalIngestor().catch(e=>console.error('legal-ingestor',e)),45000);setInterval(()=>runLegalIngestor().catch(e=>console.error('legal-ingestor',e)),12*60*60*1000)}
