
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Alert = {
  date: string; entity_level: string; entity_id: string | null; rule_id: string;
  severity: 'high'|'medium'|'low'; finding: string; evidence: any; recommendation: any;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('alerts').select('*').order('date', { ascending: false }).limit(200)
      setAlerts((data ?? []) as any)
    })()
  }, [])

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Alert Center</h1>
      <div className="space-y-3">
        {alerts.map((a, idx) => (
          <div key={idx} className="p-4 rounded-2xl shadow bg-white border">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded-full text-white text-xs ${a.severity==='high'?'bg-red-600':a.severity==='medium'?'bg-yellow-500':'bg-gray-500'}`}>{a.severity}</span>
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{a.rule_id}</span>
              <span className="text-sm font-semibold">{a.entity_level} — {a.entity_id ?? '—'}</span>
              <span className="ml-auto text-xs text-gray-500">{a.date}</span>
            </div>
            <div className="text-sm">{a.finding}</div>
            <pre className="text-xs bg-gray-50 p-2 rounded mt-2">{JSON.stringify(a.recommendation)}</pre>
          </div>
        ))}
      </div>
    </main>
  )
}
