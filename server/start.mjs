import './lease-vision-patch.mjs';
import './autopay-patch.mjs';
import './resident-concierge-patch.mjs';
import './ai-server.mjs';
import {startComplianceMonitor} from './compliance-monitor.mjs';\nimport {startNovaSupervisor} from './nova-supervisor.mjs';
startComplianceMonitor();\nstartNovaSupervisor();
