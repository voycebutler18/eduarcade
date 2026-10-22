const AI_URL = (import.meta.env.VITE_AI_API_URL || '').replace(/\/$/, '')

export type MaintenanceTriage = {
  priority: 'routine' | 'high' | 'emergency'
  trade: string
  summary: string
  questions: string[]
  immediate_actions: string[]
  approval_recommended: boolean
  provider?: string
  model?: string
}

export async function triageMaintenance(input: {title:string;description:string;reportedPriority:string}): Promise<MaintenanceTriage> {
  if (!AI_URL) throw new Error('RentPilot AI backend is not configured')
  const response = await fetch(`${AI_URL}/api/maintenance/triage`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify(input),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'AI triage failed')
  return data
}

export async function askRentPilot(task:string,message:string,context:Record<string,unknown>={}) {
  if (!AI_URL) throw new Error('RentPilot AI backend is not configured')
  const response = await fetch(`${AI_URL}/api/ai`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({task,message,context})})
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'AI request failed')
  return data
}
