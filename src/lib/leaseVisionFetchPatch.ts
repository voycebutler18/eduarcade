import {supabase} from './supabase'

const VISION='https://rentpilot-document-vision.onrender.com'
const AI=(import.meta.env.VITE_AI_API_URL||'').replace(/\/$/,'')
const nativeFetch=window.fetch.bind(window)

window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url
  if(url===`${VISION}/ocr`&&init?.method==='POST'&&init.body instanceof FormData&&AI){
    const file=init.body.get('file')
    if(file instanceof File){
      const pageForm=new FormData();pageForm.append('file',file)
      const rendered=await nativeFetch(`${VISION}/lease-pages`,{method:'POST',body:pageForm})
      if(rendered.ok){
        const pageData=await rendered.json()
        const pages=Array.isArray(pageData.pages)?pageData.pages:[]
        const {data}=await supabase.auth.getSession();const token=data.session?.access_token
        if(token&&pages.length){
          const vision=await nativeFetch(`${AI}/api/lease/vision`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({pages})})
          if(vision.ok){
            const result=await vision.json(),f=result.fields||{}
            const text=[`Residents: ${f.full_name||''}`,`Occupants: ${f.occupants||''}`,`Property: ${f.property_name||''}`,`Address: ${f.address_line1||''}`,`City: ${f.city||''}`,`State: ${f.state||''}`,`Postal Code: ${f.postal_code||''}`,`Apartment No.: ${f.unit_label||''}`,`Monthly Base Rent: ${f.monthly_rent||''}`,`Lease Start Date: ${f.start_date||''}`,`Lease End Date: ${f.end_date||''}`,`Rent Due Day: ${f.due_day||''}`].join('\n')
            return new Response(JSON.stringify({text,engine:'qwen/qwen3.8-27b',fields:f}),{status:200,headers:{'content-type':'application/json'}})
          }
          const err=await vision.json().catch(()=>({}));return new Response(JSON.stringify({detail:err.error||'Lease vision failed'}),{status:vision.status,headers:{'content-type':'application/json'}})
        }
      }
    }
  }
  return nativeFetch(input as any,init)
}) as typeof window.fetch
