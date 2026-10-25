import './ai-hardening-patch.mjs';
import {installMaintenanceStorageFetch} from './maintenance-photo-loader.mjs';
import {startMaintenanceAutoRouter} from './maintenance-auto-router.mjs';
import {startMaintenanceVendorAutopilot} from './maintenance-vendor-autopilot.mjs';
import {startComplianceMonitor} from './compliance-monitor.mjs';
import {startNovaSupervisor} from './nova-supervisor.mjs';
import {startJurisdictionResolver} from './jurisdiction-resolver.mjs';
import {startLegalIngestor} from './legal-ingestor.mjs';
import {startLegalReviewer} from './legal-reviewer.mjs';
import {startComplianceRuleMatcher} from './compliance-rule-matcher.mjs';
import {startComplianceLifecycle} from './compliance-lifecycle.mjs';
import {startAgentSwarm} from './agent-swarm.mjs';
import {startLocalIntelligence} from './local-intelligence.mjs';
import {startMoneyChaserAutoEngine} from './money-chaser-auto-engine.mjs';
import {startNovaPropertyManager} from './nova-property-manager.mjs';
import {startLeaseIntelligenceWorker} from './lease-intelligence-worker.mjs';
import {startNovaOperationsWorker} from './nova-operations-worker.mjs';

process.title='mendlyx-worker';
installMaintenanceStorageFetch();
startMaintenanceAutoRouter();
startMaintenanceVendorAutopilot();
startMoneyChaserAutoEngine();
startNovaPropertyManager();
startLeaseIntelligenceWorker();
startNovaOperationsWorker();
startJurisdictionResolver();
startComplianceMonitor();
startNovaSupervisor();
startLegalIngestor();
startLegalReviewer();
startComplianceRuleMatcher();
startComplianceLifecycle();
startAgentSwarm();
startLocalIntelligence();

function heartbeat(){
 if(process.send)process.send({type:'worker_heartbeat',pid:process.pid,at:new Date().toISOString(),memory_mb:Math.round(process.memoryUsage().rss/1024/1024*10)/10});
}
setInterval(heartbeat,10_000).unref?.();
heartbeat();

process.on('message',msg=>{
 if(!msg||typeof msg!=='object')return;
 if(msg.type==='stress_cpu'){
  const until=Date.now()+Math.min(2000,Math.max(100,Number(msg.duration_ms)||750));
  let x=0;while(Date.now()<until){x=(x+Math.sqrt((x%997)+1))%1000000}
  if(process.send)process.send({type:'stress_cpu_done',at:new Date().toISOString(),value:x});
 }
 if(msg.type==='stress_crash'){
  if(process.send)process.send({type:'stress_crash_ack',at:new Date().toISOString()});
  setTimeout(()=>process.exit(73),25);
 }
});

console.log('Mendlyx background worker runtime active');
