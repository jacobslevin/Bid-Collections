import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import { fetchDealerBid, saveDealerBid, submitDealerBid } from '../lib/api'

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function formatTimestamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

function escapeCsv(value) {
  const raw = value == null ? '' : String(value)
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`
  }
  return raw
}

function normalizeHeader(header) {
  return String(header || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function findHeaderIndex(headers, aliases) {
  for (let i = 0; i < headers.length; i += 1) {
    if (aliases.includes(headers[i])) return i
  }
  return -1
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeNumericLike(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (Number.isInteger(n)) return String(n)
  return String(n)
}

function numberOrNull(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function money(value) {
  const n = numberOrNull(value)
  return n == null ? '—' : `$${usdFormatter.format(n)}`
}

function extendedAmount(unitPrice, quantity) {
  const p = numberOrNull(unitPrice)
  const q = numberOrNull(quantity)
  if (p == null || q == null) return null
  return p * q
}

function netUnitPrice(unitListPrice, discountPercent, tariffPercent) {
  const listPrice = numberOrNull(unitListPrice)
  if (listPrice == null) return null

  const discount = numberOrNull(discountPercent) ?? 0
  const tariff = numberOrNull(tariffPercent) ?? 0
  const discounted = listPrice * (1 - (discount / 100))
  return discounted * (1 + (tariff / 100))
}

export default function DealerBidPage() {
  const { token } = useParams()

  const [rows, setRows] = useState([])
  const [deliveryAmount, setDeliveryAmount] = useState('')
  const [installAmount, setInstallAmount] = useState('')
  const [escalationAmount, setEscalationAmount] = useState('')
  const [contingencyAmount, setContingencyAmount] = useState('')
  const [salesTaxAmount, setSalesTaxAmount] = useState('')
  const [bidState, setBidState] = useState('draft')
  const [submittedAt, setSubmittedAt] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [statusMessage, setStatusMessage] = useState('Loading bid...')
  const [loading, setLoading] = useState(false)

  const subtotal = useMemo(() => (
    rows.reduce((sum, row) => {
      const value = extendedAmount(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent), row.quantity)
      return sum + (value ?? 0)
    }, 0)
  ), [rows])

  const grandTotal = useMemo(() => (
    subtotal +
    (numberOrNull(deliveryAmount) ?? 0) +
    (numberOrNull(installAmount) ?? 0) +
    (numberOrNull(escalationAmount) ?? 0) +
    (numberOrNull(contingencyAmount) ?? 0) +
    (numberOrNull(salesTaxAmount) ?? 0)
  ), [subtotal, deliveryAmount, installAmount, escalationAmount, contingencyAmount, salesTaxAmount])

  const downloadCsvTemplate = () => {
    const headers = [
      'row_index',
      'spec_item_id',
      'code_tag',
      'product_name',
      'brand_name',
      'quantity',
      'uom',
      'unit_list_price',
      'discount_percent',
      'tariff_percent',
      'unit_net_price',
      'extended_price',
      'lead_time_days',
      'dealer_notes'
    ]
    const lines = [
      headers.join(','),
      ...rows.map((row, index) => ([
        index,
        row.spec_item_id,
        row.sku || '',
        row.product_name || '',
        row.brand_name || '',
        row.quantity ?? '',
        row.uom || '',
        row.unit_price ?? '',
        row.discount_percent ?? '',
        row.tariff_percent ?? '',
        netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent) ?? '',
        extendedAmount(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent), row.quantity) ?? '',
        row.lead_time_days ?? '',
        row.dealer_notes ?? ''
      ].map(escapeCsv).join(',')))
    ]

    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `dealer_bid_${token}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  }

  const importCsvFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
      if (lines.length < 2) {
        setStatusMessage('CSV import failed: no data rows found.')
        return
      }

      const headers = parseCsvLine(lines[0]).map(normalizeHeader)
      const idxRow = findHeaderIndex(headers, ['rowindex', 'row', 'lineindex'])
      const idxSpec = findHeaderIndex(headers, ['specitemid', 'productid', 'specid', 'itemid'])
      const idxCode = findHeaderIndex(headers, ['codetag', 'code', 'sku'])
      const idxUnit = findHeaderIndex(headers, ['unitlistprice', 'unitprice', 'price', 'dealerunitprice'])
      const idxDiscount = findHeaderIndex(headers, ['discountpercent', 'percentdiscount', 'discount'])
      const idxTariff = findHeaderIndex(headers, ['tariffpercent', 'percenttariff', 'tariff'])
      const idxLead = findHeaderIndex(headers, ['leadtimedays', 'leadtime', 'leadtimeindays'])
      const idxNotes = findHeaderIndex(headers, ['dealernotes', 'notes', 'bidnotes'])

      if ((idxRow < 0 && idxSpec < 0 && idxCode < 0) || idxUnit < 0 || idxDiscount < 0 || idxTariff < 0 || idxLead < 0 || idxNotes < 0) {
        setStatusMessage('CSV import failed: include row_index or spec_item_id or code/tag, plus unit list price, % discount, % tariff, lead time days, and dealer notes.')
        return
      }

      const byRowIndex = new Map(rows.map((_row, index) => [String(index), index]))
      rows.forEach((_row, index) => {
        byRowIndex.set(String(index + 1), index)
      })
      const bySpecId = new Map()
      const byCodeTag = new Map()
      rows.forEach((row, index) => {
        const specRaw = String(row.spec_item_id || '')
        const specNorm = normalizeKey(specRaw)
        const specNum = normalizeNumericLike(specRaw)
        const codeRaw = String(row.sku || '')
        const codeNorm = normalizeKey(codeRaw)

        if (specRaw) bySpecId.set(specRaw, index)
        if (specNorm) bySpecId.set(specNorm, index)
        if (specNum) bySpecId.set(specNum, index)
        if (codeRaw) byCodeTag.set(codeRaw, index)
        if (codeNorm) byCodeTag.set(codeNorm, index)
      })
      let updatedCount = 0

      setRows((prev) => {
        const next = [...prev]
        for (let i = 1; i < lines.length; i += 1) {
          const cols = parseCsvLine(lines[i])
          const rowIndexRaw = idxRow >= 0 ? String(cols[idxRow] || '').trim() : ''
          const rowIndexNorm = normalizeNumericLike(rowIndexRaw)
          const specIdRaw = idxSpec >= 0 ? String(cols[idxSpec] || '') : ''
          const specIdNorm = normalizeKey(specIdRaw)
          const specIdNum = normalizeNumericLike(specIdRaw)
          const codeTagRaw = idxCode >= 0 ? String(cols[idxCode] || '') : ''
          const codeTagNorm = normalizeKey(codeTagRaw)

          const rowIndex =
            byRowIndex.get(rowIndexRaw) ??
            byRowIndex.get(rowIndexNorm) ??
            bySpecId.get(specIdRaw) ??
            bySpecId.get(specIdNorm) ??
            bySpecId.get(specIdNum) ??
            byCodeTag.get(codeTagRaw) ??
            byCodeTag.get(codeTagNorm) ??
            (i - 1 < next.length ? (i - 1) : null)

          if (rowIndex == null) continue

          next[rowIndex] = {
            ...next[rowIndex],
            unit_price: cols[idxUnit] ?? '',
            discount_percent: cols[idxDiscount] ?? '',
            tariff_percent: cols[idxTariff] ?? '',
            lead_time_days: cols[idxLead] ?? '',
            dealer_notes: cols[idxNotes] ?? ''
          }
          updatedCount += 1
        }
        return next
      })

      if (updatedCount === 0) {
        setStatusMessage('CSV imported, but 0 rows matched your current bid items. Check spec_item_id or code/tag values.')
      } else {
        setStatusMessage(`CSV imported. Updated ${updatedCount} rows. Click Save Draft to persist.`)
      }
    } catch (_error) {
      setStatusMessage('CSV import failed: unable to read file.')
    } finally {
      event.target.value = ''
    }
  }

  useEffect(() => {
    let active = true

    async function loadBid() {
      setLoading(true)
      try {
        const result = await fetchDealerBid(token)
        if (!active) return

        setRows(result.bid?.line_items || [])
        setDeliveryAmount(result.bid?.delivery_amount ?? '')
        setInstallAmount(result.bid?.install_amount ?? '')
        setEscalationAmount(result.bid?.escalation_amount ?? '')
        setContingencyAmount(result.bid?.contingency_amount ?? '')
        setSalesTaxAmount(result.bid?.sales_tax_amount ?? '')
        setBidState(result.bid?.state || 'draft')
        setSubmittedAt(result.bid?.submitted_at || null)
        setStatusMessage('Bid loaded.')
      } catch (error) {
        if (!active) return
        setStatusMessage(error.message)
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    loadBid()
    return () => {
      active = false
    }
  }, [token])

  const updateRow = (index, key, value) => {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const buildLineItemPayload = () => {
    return rows.map((row) => ({
      spec_item_id: row.spec_item_id,
      unit_price: row.unit_price,
      discount_percent: row.discount_percent,
      tariff_percent: row.tariff_percent,
      lead_time_days: row.lead_time_days,
      dealer_notes: row.dealer_notes
    }))
  }

  const saveDraftRequest = async () => {
    const result = await saveDealerBid(token, buildLineItemPayload(), {
      delivery_amount: deliveryAmount,
      install_amount: installAmount,
      escalation_amount: escalationAmount,
      contingency_amount: contingencyAmount,
      sales_tax_amount: salesTaxAmount
    })
    setBidState(result.state || 'draft')
    setLastSavedAt(result.updated_at || null)
    return result
  }

  const handleSaveDraft = async () => {
    if (bidState === 'submitted') return

    setLoading(true)
    setStatusMessage('Saving draft...')

    try {
      await saveDraftRequest()
      setStatusMessage('Draft saved.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (bidState === 'submitted') return

    setLoading(true)
    setStatusMessage('Submitting bid...')

    try {
      await saveDraftRequest()
      const result = await submitDealerBid(token)
      setBidState('submitted')
      setSubmittedAt(result.submitted_at || null)
      setStatusMessage('Bid submitted. This bid is now locked.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stack">
      <SectionCard
        title="Dealer Bid Entry"
        actions={
          bidState === 'submitted' ? null : (
            <div className="action-row">
              <button className="btn" onClick={handleSaveDraft} disabled={loading}>Save Draft</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>Submit Final</button>
            </div>
          )
        }
      >
        <p className="text-muted">State: {bidState}</p>
        <p className="text-muted">Last saved: {formatTimestamp(lastSavedAt)}</p>
        <p className="text-muted">Submitted: {formatTimestamp(submittedAt)}</p>
        <p className="text-muted">{statusMessage}</p>
      </SectionCard>

      <SectionCard
        title="Line Items"
        actions={
          <div className="action-row">
            <button className="btn" onClick={downloadCsvTemplate}>Download CSV</button>
            <label className={`btn ${bidState === 'submitted' ? 'btn-disabled' : ''}`}>
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={importCsvFile}
                style={{ display: 'none' }}
                disabled={bidState === 'submitted'}
              />
            </label>
          </div>
        }
      >
        <table className="table dense">
          <thead>
            <tr>
              <th>Code/Tag</th>
              <th>Product</th>
              <th>Brand Name</th>
              <th>Qty/UOM</th>
              <th>Unit List Price</th>
              <th>% Discount</th>
              <th>% Tariff</th>
              <th>Unit Net Price</th>
              <th>Lead Time (days)</th>
              <th>Dealer Notes</th>
              <th>Extended Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.spec_item_id}>
                <td>{row.sku || '—'}</td>
                <td>{row.product_name || '—'}</td>
                <td>{row.brand_name || '—'}</td>
                <td>{row.quantity || '—'} {row.uom || ''}</td>
                <td>
                  <input
                    value={row.unit_price ?? ''}
                    onChange={(event) => updateRow(index, 'unit_price', event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
                <td>
                  <input
                    value={row.discount_percent ?? ''}
                    onChange={(event) => updateRow(index, 'discount_percent', event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
                <td>
                  <input
                    value={row.tariff_percent ?? ''}
                    onChange={(event) => updateRow(index, 'tariff_percent', event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
                <td>{money(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent))}</td>
                <td>
                  <input
                    value={row.lead_time_days ?? ''}
                    onChange={(event) => updateRow(index, 'lead_time_days', event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
                <td>
                  <input
                    value={row.dealer_notes ?? ''}
                    onChange={(event) => updateRow(index, 'dealer_notes', event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
                <td>{money(extendedAmount(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent), row.quantity))}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-muted">No line items loaded.</td>
              </tr>
            ) : null}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="total-row">
                <td colSpan={10} style={{ textAlign: 'right' }}>Sub-total</td>
                <td>{money(subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={10} style={{ textAlign: 'right' }}>Delivery</td>
                <td>
                  <input
                    value={deliveryAmount}
                    onChange={(event) => setDeliveryAmount(event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={10} style={{ textAlign: 'right' }}>Install</td>
                <td>
                  <input
                    value={installAmount}
                    onChange={(event) => setInstallAmount(event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={10} style={{ textAlign: 'right' }}>Escalation</td>
                <td>
                  <input
                    value={escalationAmount}
                    onChange={(event) => setEscalationAmount(event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={10} style={{ textAlign: 'right' }}>Contingency</td>
                <td>
                  <input
                    value={contingencyAmount}
                    onChange={(event) => setContingencyAmount(event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={10} style={{ textAlign: 'right' }}>Sales Tax</td>
                <td>
                  <input
                    value={salesTaxAmount}
                    onChange={(event) => setSalesTaxAmount(event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
              </tr>
              <tr className="total-row">
                <td colSpan={10} style={{ textAlign: 'right' }}>Grand Total</td>
                <td>{money(grandTotal)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </SectionCard>
    </div>
  )
}
