
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async () => {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 1) // yesterday UTC
  const runDate = now.toISOString().slice(0,10)
  await supabase.rpc('compute_daily_kpis', { run_date: runDate })
  await supabase.rpc('score_north_star', { run_date: runDate })
  await supabase.rpc('generate_alerts', { run_date: runDate }).catch(()=>null) // may fail if not enough history
  return { statusCode: 200, body: JSON.stringify({ ok: true, runDate }) }
}
