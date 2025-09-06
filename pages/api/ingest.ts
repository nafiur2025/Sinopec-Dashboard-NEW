
import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

export const config = { api: { bodyParser: false } }

const FX = parseFloat(process.env.FX_SGD_TO_BDT || '95')

function toNumber(x: any): number | null {
  if (x===null || x===undefined || x==='') return null
  const s = String(x).replace(/,/g,'')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function inferProspecting(campaign?: string, adset?: string): boolean {
  const hay = `${campaign||''} ${adset||''}`.toLowerCase()
  const cold = ['prospecting','cold','broad']
  const warm = ['remarketing','retarget','rmk','retargeting','rm']
  return cold.some(k=>hay.includes(k)) && !warm.some(k=>hay.includes(k))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const form = formidable({ multiples: true })
  const { files } = await new Promise<{files: any}>( (resolve, reject) => {
    form.parse(req, (err, fields, files) => err ? reject(err) : resolve({files}))
  })

  const adsFile = files['ads']
  const ordersFile = files['orders']

  // Parse ADS (CSV or XLSX)
  async function parseAds(file: any) {
    const buf = await fsRead(file.filepath)
    let rows: any[] = []
    if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet') ) {
      const wb = XLSX.read(buf)
      let ws = wb.Sheets['Raw Data Report'] || wb.Sheets[wb.SheetNames[0]]
      // Try to find header row containing "Campaign name"
      const sheet_json: any[] = XLSX.utils.sheet_to_json(ws, { header:1 })
      let headerRow = sheet_json.findIndex(r => r.some((c:any)=> String(c||'').toLowerCase().includes('campaign name')))
      if (headerRow === -1) headerRow = 0
      const data = XLSX.utils.sheet_to_json(ws, { range: headerRow, defval: null })
      rows = data as any[]
    } else {
      const txt = buf.toString('utf8')
      rows = Papa.parse(txt, { header: true }).data as any[]
    }
    // Normalize
    const out = rows.map(r => {
      const spendSGD = toNumber(r['Amount spent (SGD)'] ?? r['Amount Spent (SGD)'])
      const spendBDT = (spendSGD!=null) ? spendSGD * FX : toNumber(r['Amount spent (BDT)'])
      const conv = toNumber(r['Messaging conversations started']) ?? toNumber(r['Results'])
      const cpcSGD = toNumber(r['Cost per messaging conversation started'])
      const cpcBDT = (cpcSGD!=null) ? cpcSGD * FX : null
      const delivery = (r['Delivery level'] || r['Delivery Level'] || '').toString();
      const isCampaign = delivery.toLowerCase()==='campaign';
      return {
        date: (r['Reporting ends'] || r['Date']),
        account_id: r['Account ID'] || null,
        campaign_name: r['Campaign name'] || r['Campaign'],
        adset_name: r['Ad Set Name'] || r['Ad set name'],
        ad_name: r['Ad name'],
        ids: r['Ad ID'] || null,
        objective: r['Objective'] || null,
        is_prospecting: inferProspecting(r['Campaign name'], r['Ad Set Name']),
        delivery_level: delivery,
        spend_bdt: isCampaign ? spendBDT : 0,
        impressions: toNumber(r['Impressions']),
        clicks_all: toNumber(r['Clicks (all)'] || r['Link clicks']),
        ctr_all: toNumber(r['CTR (all)']),
        cpm_bdt: toNumber(r['CPM (cost per 1,000 impressions)']) ? toNumber(r['CPM (cost per 1,000 impressions)'])*FX : null,
        frequency: toNumber(r['Frequency']),
        conversations: isCampaign ? conv : 0,
        cost_per_conversation_bdt: cpcBDT
      }
    })
    return out
  }

  // Parse ORDERS
  async function parseOrders(file: any) {
    const buf = await fsRead(file.filepath)
    const txt = buf.toString('utf8')
    const rows: any[] = Papa.parse(txt, { header: true }).data as any[]
    const out = rows.map(r => {
      const paid = toNumber(r['Paid Amount'] || r['Paid Amount (BDT)']) || 0
      const due = toNumber(r['Due Amount'] || r['Due Amount (BDT)']) || 0
      const delivery = (r['Delivery level'] || r['Delivery Level'] || '').toString();
      const isCampaign = delivery.toLowerCase()==='campaign';
      return {
        order_id: r['Invoice Number'] || r['Order ID'],
        order_date: r['Creation Date'] || r['Order Date'],
        order_status: r['Order Status'] || r['Status'],
        paid_amount_bdt: paid,
        due_amount_bdt: due,
        conversation_id: r['Conversation ID'] || null
      }
    })
    return out
  }

  async function fsRead(path: string) {
    const fs = await import('fs/promises')
    return fs.readFile(path)
  }

  const adsRows = await parseAds(adsFile)
  const ordersRows = await parseOrders(ordersFile)

  // Upsert to Supabase via RPCs
  await supabase.rpc('upsert_ads_norm', { rows: adsRows })
  await supabase.rpc('upsert_orders_norm', { rows: ordersRows })

  // Compute KPIs & score North Star for the day inferred from orders
  const runDate = (ordersRows[0]?.order_date) || (adsRows[0]?.date)
  await supabase.rpc('compute_daily_kpis', { run_date: runDate })
  await supabase.rpc('score_north_star', { run_date: runDate })
  // Alerts can be generated in a daily schedule when enough history exists

  return res.status(200).json({ ok: true, rows: { ads: adsRows.length, orders: ordersRows.length }, date: runDate })
}
