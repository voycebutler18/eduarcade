import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client (safe to import anywhere).
 * - Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your .env
 * - If env vars are missing, exports `supabase = null` and `isSupabaseEnabled = false`
 * - You can gate features like: if (!isSupabaseEnabled) fallback to local storage.
 *
 * Add a .env at project root (same level as package.json):
 *   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseEnabled = Boolean(URL && KEY);

export const supabase: SupabaseClient | null = isSupabaseEnabled
  ? createClient(URL!, KEY!, {
      auth: {
        persistSession: true,
        storageKey: "eduverse-auth",
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { "X-Client-Info": "eduverse-arena-mvp" } },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

/** Convenience guard to avoid null checks everywhere */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env"
    );
  }
  return supabase;
}

/** Suggested tables for later (reference only)
-- profiles
--  id uuid pk, username text unique, birthday date, gender text null,
--  coins int default 1000, created_at timestamptz default now(), updated_at timestamptz
-- inventory (owned cosmetics)
--  user_id uuid, item_id text, acquired_at timestamptz default now(), primary key (user_id,item_id)
-- purchases (coin logs)
--  id uuid pk default gen_random_uuid(), user_id uuid, amount int, kind text, created_at timestamptz
-- messages (room chat, if desired server-side)
--  id uuid pk, room text, user_id uuid, username text, text text, ts timestamptz default now()
-- presence (lobbies)
--  user_id uuid, room text, status text, updated_at timestamptz
-- leaderboards
--  user_id uuid, score int, season text
*/
