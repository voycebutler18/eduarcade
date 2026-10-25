const role=String(process.env.MENDLYX_PROCESS_ROLE||'supervised').toLowerCase();

if(role==='worker'){
 await import('./worker-runtime.mjs');
}else{
 await import('./api-runtime.mjs');
 if(role!=='api-only'){
  const {startWorkerSupervisor}=await import('./worker-supervisor.mjs');
  startWorkerSupervisor();
 }
}
