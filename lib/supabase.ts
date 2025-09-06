
import { createClient } from '@supabase/supabase-js'

// Browser reads -> use anon key ONLY.
// All writes happen in /pages/api/* and Netlify functions with the service key.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

