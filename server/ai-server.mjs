import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'https://rentpilot-ai.onrender.com' }));
app.use(express.json({ limit: '2mb' }));

const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';
const OLLAMA_URL=process.env.OLLAMA_URL || '';
const GROQ_MODEL=process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OLLAMA_MODEL=process.env.OLLAMA_MODEL || 'qwen2.5:7b';

const system=`You are RentPilot AI, an assistant for independent landlords and small property managers. Be concise, practical, and safety-first. For maintenance, classify urgency and suggest next actions. For tenant communication and rent recovery, be respectful and non-threatening. Never invent lease terms, late fees, eviction deadlines, legal notices, security-deposit rules, or jurisdiction-specific legal requirements. Any legal or eviction action must be marked as requiring verified local rules and explicit human approval.`;

async function groq(messages){
 if(!process.env.GROQ_API_KEY) throw new Error('Groq is not configured');
 const r=await fetch(GROQ_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model:GROQ_MODEL,messages:[{role:'system',content:system},...messages],temperature:.2})});
 if(!r.ok) throw new Error(`Groq error ${r.status}`);
 const j=await r.json(); return {text:j.choices?.[0]?.message?.content||'',provider:'groq',model:GROQ_MODEL};
}
async function ollama(messages){
 if(!OLLAMA_URL) throw new Error('Open-source fallback is not configured');
 const r=await fetch(`${OLLAMA_URL.replace(/\/$/,'')}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:OLLAMA_MODEL,messages:[{role:'system',content:system},...messages],stream:false,options:{temperature:.2}})});
 if(!r.ok) throw new Error(`Ollama error ${r.status}`);
 const j=await r.json(); return {text:j.message?.content||'',provider:'ollama',model:OLLAMA_MODEL};
}
async function runAI(messages){try{return await groq(messages)}catch(e){console.error(e.message);return await ollama(messages)}}

app.get('/health',(_req,res)=>res.json({ok:true,groq:Boolean(process.env.GROQ_API_KEY),openSource:Boolean(OLLAMA_URL),fallbackModel:OLLAMA_MODEL}));
app.post('/api/ai',async(req,res)=>{try{const {task='general',message='',context={}}=req.body||{};if(!message.trim())return res.status(400).json({error:'message is required'});const prompt=`Task: ${task}\nContext: ${JSON.stringify(context)}\nUser input: ${message}`;res.json(await runAI([{role:'user',content:prompt}]))}catch(e){res.status(503).json({error:e.message||'AI unavailable'})}});
app.post('/api/maintenance/triage',async(req,res)=>{try{const {title='',description='',reportedPriority='routine'}=req.body||{};const prompt=`Triage this maintenance request. Return ONLY valid JSON with keys priority (routine|high|emergency), trade, summary, questions (array), immediate_actions (array), approval_recommended (boolean).\nReported priority: ${reportedPriority}\nTitle: ${title}\nDescription: ${description}`;const out=await runAI([{role:'user',content:prompt}]);let result;try{result=JSON.parse(out.text.replace(/^```json\s*|\s*```$/g,''))}catch{result={priority:reportedPriority,trade:'general maintenance',summary:out.text,questions:[],immediate_actions:[],approval_recommended:true}}res.json({...result,provider:out.provider,model:out.model})}catch(e){res.status(503).json({error:e.message||'AI unavailable'})}});

const port=Number(process.env.PORT||10000);app.listen(port,'0.0.0.0',()=>console.log(`RentPilot AI backend listening on ${port}`));
