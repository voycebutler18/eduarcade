export async function maintenanceImageDataUrl(admin,value){
  const raw=String(value||'').trim();
  if(!raw)throw new Error('maintenance photo path is empty');
  let blob;
  if(/^https?:\/\//i.test(raw)){
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);
    try{const r=await fetch(raw,{signal:ctrl.signal,redirect:'follow'});if(!r.ok)throw new Error('image fetch HTTP '+r.status);blob=await r.blob()}finally{clearTimeout(timer)}
  }else{
    const {data,error}=await admin.storage.from('maintenance-photos').download(raw);
    if(error)throw new Error('maintenance storage download failed: '+error.message);
    blob=data;
  }
  const type=String(blob.type||'').split(';')[0].trim().toLowerCase();
  if(!type.startsWith('image/'))throw new Error('maintenance photo is not an image');
  const ab=await blob.arrayBuffer();
  if(ab.byteLength>12*1024*1024)throw new Error('maintenance photo exceeds 12MB vision limit');
  return `data:${type};base64,${Buffer.from(ab).toString('base64')}`;
}
