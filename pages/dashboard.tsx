
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Kpi = {
  date: string; revenue_bdt: number; orders: number; ad_spend_bdt: number;
  blended_cpa: number | null; roas: number | null; conv_to_order_pct: number | null; aov: number | null;
  north_star_color?: string; north_star_points?: number;
}

export default function Dashboard() {
  const [kpi, setKpi] = useState<Kpi | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('daily_kpis')
        .select('*')
        .eq('scope', 'account')
        .order('date', { ascending: false })
        .limit(1)
      if (data && data.length > 0) setKpi(data[0] as any)
    })()
  }, [])

  if (!kpi) return <main className="p-6">Loading…</main>

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <span className={`inline-block px-3 py-1 rounded-full text-white ${kpi.north_star_color==='Green'?'bg-green-600':kpi.north_star_color==='Yellow'?'bg-yellow-500':'bg-red-600'}`}>
          North Star: {kpi.north_star_color ?? '—'}
        </span>
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {['Revenue','Orders','Ad Spend','Blended CPA','ROAS','Conv→Order %','AOV'].map((t,i)=>{
          const map:any = {
            'Revenue': kpi.revenue_bdt?.toLocaleString('en-US',{maximumFractionDigits:0}),
            'Orders': kpi.orders,
            'Ad Spend': kpi.ad_spend_bdt?.toLocaleString('en-US',{maximumFractionDigits:0}),
            'Blended CPA': kpi.blended_cpa?.toFixed(0),
            'ROAS': kpi.roas?.toFixed(2),
            'Conv→Order %': kpi.conv_to_order_pct?.toFixed(2),
            'AOV': kpi.aov?.toFixed(0)
          }
          return (
            <div key={t} className="p-4 rounded-2xl shadow bg-white border">
              <div className="text-xs text-gray-500">{t}</div>
              <div className="text-2xl font-bold">{map[t] ?? '—'}</div>
            </div>
          )
        })}
      </div>
      <p className="text-sm mt-6">All times BST (UTC+6)</p>
    </main>
  )
}
