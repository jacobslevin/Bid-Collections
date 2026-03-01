import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import { API_BASE_URL, createDealerPostAwardUpload, fetchDealerBid, saveDealerBid, submitDealerBid } from '../lib/api'
import bidClosedIcon from '../assets/vendor-bid/bid-closed.svg'
import downloadCsvIcon from '../assets/vendor-bid/download-csv.svg'
import dpLogo from '../assets/vendor-bid/dp-logo.svg'
import draftIcon from '../assets/vendor-bid/draft.svg'
import grandTotalIcon from '../assets/vendor-bid/grand-total.svg'
import importCsvIcon from '../assets/vendor-bid/import-csv.svg'
import lastSavedIcon from '../assets/vendor-bid/last-saved.svg'
import saveWhiteIcon from '../assets/vendor-bid/save-white.svg'
import submitWhiteIcon from '../assets/vendor-bid/submit-white.svg'
import submittedStatusIcon from '../assets/vendor-bid/submitted-status.svg'
import submittedIcon from '../assets/vendor-bid/submitted.svg'

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

function isValidLeadTimeValue(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return true
  if (/^\d+$/.test(raw)) return true

  const range = raw.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!range) return false
  return Number(range[1]) <= Number(range[2])
}

function isNonNegativeNumberOrBlank(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return true
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0
}

function isPercentOrBlank(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return true
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
}

function rowFieldError(row, field) {
  if (field === 'unit_price') {
    const raw = String(row?.unit_price ?? '').trim()
    if (row?.is_substitution && !raw) return 'Substitution requires Unit List Price'
    return isNonNegativeNumberOrBlank(raw) ? null : 'Unit List Price must be a non-negative number'
  }

  if (field === 'discount_percent') {
    return isPercentOrBlank(row?.discount_percent) ? null : '% Discount must be between 0 and 100'
  }

  if (field === 'tariff_percent') {
    return isPercentOrBlank(row?.tariff_percent) ? null : '% Tariff must be between 0 and 100'
  }

  if (field === 'lead_time_days') {
    return isValidLeadTimeValue(row?.lead_time_days) ? null : 'Lead time must be a whole number or range like 30-45'
  }

  return null
}

export default function DealerBidPage() {
  const { token } = useParams()

  const [rows, setRows] = useState([])
  const [projectName, setProjectName] = useState('')
  const [bidPackageName, setBidPackageName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [deliveryAmount, setDeliveryAmount] = useState('')
  const [installAmount, setInstallAmount] = useState('')
  const [escalationAmount, setEscalationAmount] = useState('')
  const [contingencyAmount, setContingencyAmount] = useState('')
  const [salesTaxAmount, setSalesTaxAmount] = useState('')
  const [activeGeneralFields, setActiveGeneralFields] = useState([
    'delivery_amount',
    'install_amount',
    'escalation_amount',
    'contingency_amount',
    'sales_tax_amount'
  ])
  const [bidState, setBidState] = useState('draft')
  const [submittedAt, setSubmittedAt] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [statusMessage, setStatusMessage] = useState('Loading bid...')
  const [loading, setLoading] = useState(false)
  const [postAwardEnabled, setPostAwardEnabled] = useState(false)
  const [awardedVendor, setAwardedVendor] = useState(false)
  const [postAwardUploads, setPostAwardUploads] = useState([])
  const [activeSpecUploadsModal, setActiveSpecUploadsModal] = useState(null)

  const rowIdentity = (row, index) => `${row.spec_item_id}-${row.is_substitution ? 'sub' : 'base'}-${index}`

  const rowDisplayNumberBySpec = useMemo(() => {
    const map = new Map()
    let counter = 0
    rows.forEach((row) => {
      if (!map.has(row.spec_item_id)) {
        counter += 1
        map.set(row.spec_item_id, counter)
      }
    })
    return map
  }, [rows])

  const hasSubstitutionForSpec = (specItemId) => rows.some((row) => row.spec_item_id === specItemId && row.is_substitution)

  const pickSubtotalRow = (specRows) => {
    const basisPriced = specRows.find((row) => !row.is_substitution && numberOrNull(row.unit_price) != null)
    if (basisPriced) return basisPriced

    const substitutionPriced = specRows.find((row) => row.is_substitution && numberOrNull(row.unit_price) != null)
    if (substitutionPriced) return substitutionPriced

    return specRows.find((row) => !row.is_substitution) || specRows[0]
  }

  const subtotal = useMemo(() => (
    Array.from(rows.reduce((grouped, row) => {
      const list = grouped.get(row.spec_item_id) || []
      list.push(row)
      grouped.set(row.spec_item_id, list)
      return grouped
    }, new Map()).values()).reduce((sum, specRows) => {
      const activeRow = pickSubtotalRow(specRows)
      const value = extendedAmount(
        netUnitPrice(activeRow?.unit_price, activeRow?.discount_percent, activeRow?.tariff_percent),
        activeRow?.quantity
      )
      return sum + (value ?? 0)
    }, 0)
  ), [rows])

  const grandTotal = useMemo(() => (
    subtotal +
    (activeGeneralFields.includes('delivery_amount') ? (numberOrNull(deliveryAmount) ?? 0) : 0) +
    (activeGeneralFields.includes('install_amount') ? (numberOrNull(installAmount) ?? 0) : 0) +
    (activeGeneralFields.includes('escalation_amount') ? (numberOrNull(escalationAmount) ?? 0) : 0) +
    (activeGeneralFields.includes('contingency_amount') ? (numberOrNull(contingencyAmount) ?? 0) : 0) +
    (activeGeneralFields.includes('sales_tax_amount') ? (numberOrNull(salesTaxAmount) ?? 0) : 0)
  ), [subtotal, deliveryAmount, installAmount, escalationAmount, contingencyAmount, salesTaxAmount, activeGeneralFields])

  const progressSummary = useMemo(() => {
    const grouped = rows.reduce((memo, row) => {
      const list = memo.get(row.spec_item_id) || []
      list.push(row)
      memo.set(row.spec_item_id, list)
      return memo
    }, new Map())

    const totalLineItems = grouped.size
    const quotedLineItems = Array.from(grouped.values()).reduce((count, specRows) => {
      const hasQuotedPrice = specRows.some((row) => numberOrNull(row.unit_price) != null)
      return count + (hasQuotedPrice ? 1 : 0)
    }, 0)
    const percentComplete = totalLineItems > 0 ? (quotedLineItems / totalLineItems) * 100 : 0

    return {
      quotedLineItems,
      totalLineItems,
      percentComplete
    }
  }, [rows])

  const activityLabel = bidState === 'submitted' ? 'SUBMITTED' : 'LAST SAVED'
  const activityValue = bidState === 'submitted' ? formatTimestamp(submittedAt) : formatTimestamp(lastSavedAt)
  const activityIcon = bidState === 'submitted' ? submittedIcon : lastSavedIcon
  const statusIsError = /failed|error|must|cannot|invalid|not a number|greater than|less than|required|blank/i.test(statusMessage || '')
  const winnerView = postAwardEnabled && awardedVendor
  const statusTone = winnerView ? 'winner' : bidState
  const statusLabel = winnerView ? 'winner' : bidState
  const statusIcon = winnerView || bidState === 'submitted' ? submittedStatusIcon : draftIcon

  const downloadCsvTemplate = () => {
    const headers = [
      'row_index',
      'row_type',
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
        row.is_substitution ? 'substitution' : 'basis_of_design',
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
        if (row.is_substitution) return

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
        setProjectName(result.bid?.project_name || '')
        setBidPackageName(result.bid?.bid_package_name || '')
        setInstructions(result.bid?.instructions || '')
        setDeliveryAmount(result.bid?.delivery_amount ?? '')
        setInstallAmount(result.bid?.install_amount ?? '')
        setEscalationAmount(result.bid?.escalation_amount ?? '')
        setContingencyAmount(result.bid?.contingency_amount ?? '')
        setSalesTaxAmount(result.bid?.sales_tax_amount ?? '')
        setActiveGeneralFields(result.bid?.active_general_fields || [
          'delivery_amount',
          'install_amount',
          'escalation_amount',
          'contingency_amount',
          'sales_tax_amount'
        ])
        setBidState(result.bid?.state || 'draft')
        setSubmittedAt(result.bid?.submitted_at || null)
        setPostAwardEnabled(Boolean(result.bid?.post_award_enabled))
        setAwardedVendor(Boolean(result.bid?.awarded_vendor))
        setPostAwardUploads(result.bid?.post_award_uploads || [])
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

  const addSubstitutionRow = (index) => {
    const sourceRow = rows[index]
    if (!sourceRow || sourceRow.is_substitution || hasSubstitutionForSpec(sourceRow.spec_item_id)) return

    const newRow = {
      spec_item_id: sourceRow.spec_item_id,
      sku: sourceRow.sku,
      quantity: sourceRow.quantity,
      uom: sourceRow.uom,
      is_substitution: true,
      product_name: '',
      brand_name: '',
      substitution_product_name: '',
      substitution_brand_name: '',
      unit_price: '',
      discount_percent: '',
      tariff_percent: '',
      lead_time_days: '',
      dealer_notes: ''
    }

    setRows((prev) => {
      const next = [...prev]
      next.splice(index + 1, 0, newRow)
      return next
    })
  }

  const removeSubstitutionRow = (index) => {
    setRows((prev) => prev.filter((_row, rowIndex) => rowIndex !== index))
  }

  const buildLineItemPayload = () => {
    return rows.map((row) => ({
      spec_item_id: row.spec_item_id,
      is_substitution: row.is_substitution ? 'true' : 'false',
      substitution_product_name: row.is_substitution ? (row.product_name ?? '') : '',
      substitution_brand_name: row.is_substitution ? (row.brand_name ?? '') : '',
      unit_price: row.unit_price,
      discount_percent: row.discount_percent,
      tariff_percent: row.tariff_percent,
      lead_time_days: row.lead_time_days,
      dealer_notes: row.dealer_notes
    }))
  }

  const saveDraftRequest = async () => {
    const fieldOrder = ['unit_price', 'discount_percent', 'tariff_percent', 'lead_time_days']
    for (const row of rows) {
      for (const field of fieldOrder) {
        const error = rowFieldError(row, field)
        if (error) throw new Error(error)
      }
    }

    if (!isNonNegativeNumberOrBlank(deliveryAmount)) {
      throw new Error('Shipping must be a non-negative number.')
    }
    if (!isNonNegativeNumberOrBlank(installAmount)) {
      throw new Error('Install must be a non-negative number.')
    }
    if (!isNonNegativeNumberOrBlank(escalationAmount)) {
      throw new Error('Escalation must be a non-negative number.')
    }
    if (!isNonNegativeNumberOrBlank(contingencyAmount)) {
      throw new Error('Contingency must be a non-negative number.')
    }
    if (!isNonNegativeNumberOrBlank(salesTaxAmount)) {
      throw new Error('Sales Tax must be a non-negative number.')
    }

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

  const uploadPostAwardFile = async (event, specItemId = null) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!postAwardEnabled || !awardedVendor) {
      setStatusMessage('Post-award upload is only available for the awarded vendor.')
      event.target.value = ''
      return
    }

    setLoading(true)
    setStatusMessage('Uploading file...')
    try {
      const result = await createDealerPostAwardUpload(token, {
        file,
        fileName: file.name,
        specItemId
      })
      const uploaded = result.upload
      setPostAwardUploads((prev) => [uploaded, ...prev])
      setStatusMessage('File uploaded.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  const uploadsForSpecItem = (specItemId) => (
    postAwardUploads.filter((upload) => String(upload.spec_item_id || '') === String(specItemId))
  )
  const generalUploads = postAwardUploads.filter((upload) => !upload.spec_item_id)

  return (
    <div className="stack vendor-bid-page">
      <div className="vendor-brandline">
        <img src={dpLogo} alt="Designer Pages PRO" className="vendor-brand-logo" />
        {bidState === 'submitted' ? (
          <div className="vendor-closed-banner">
            <img src={bidClosedIcon} alt="" className="vendor-closed-icon" />
            <span>
              <strong>Bid Closed.</strong> Need to update something? Reach out to the designer who invited you to reopen it.
            </span>
          </div>
        ) : null}
      </div>

      <section className="vendor-head-card">
        <div className="vendor-head-strip">
          <h2>
            {projectName && bidPackageName
              ? `${projectName}: ${bidPackageName}`
              : (bidPackageName || 'Project Name')}
          </h2>
          {bidState === 'submitted' || winnerView ? null : (
            <div className="action-row">
              <button className="btn vendor-strip-btn" onClick={handleSaveDraft} disabled={loading}>
                <img src={saveWhiteIcon} alt="" className="vendor-btn-icon" />
                Save Draft
              </button>
              <button className="btn btn-primary vendor-strip-btn-primary" onClick={handleSubmit} disabled={loading}>
                <img src={submitWhiteIcon} alt="" className="vendor-btn-icon" />
                Submit Final
              </button>
            </div>
          )}
        </div>
        <div className="vendor-metric-grid">
          <div className="vendor-metric-card">
            <img src={statusIcon} alt="" className="vendor-metric-icon" />
            <div>
              <div className="vendor-metric-label">STATUS</div>
              <div className={`vendor-state-pill ${statusTone}`}>{statusLabel}</div>
            </div>
          </div>
          <div className="vendor-metric-card">
            <img src={submittedStatusIcon} alt="" className="vendor-metric-icon" />
            <div>
              <div className="vendor-metric-label">QUOTED ITEMS</div>
              <div className="vendor-metric-value">
                {progressSummary.quotedLineItems} / {progressSummary.totalLineItems}
              </div>
              <div className="vendor-metric-subvalue">{progressSummary.percentComplete.toFixed(0)}% complete</div>
            </div>
          </div>
          <div className="vendor-metric-card">
            <img src={activityIcon} alt="" className="vendor-metric-icon" />
            <div>
              <div className="vendor-metric-label">{activityLabel}</div>
              <div className="vendor-metric-value">{activityValue}</div>
            </div>
          </div>
          <div className="vendor-metric-card vendor-total-card">
            <img src={grandTotalIcon} alt="" className="vendor-metric-icon" />
            <div>
              <div className="vendor-metric-label">GRAND TOTAL</div>
              <div className="vendor-total-value">{money(grandTotal)}</div>
            </div>
          </div>
        </div>
      </section>

      {instructions ? (
        <SectionCard title="Instructions">
          <p className="text-muted" style={{ whiteSpace: 'pre-wrap' }}>{instructions}</p>
        </SectionCard>
      ) : null}

      {postAwardEnabled ? (
        <SectionCard title="Post-Award Uploads">
          {!awardedVendor ? (
            <p className="text-muted">A vendor has been awarded. Upload access is available to the awarded vendor only.</p>
          ) : (
            <div className="stack">
              <div>
                <label className="btn">
                  Upload General File
                  <input
                    type="file"
                    onChange={(event) => uploadPostAwardFile(event, null)}
                    style={{ display: 'none' }}
                    disabled={loading}
                  />
                </label>
                <div className="text-muted" style={{ marginTop: '0.35rem' }}>
                  {generalUploads.length} general file(s) uploaded
                </div>
                {generalUploads.length > 0 ? (
                  <table className="table dense" style={{ marginTop: '0.45rem' }}>
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Uploaded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generalUploads.map((upload) => (
                        <tr key={`general-upload-${upload.id}`}>
                          <td>{upload.file_name || '—'}</td>
                          <td>{formatTimestamp(upload.uploaded_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
              <p className="text-muted" style={{ margin: 0 }}>
                Uploads per line item are managed directly in the Line Items table below.
              </p>
            </div>
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Line Items"
        actions={
          <div className="action-row">
            {winnerView ? null : (
              <>
                <button className="btn" onClick={downloadCsvTemplate}>
                  <img src={downloadCsvIcon} alt="" className="vendor-table-action-icon" />
                  Download CSV
                </button>
                <label className={`btn ${bidState === 'submitted' ? 'btn-disabled' : ''}`}>
                  <img src={importCsvIcon} alt="" className="vendor-table-action-icon" />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={importCsvFile}
                    style={{ display: 'none' }}
                    disabled={bidState === 'submitted'}
                  />
                </label>
              </>
            )}
          </div>
        }
      >
        <p className={`vendor-status-inline ${statusIsError ? 'error' : 'text-muted'}`}>{statusMessage}</p>
        <table className="table dense vendor-line-table">
          <thead>
            <tr>
              <th></th>
              <th>Code/Tag</th>
              <th>Product</th>
              <th>Brand</th>
              <th className="qty-col">Qty/UOM</th>
              {winnerView ? null : <th>Unit List Price</th>}
              {winnerView ? null : <th>% Discount</th>}
              {winnerView ? null : <th>% Tariff</th>}
              {winnerView ? null : <th>Unit Net Price</th>}
              {winnerView ? null : <th>Lead Time (days)</th>}
              {winnerView ? null : <th>Notes</th>}
              <th>Extended Price</th>
              {winnerView ? <th>Upload</th> : null}
              {winnerView ? <th>Files</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowUploads = uploadsForSpecItem(row.spec_item_id)
              if (winnerView) {
                return (
                  <tr key={rowIdentity(row, index)}>
                    <td className="vendor-row-index">
                      {rowDisplayNumberBySpec.get(row.spec_item_id)}
                    </td>
                    <td>
                      {row.sku || '—'}
                      {row.approved_source === 'alt' || row.is_substitution ? <span className="substitution-chip">Sub</span> : null}
                    </td>
                    <td>{row.product_name || '—'}</td>
                    <td>{row.brand_name || '—'}</td>
                    <td className="qty-col">{row.quantity || '—'} {row.uom || ''}</td>
                    <td>{money(extendedAmount(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent), row.quantity))}</td>
                    <td>
                      <label className="btn">
                        Upload File
                        <input
                          type="file"
                          onChange={(event) => uploadPostAwardFile(event, row.spec_item_id)}
                          style={{ display: 'none' }}
                          disabled={loading}
                        />
                      </label>
                    </td>
                    <td>
                      {rowUploads.length > 0 ? (
                        <div className="action-row" style={{ gap: '0.4rem' }}>
                          <span>{rowUploads.length} file(s)</span>
                          <button
                            type="button"
                            className="btn mini-link-btn"
                            style={{ marginTop: 0 }}
                            onClick={() => setActiveSpecUploadsModal({
                              specItemId: row.spec_item_id,
                              codeTag: row.sku || '—',
                              productName: row.product_name || '—'
                            })}
                          >
                            View
                          </button>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={rowIdentity(row, index)} className={row.is_substitution ? 'substitution-row' : ''}>
                  <td className="vendor-row-index">
                    {rowDisplayNumberBySpec.get(row.spec_item_id)}{row.is_substitution ? ' Sub' : ''}
                  </td>
                  <td>
                    {row.sku || '—'}
                    {row.is_substitution ? <span className="substitution-chip">Sub</span> : null}
                    {!row.is_substitution && bidState !== 'submitted' && !hasSubstitutionForSpec(row.spec_item_id) ? (
                      <button className="mini-link-btn" type="button" onClick={() => addSubstitutionRow(index)}>
                        + Add Substitution
                      </button>
                    ) : null}
                    {row.is_substitution && bidState !== 'submitted' ? (
                      <button className="mini-link-btn danger" type="button" onClick={() => removeSubstitutionRow(index)}>
                        Remove Substitution
                      </button>
                    ) : null}
                  </td>
                  <td>
                    {row.is_substitution ? (
                      <input
                        value={row.product_name ?? ''}
                        onChange={(event) => updateRow(index, 'product_name', event.target.value)}
                        placeholder="Substitution product"
                        disabled={bidState === 'submitted'}
                      />
                    ) : (
                      row.product_name || '—'
                    )}
                  </td>
                  <td>
                    {row.is_substitution ? (
                      <input
                        value={row.brand_name ?? ''}
                        onChange={(event) => updateRow(index, 'brand_name', event.target.value)}
                        placeholder="Substitution brand"
                        disabled={bidState === 'submitted'}
                      />
                    ) : (
                      row.brand_name || '—'
                    )}
                  </td>
                  <td className="qty-col">{row.quantity || '—'} {row.uom || ''}</td>
                  <td>
                    <input
                      value={row.unit_price ?? ''}
                      onChange={(event) => updateRow(index, 'unit_price', event.target.value)}
                      className={rowFieldError(row, 'unit_price') ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  </td>
                  <td>
                    <input
                      value={row.discount_percent ?? ''}
                      onChange={(event) => updateRow(index, 'discount_percent', event.target.value)}
                      className={rowFieldError(row, 'discount_percent') ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  </td>
                  <td>
                    <input
                      value={row.tariff_percent ?? ''}
                      onChange={(event) => updateRow(index, 'tariff_percent', event.target.value)}
                      className={rowFieldError(row, 'tariff_percent') ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  </td>
                  <td>{money(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent))}</td>
                  <td>
                    <input
                      value={row.lead_time_days ?? ''}
                      onChange={(event) => updateRow(index, 'lead_time_days', event.target.value)}
                      placeholder="30 or 30-45"
                      className={rowFieldError(row, 'lead_time_days') ? 'input-error' : ''}
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
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={winnerView ? 8 : 12} className="text-muted">No line items loaded.</td>
              </tr>
            ) : null}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="total-row">
                <td colSpan={winnerView ? 5 : 11} style={{ textAlign: 'right' }}>Sub-total</td>
                <td>{money(subtotal)}</td>
                {winnerView ? <td></td> : null}
                {winnerView ? <td></td> : null}
              </tr>
              {activeGeneralFields.includes('delivery_amount') ? (
              <tr>
                <td colSpan={winnerView ? 5 : 11} style={{ textAlign: 'right' }}>Shipping</td>
                <td>
                  {winnerView ? money(deliveryAmount) : (
                    <input
                      value={deliveryAmount}
                      onChange={(event) => setDeliveryAmount(event.target.value)}
                      className={!isNonNegativeNumberOrBlank(deliveryAmount) ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  )}
                </td>
                {winnerView ? <td></td> : null}
                {winnerView ? <td></td> : null}
              </tr>
              ) : null}
              {activeGeneralFields.includes('install_amount') ? (
              <tr>
                <td colSpan={winnerView ? 5 : 11} style={{ textAlign: 'right' }}>Install</td>
                <td>
                  {winnerView ? money(installAmount) : (
                    <input
                      value={installAmount}
                      onChange={(event) => setInstallAmount(event.target.value)}
                      className={!isNonNegativeNumberOrBlank(installAmount) ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  )}
                </td>
                {winnerView ? <td></td> : null}
                {winnerView ? <td></td> : null}
              </tr>
              ) : null}
              {activeGeneralFields.includes('escalation_amount') ? (
              <tr>
                <td colSpan={winnerView ? 5 : 11} style={{ textAlign: 'right' }}>Escalation</td>
                <td>
                  {winnerView ? money(escalationAmount) : (
                    <input
                      value={escalationAmount}
                      onChange={(event) => setEscalationAmount(event.target.value)}
                      className={!isNonNegativeNumberOrBlank(escalationAmount) ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  )}
                </td>
                {winnerView ? <td></td> : null}
                {winnerView ? <td></td> : null}
              </tr>
              ) : null}
              {activeGeneralFields.includes('contingency_amount') ? (
              <tr>
                <td colSpan={winnerView ? 5 : 11} style={{ textAlign: 'right' }}>Contingency</td>
                <td>
                  {winnerView ? money(contingencyAmount) : (
                    <input
                      value={contingencyAmount}
                      onChange={(event) => setContingencyAmount(event.target.value)}
                      className={!isNonNegativeNumberOrBlank(contingencyAmount) ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  )}
                </td>
                {winnerView ? <td></td> : null}
                {winnerView ? <td></td> : null}
              </tr>
              ) : null}
              {activeGeneralFields.includes('sales_tax_amount') ? (
              <tr>
                <td colSpan={winnerView ? 5 : 11} style={{ textAlign: 'right' }}>Sales Tax</td>
                <td>
                  {winnerView ? money(salesTaxAmount) : (
                    <input
                      value={salesTaxAmount}
                      onChange={(event) => setSalesTaxAmount(event.target.value)}
                      className={!isNonNegativeNumberOrBlank(salesTaxAmount) ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  )}
                </td>
                {winnerView ? <td></td> : null}
                {winnerView ? <td></td> : null}
              </tr>
              ) : null}
              <tr className="total-row">
                <td colSpan={winnerView ? 5 : 11} style={{ textAlign: 'right' }}>Grand Total</td>
                <td>{money(grandTotal)}</td>
                {winnerView ? <td></td> : null}
                {winnerView ? <td></td> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </SectionCard>

      {winnerView && activeSpecUploadsModal ? (
        <div className="modal-backdrop" onClick={() => setActiveSpecUploadsModal(null)}>
          <div className="modal-card award-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <h2>{`Files · ${activeSpecUploadsModal.codeTag}`}</h2>
              <button className="btn" onClick={() => setActiveSpecUploadsModal(null)}>Close</button>
            </div>
            <p className="text-muted" style={{ marginTop: 0 }}>{activeSpecUploadsModal.productName}</p>
            <table className="table dense">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {uploadsForSpecItem(activeSpecUploadsModal.specItemId).map((upload) => (
                  <tr key={`modal-upload-${upload.id}`}>
                    <td>{upload.file_name || '—'}</td>
                    <td>{formatTimestamp(upload.uploaded_at)}</td>
                    <td>
                      {upload.download_url ? (
                        <a
                          className="mini-link-btn"
                          href={`${API_BASE_URL}${upload.download_url}`}
                          target="_blank"
                          rel="noreferrer"
                          download
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {uploadsForSpecItem(activeSpecUploadsModal.specItemId).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted">No files uploaded yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
