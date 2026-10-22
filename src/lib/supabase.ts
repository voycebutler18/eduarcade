import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('RentPilot Supabase environment variables are not configured yet.')
}

export const supabase = createClient(
  supabaseUrl || 'https://pxikovdxfgsvqvvpwnky.supabase.co',
  supabasePublishableKey || 'sb_publishable_HKpnoybJTD0ILSYMUYNXWA_Jy25MuzT',
)
