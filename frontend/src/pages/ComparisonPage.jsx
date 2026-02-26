import { Fragment, useEffect, useMemo, useState } from 'react'
import SectionCard from '../components/SectionCard'
import { comparisonExportUrl, fetchBidPackages, fetchComparison } from '../lib/api'

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

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

function delta(value, avg) {
  const v = numberOrNull(value)
  const a = numberOrNull(avg)
  if (v == null || a == null || a === 0) return '—'

  const pct = ((v - a) / a) * 100
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function percentAgainst(value, baseline) {
  const v = numberOrNull(value)
  const b = numberOrNull(baseline)
  if (v == null || b == null || b === 0) return null
  return ((v - b) / b) * 100
}

function percentDisplay(value) {
  const n = numberOrNull(value)
  if (n == null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

function companyName(dealerName) {
  const raw = String(dealerName || '')
  const company = raw.split(/\s[-–—]\s/, 2)[0]?.trim()
  return company || raw || 'Dealer'
}

export default function ComparisonPage() {
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState('')
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [data, setData] = useState({ dealers: [], rows: [] })
  const [visibleDealerIds, setVisibleDealerIds] = useState([])
  const [responderSort, setResponderSort] = useState('lowest_bid')
  const [comparisonMode, setComparisonMode] = useState('average')
  const [activeSubPopoverKey, setActiveSubPopoverKey] = useState(null)
  const [rowSort, setRowSort] = useState({ key: 'sku', direction: 'asc', inviteId: null })
  const [dealerPriceMode, setDealerPriceMode] = useState({})
  const [excludedRowIds, setExcludedRowIds] = useState([])
  const [activeGeneralFields, setActiveGeneralFields] = useState([
    'delivery_amount',
    'install_amount',
    'escalation_amount',
    'contingency_amount',
    'sales_tax_amount'
  ])
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)

  useEffect(() => {
    const loadBidPackages = async () => {
      setLoadingPackages(true)
      try {
        const payload = await fetchBidPackages()
        const list = payload.bid_packages || []
        setBidPackages(list)
        if (list.length > 0) {
          setSelectedBidPackageId(String(list[0].id))
        }
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setLoadingPackages(false)
      }
    }

    loadBidPackages()
  }, [])

  const loadComparison = async () => {
    if (!selectedBidPackageId) return

    setLoading(true)
    setStatusMessage('Loading comparison...')

    try {
      const payload = await fetchComparison(selectedBidPackageId)
      setData({ dealers: payload.dealers || [], rows: payload.rows || [] })
      setActiveGeneralFields(payload.active_general_fields || [
        'delivery_amount',
        'install_amount',
        'escalation_amount',
        'contingency_amount',
        'sales_tax_amount'
      ])
      setVisibleDealerIds((payload.dealers || []).map((dealer) => dealer.invite_id))
      setExcludedRowIds([])
      setDealerPriceMode(
        (payload.dealers || []).reduce((acc, dealer) => {
          acc[dealer.invite_id] = 'bod'
          return acc
        }, {})
      )
      setLoadedBidPackageId(String(selectedBidPackageId))
      setStatusMessage('')
    } catch (error) {
      setData({ dealers: [], rows: [] })
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const effectiveChoice = (row, cell) => {
    if (!cell) return null
    if (cell.has_bod_price && cell.has_alt_price) {
      const preferred = dealerPriceMode[cell.invite_id] || 'bod'
      return preferred === 'alt' ? 'alt' : 'bod'
    }
    if (cell.has_bod_price) return 'bod'
    if (cell.has_alt_price) return 'alt'
    return null
  }

  const effectiveUnitPrice = (row, cell) => {
    if (!cell) return null
    const choice = effectiveChoice(row, cell)
    if (choice === 'bod') return cell.bod_unit_price
    if (choice === 'alt') return cell.alt_unit_price
    return cell.unit_price
  }

  const dynamicRowAverage = (row) => {
    const prices = (row.dealers || [])
      .map((cell) => numberOrNull(effectiveUnitPrice(row, cell)))
      .filter((value) => value != null)

    if (prices.length === 0) return null
    return prices.reduce((sum, value) => sum + value, 0) / prices.length
  }

  const dynamicRowBest = (row) => {
    const prices = (row.dealers || [])
      .map((cell) => numberOrNull(effectiveUnitPrice(row, cell)))
      .filter((value) => value != null)
    if (prices.length === 0) return null
    return Math.min(...prices)
  }

  const rowIncluded = (row) => !excludedRowIds.includes(row.spec_item_id)
  const activeRows = (data.rows || []).filter((row) => rowIncluded(row))

  const avgSubtotal = activeRows.reduce((sum, row) => {
    const value = extendedAmount(dynamicRowAverage(row), row.quantity)
    return value == null ? sum : sum + value
  }, 0)

  const dealerTotalsById = (data.dealers || []).reduce((acc, dealer) => {
    const summary = activeRows.reduce((memo, row) => {
      const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
      const effectivePrice = effectiveUnitPrice(row, cell)
      const value = extendedAmount(effectivePrice, row.quantity)
      if (value != null) memo.subtotal += value
      return memo
    }, { subtotal: 0 })

    const subtotal = summary.subtotal
    const delivery = numberOrNull(dealer.delivery_amount) ?? 0
    const install = numberOrNull(dealer.install_amount) ?? 0
    const escalation = numberOrNull(dealer.escalation_amount) ?? 0
    const contingency = numberOrNull(dealer.contingency_amount) ?? 0
    const salesTax = numberOrNull(dealer.sales_tax_amount) ?? 0
    const total = subtotal +
      (activeGeneralFields.includes('delivery_amount') ? delivery : 0) +
      (activeGeneralFields.includes('install_amount') ? install : 0) +
      (activeGeneralFields.includes('escalation_amount') ? escalation : 0) +
      (activeGeneralFields.includes('contingency_amount') ? contingency : 0) +
      (activeGeneralFields.includes('sales_tax_amount') ? salesTax : 0)
    acc[dealer.invite_id] = {
      subtotal,
      delivery,
      install,
      escalation,
      contingency,
      salesTax,
      total
    }
    return acc
  }, {})

  const dealerQuoteCountsById = (data.dealers || []).reduce((acc, dealer) => {
    const summary = (data.rows || []).reduce((memo, row) => {
      const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
      const quotedBod = Boolean(cell?.has_bod_price)
      const quotedAlt = Boolean(cell?.has_alt_price)
      if (quotedBod && !quotedAlt) memo.bodOnlyCount += 1
      if (!quotedBod && quotedAlt) memo.altOnlyCount += 1
      if (quotedBod && quotedAlt) memo.mixedLineCount += 1
      return memo
    }, { altOnlyCount: 0, mixedLineCount: 0, bodOnlyCount: 0 })

    acc[dealer.invite_id] = summary
    return acc
  }, {})

  useEffect(() => {
    const knownRowIds = new Set((data.rows || []).map((row) => row.spec_item_id))
    setExcludedRowIds((prev) => prev.filter((id) => knownRowIds.has(id)))
  }, [data.rows])

  const includeAllRows = () => {
    setExcludedRowIds([])
  }

  const excludeAllRows = () => {
    setExcludedRowIds((data.rows || []).map((row) => row.spec_item_id))
  }

  const toggleRowIncluded = (specItemId) => {
    setExcludedRowIds((prev) => (
      prev.includes(specItemId)
        ? prev.filter((id) => id !== specItemId)
        : [...prev, specItemId]
    ))
  }

  const allRowsIncluded = (data.rows || []).length > 0 && excludedRowIds.length === 0

  const sortedDealers = [...(data.dealers || [])].sort((a, b) => {
    const totalA = dealerTotalsById[a.invite_id]?.total || 0
    const totalB = dealerTotalsById[b.invite_id]?.total || 0

    if (responderSort === 'highest_bid') return totalB - totalA
    if (responderSort === 'dealer_name') return (a.dealer_name || '').localeCompare(b.dealer_name || '')
    return totalA - totalB
  })

  const visibleDealers = sortedDealers.filter((dealer) => visibleDealerIds.includes(dealer.invite_id))
  const visibleSubtotals = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.subtotal).filter((v) => Number.isFinite(v))
  const visibleDeliveries = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.delivery).filter((v) => Number.isFinite(v))
  const visibleInstalls = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.install).filter((v) => Number.isFinite(v))
  const visibleEscalations = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.escalation).filter((v) => Number.isFinite(v))
  const visibleContingencies = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.contingency).filter((v) => Number.isFinite(v))
  const visibleSalesTaxes = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.salesTax).filter((v) => Number.isFinite(v))
  const visibleTotals = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.total).filter((v) => Number.isFinite(v))

  const avgDelivery = visibleDeliveries.length > 0 ? (visibleDeliveries.reduce((sum, v) => sum + v, 0) / visibleDeliveries.length) : 0
  const avgInstall = visibleInstalls.length > 0 ? (visibleInstalls.reduce((sum, v) => sum + v, 0) / visibleInstalls.length) : 0
  const avgEscalation = visibleEscalations.length > 0 ? (visibleEscalations.reduce((sum, v) => sum + v, 0) / visibleEscalations.length) : 0
  const avgContingency = visibleContingencies.length > 0 ? (visibleContingencies.reduce((sum, v) => sum + v, 0) / visibleContingencies.length) : 0
  const avgSalesTax = visibleSalesTaxes.length > 0 ? (visibleSalesTaxes.reduce((sum, v) => sum + v, 0) / visibleSalesTaxes.length) : 0
  const avgTotal = avgSubtotal +
    (activeGeneralFields.includes('delivery_amount') ? avgDelivery : 0) +
    (activeGeneralFields.includes('install_amount') ? avgInstall : 0) +
    (activeGeneralFields.includes('escalation_amount') ? avgEscalation : 0) +
    (activeGeneralFields.includes('contingency_amount') ? avgContingency : 0) +
    (activeGeneralFields.includes('sales_tax_amount') ? avgSalesTax : 0)

  const bestDealerSubtotal = visibleSubtotals.length > 0 ? Math.min(...visibleSubtotals) : null
  const bestDealerDelivery = visibleDeliveries.length > 0 ? Math.min(...visibleDeliveries) : null
  const bestDealerInstall = visibleInstalls.length > 0 ? Math.min(...visibleInstalls) : null
  const bestDealerEscalation = visibleEscalations.length > 0 ? Math.min(...visibleEscalations) : null
  const bestDealerContingency = visibleContingencies.length > 0 ? Math.min(...visibleContingencies) : null
  const bestDealerSalesTax = visibleSalesTaxes.length > 0 ? Math.min(...visibleSalesTaxes) : null
  const bestDealerTotal = visibleTotals.length > 0 ? Math.min(...visibleTotals) : null
  const showNextBestDeltaColumn = visibleDealers.length >= 2
  const dealerColumnsPerResponder = comparisonMode === 'competitive'
    ? (showNextBestDeltaColumn ? 4 : 3)
    : 3

  const rowVisibleDealerPrices = (row) => (
    visibleDealers
      .map((dealer) => {
        const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
        return numberOrNull(effectiveUnitPrice(row, cell))
      })
      .filter((value) => value != null)
  )

  const rowBestPrice = (row) => {
    const prices = rowVisibleDealerPrices(row)
    if (prices.length === 0) return null
    return Math.min(...prices)
  }

  const sortedUnique = (values) => Array.from(new Set(values.filter((v) => numberOrNull(v) != null))).sort((a, b) => a - b)

  const nextWorseValue = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    if (current == null) return null
    const prices = sortedUnique(values)
    const idx = prices.findIndex((price) => price === current)
    if (idx === -1 || idx >= prices.length - 1) return null
    return prices[idx + 1]
  }

  const betterValue = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    if (current == null) return null
    const prices = sortedUnique(values)
    const idx = prices.findIndex((price) => price === current)
    if (idx <= 0) return null
    return prices[idx - 1]
  }

  const betterDeltaNumeric = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    const better = betterValue(values, currentValue)
    if (current == null || better == null || better === 0) return null
    return ((current - better) / better) * 100
  }

  const betterDeltaDisplay = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    if (current == null) return '—'
    const prices = sortedUnique(values)
    if (prices.length < 2) return '—'
    const idx = prices.findIndex((price) => price === current)
    if (idx === -1) return '—'
    if (idx === 0) return 'NA, Lowest Price'
    const n = betterDeltaNumeric(values, currentValue)
    return n == null ? '—' : percentDisplay(n)
  }

  const nextBestDeltaNumeric = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    const next = nextWorseValue(values, currentValue)
    if (current == null || next == null || current === 0) return null
    const prices = sortedUnique(values)
    const isBest = prices[0] === current
    return isBest ? ((current - next) / current) * 100 : ((next - current) / current) * 100
  }

  const nextBestDeltaDisplay = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    if (current == null) return '—'
    const prices = sortedUnique(values)
    if (prices.length < 2) return '—'
    const idx = prices.findIndex((price) => price === current)
    if (idx === -1) return '—'
    if (idx === prices.length - 1) return 'NA, Highest Price'
    const n = nextBestDeltaNumeric(values, currentValue)
    return n == null ? '—' : percentDisplay(n)
  }

  const cycleSort = (key, inviteId = null) => {
    setRowSort((prev) => {
      if (prev.key === key && prev.inviteId === inviteId) {
        return { key, inviteId, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, inviteId, direction: 'asc' }
    })
  }

  const sortIndicator = (key, inviteId = null) => {
    if (rowSort.key !== key || rowSort.inviteId !== inviteId) return ''
    return rowSort.direction === 'asc' ? ' ▲' : ' ▼'
  }

  const deltaNumeric = (value, avg) => {
    const v = numberOrNull(value)
    const a = numberOrNull(avg)
    if (v == null || a == null || a === 0) return null
    return ((v - a) / a) * 100
  }

  const rowSortValue = (row) => {
    if (rowSort.key === 'sku') return row.sku || ''
    if (rowSort.key === 'product_name') return row.product_name || ''
    if (rowSort.key === 'quantity') return numberOrNull(row.quantity)
    if (rowSort.key === 'avg_unit_price') return numberOrNull(dynamicRowAverage(row))
    if (rowSort.key === 'dealer_price') {
      const cell = (row.dealers || []).find((d) => d.invite_id === rowSort.inviteId)
      return numberOrNull(effectiveUnitPrice(row, cell))
    }
    if (rowSort.key === 'dealer_delta') {
      const cell = (row.dealers || []).find((d) => d.invite_id === rowSort.inviteId)
      const value = effectiveUnitPrice(row, cell)
      if (comparisonMode === 'competitive') {
        return betterDeltaNumeric(rowVisibleDealerPrices(row), value)
      }
      return deltaNumeric(value, dynamicRowAverage(row))
    }
    if (rowSort.key === 'dealer_next_delta') {
      const cell = (row.dealers || []).find((d) => d.invite_id === rowSort.inviteId)
      const value = numberOrNull(effectiveUnitPrice(row, cell))
      return nextBestDeltaNumeric(rowVisibleDealerPrices(row), value)
    }
    return null
  }

  const sortedRows = useMemo(() => {
    const rows = [...(data.rows || [])]
    rows.sort((a, b) => {
      const av = rowSortValue(a)
      const bv = rowSortValue(b)

      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1

      let cmp = 0
      if (typeof av === 'string' || typeof bv === 'string') {
        cmp = String(av).localeCompare(String(bv))
      } else {
        cmp = av - bv
      }
      return rowSort.direction === 'asc' ? cmp : -cmp
    })
    return rows
  }, [data.rows, rowSort, dealerPriceMode, comparisonMode, visibleDealerIds])

  const dealerQuoteSummary = (summary, totalRequested) => {
    if (!summary || totalRequested <= 0) {
      return {
        line: '0 / 0 quoted (0 BoD)',
        completionPct: 0,
        bodSkippedPct: 0
      }
    }

    const bodOnly = summary.bodOnlyCount || 0
    const mixed = summary.mixedLineCount || 0
    const altOnly = summary.altOnlyCount || 0
    const quoted = bodOnly + mixed + altOnly

    const parts = []
    if (bodOnly > 0) parts.push(`${bodOnly} BoD`)
    if (mixed > 0) parts.push(`${mixed} BoD+Sub`)
    if (altOnly > 0) parts.push(`${altOnly} Sub`)
    if (parts.length === 0) parts.push('0 BoD')
    const completionPct = totalRequested > 0 ? (quoted / totalRequested) * 100 : 0
    const rowsWithBod = bodOnly + mixed
    const bodSkippedCount = Math.max(totalRequested - rowsWithBod, 0)
    const bodSkippedPct = totalRequested > 0 ? (bodSkippedCount / totalRequested) * 100 : 0

    return {
      line: `${quoted} / ${totalRequested} quoted (${parts.join(' · ')})`,
      completionPct,
      bodSkippedPct
    }
  }

  const toggleDealer = (inviteId) => {
    setVisibleDealerIds((prev) => (
      prev.includes(inviteId) ? prev.filter((id) => id !== inviteId) : [...prev, inviteId]
    ))
  }

  useEffect(() => {
    const closePopover = () => setActiveSubPopoverKey(null)
    document.addEventListener('click', closePopover)
    return () => document.removeEventListener('click', closePopover)
  }, [])

  const handleExportChange = (format) => {
    if (!loadedBidPackageId || !format) return
    const url = comparisonExportUrl(loadedBidPackageId, dealerPriceMode, format, excludedRowIds)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const baseColumnsBeforeDealers = comparisonMode === 'competitive' ? 5 : 7

  return (
    <div className="stack">
      <SectionCard title="Comparison Dashboard">
        <div className="form-grid">
          <label>
            Bid Package
            <select
              value={selectedBidPackageId}
              onChange={(event) => setSelectedBidPackageId(event.target.value)}
              disabled={loadingPackages}
            >
              {bidPackages.length === 0 ? <option value="">No bid packages yet</option> : null}
              {bidPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} in {pkg.project_name || 'Unknown Project'} (Bid Package ID: {pkg.id}, Project ID: {pkg.project_id ?? '—'})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="action-row">
          <button className="btn btn-primary" onClick={loadComparison} disabled={!selectedBidPackageId || loading || loadingPackages}>
            Load Bid Package
          </button>
        </div>

        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
      </SectionCard>

      <SectionCard title="Responder Summary">
        <div className="responder-controls">
          <label>
            Sort
            <select value={responderSort} onChange={(event) => setResponderSort(event.target.value)}>
              <option value="lowest_bid">Lowest Bid</option>
              <option value="highest_bid">Highest Bid</option>
              <option value="dealer_name">Dealer Name</option>
            </select>
          </label>
        </div>
        <div className="responder-list">
          {sortedDealers.map((dealer) => {
            const summaryCopy = dealerQuoteSummary(dealerQuoteCountsById[dealer.invite_id], data.rows.length)
            return (
            <label key={dealer.invite_id} className="responder-item">
              <input
                type="checkbox"
                checked={visibleDealerIds.includes(dealer.invite_id)}
                onChange={() => toggleDealer(dealer.invite_id)}
              />
              <span className="responder-name-wrap">
                <span className="responder-name">{companyName(dealer.dealer_name)}</span>
                <span className="responder-meta responder-category">
                  {summaryCopy.line}
                </span>
                <span className="summary-inline-row">
                  <span className={`completion-pill ${summaryCopy.completionPct >= 100 ? 'complete' : 'incomplete'}`}>
                    {summaryCopy.completionPct.toFixed(0)}% complete
                  </span>
                  <span className="completion-pill warning">
                    {summaryCopy.bodSkippedPct.toFixed(0)}% BoD skipped
                  </span>
                  {(dealerQuoteCountsById[dealer.invite_id]?.mixedLineCount || 0) > 0 ? (
                    <span className="summary-toggle-row">
                      <span className="quote-toggle">
                        <button
                          type="button"
                          className={`quote-toggle-btn ${(dealerPriceMode[dealer.invite_id] || 'bod') === 'bod' ? 'active' : ''}`}
                          onClick={(event) => {
                            event.preventDefault()
                            setDealerPriceMode((prev) => ({ ...prev, [dealer.invite_id]: 'bod' }))
                          }}
                        >
                          BoD
                        </button>
                        <button
                          type="button"
                          className={`quote-toggle-btn ${(dealerPriceMode[dealer.invite_id] || 'bod') === 'alt' ? 'active' : ''}`}
                          onClick={(event) => {
                            event.preventDefault()
                            setDealerPriceMode((prev) => ({ ...prev, [dealer.invite_id]: 'alt' }))
                          }}
                        >
                          Sub
                        </button>
                      </span>
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="responder-total">{money(dealerTotalsById[dealer.invite_id]?.total)}</span>
            </label>
            )
          })}
          {(data.dealers || []).length === 0 ? (
            <p className="text-muted">Load comparison to see responders.</p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Line Item Comparison"
        actions={
          loadedBidPackageId ? (
            <div className="action-row">
              <label>
                Comparison
                <select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value)}>
                  <option value="average">Average</option>
                  <option value="competitive">Competitive</option>
                </select>
              </label>
              <label>
                Export
                <select
                  defaultValue=""
                  onChange={(event) => {
                    handleExportChange(event.target.value)
                    event.target.value = ''
                  }}
                >
                  <option value="" disabled>Select format</option>
                  <option value="csv">CSV</option>
                  <option value="xlsx">XLSX</option>
                </select>
              </label>
            </div>
          ) : null
        }
      >
        <table className="table comparison-table">
          <thead>
            <tr>
              <th rowSpan={2}>
                <span className="comparison-use-header">
                  <span>Use</span>
                  <input
                    className="row-toggle-input"
                    type="checkbox"
                    checked={allRowsIncluded}
                    onChange={(event) => {
                      if (event.target.checked) includeAllRows()
                      else excludeAllRows()
                    }}
                    aria-label="Select or unselect all rows"
                    disabled={(data.rows || []).length === 0}
                  />
                </span>
              </th>
              <th rowSpan={2}>
                <button className="th-sort-btn" onClick={() => cycleSort('sku')}>
                  Code/Tag{sortIndicator('sku')}
                </button>
              </th>
              <th rowSpan={2}>
                <button className="th-sort-btn" onClick={() => cycleSort('product_name')}>
                  Product{sortIndicator('product_name')}
                </button>
              </th>
              <th rowSpan={2}>Brand</th>
              <th rowSpan={2}>
                <button className="th-sort-btn" onClick={() => cycleSort('quantity')}>
                  Qty/UOM{sortIndicator('quantity')}
                </button>
              </th>
              {comparisonMode === 'average' ? (
                <th rowSpan={2}>
                  <button className="th-sort-btn" onClick={() => cycleSort('avg_unit_price')}>
                    Avg Unit Price{sortIndicator('avg_unit_price')}
                  </button>
                </th>
              ) : null}
              {comparisonMode === 'average' ? <th rowSpan={2}>Avg Extended</th> : null}
              {visibleDealers.map((dealer) => (
                <th
                  key={`group-${dealer.invite_id}`}
                  colSpan={dealerColumnsPerResponder}
                  className="dealer-group-header dealer-block-start dealer-block-end"
                >
                  {companyName(dealer.dealer_name)}
                </th>
              ))}
            </tr>
            <tr>
              {visibleDealers.map((dealer) => (
                <Fragment key={dealer.invite_id}>
                  <th className="dealer-block-start">
                    <button className="th-sort-btn" onClick={() => cycleSort('dealer_price', dealer.invite_id)}>
                      Unit Price{sortIndicator('dealer_price', dealer.invite_id)}
                    </button>
                  </th>
                  <th>Extended</th>
                  <th className={comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'}>
                    <button className="th-sort-btn" onClick={() => cycleSort('dealer_delta', dealer.invite_id)}>
                      {comparisonMode === 'competitive' ? '% Next Lower' : '% Avg Delta'}{sortIndicator('dealer_delta', dealer.invite_id)}
                    </button>
                  </th>
                  {comparisonMode === 'competitive' && showNextBestDeltaColumn ? (
                    <th className="dealer-block-end">
                      <button className="th-sort-btn" onClick={() => cycleSort('dealer_next_delta', dealer.invite_id)}>
                        % Next Higher{sortIndicator('dealer_next_delta', dealer.invite_id)}
                      </button>
                    </th>
                  ) : null}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.spec_item_id} className={rowIncluded(row) ? '' : 'row-excluded'}>
                <td>
                  <input
                    className="row-toggle-input"
                    type="checkbox"
                    checked={rowIncluded(row)}
                    onChange={() => toggleRowIncluded(row.spec_item_id)}
                    aria-label={`Include ${row.sku || row.product_name || 'line item'}`}
                  />
                </td>
                <td>{row.sku || '—'}</td>
                <td>{row.product_name || '—'}</td>
                <td>{row.manufacturer || '—'}</td>
                <td>{row.quantity || '—'} {row.uom || ''}</td>
                {comparisonMode === 'average' ? <td className="num">{money(dynamicRowAverage(row))}</td> : null}
                {comparisonMode === 'average' ? <td className="num">{money(extendedAmount(dynamicRowAverage(row), row.quantity))}</td> : null}
                {visibleDealers.flatMap((dealer) => {
                  const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
                  const effectivePrice = effectiveUnitPrice(row, cell)
                  const bestUnitPrice = rowBestPrice(row)
                  const isBest = numberOrNull(effectivePrice) != null && numberOrNull(effectivePrice) === numberOrNull(bestUnitPrice)
                  const choice = effectiveChoice(row, cell)
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(rowVisibleDealerPrices(row), effectivePrice)
                    : delta(effectivePrice, dynamicRowAverage(row))
                  const nextBestDelta = nextBestDeltaDisplay(rowVisibleDealerPrices(row), effectivePrice)
                  const subPopoverKey = `${row.spec_item_id}-${dealer.invite_id}`
                  return [
                    <td
                      key={`${row.spec_item_id}-${dealer.invite_id}-price`}
                      className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}
                    >
                      <div className="dealer-price-cell">
                        {choice === 'alt' ? (
                          <span
                            className="sub-popover-wrap"
                            onMouseEnter={() => setActiveSubPopoverKey(subPopoverKey)}
                            onMouseLeave={() => setActiveSubPopoverKey((prev) => (prev === subPopoverKey ? null : prev))}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="quote-chip alt"
                              onClick={() => setActiveSubPopoverKey((prev) => (prev === subPopoverKey ? null : subPopoverKey))}
                            >
                              Sub
                            </button>
                            {activeSubPopoverKey === subPopoverKey ? (
                              <div className="sub-popover">
                                <div><strong>Sub Product:</strong> {cell?.alt_product_name || '—'}</div>
                                <div><strong>Sub Brand:</strong> {cell?.alt_brand_name || '—'}</div>
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                        <span>{money(effectivePrice)}</span>
                      </div>
                    </td>,
                    <td key={`${row.spec_item_id}-${dealer.invite_id}-extended`} className="num">
                      {money(extendedAmount(effectivePrice, row.quantity))}
                    </td>,
                    <td key={`${row.spec_item_id}-${dealer.invite_id}-delta`} className={`${comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}>
                      {betterDelta}
                    </td>,
                    ...(comparisonMode === 'competitive' && showNextBestDeltaColumn
                      ? [<td key={`${row.spec_item_id}-${dealer.invite_id}-next-delta`} className="dealer-block-end num">{nextBestDelta}</td>]
                      : [])
                  ]
                })}
              </tr>
            ))}
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={baseColumnsBeforeDealers + (visibleDealers.length * dealerColumnsPerResponder)} className="text-muted">No comparison rows loaded yet.</td>
              </tr>
            ) : null}
          </tbody>
          {sortedRows.length > 0 ? (
            <tfoot>
              <tr className="total-row">
                <td colSpan={5}><strong>Sub-total</strong></td>
                {comparisonMode === 'average' ? <td className="num"><strong>—</strong></td> : null}
                {comparisonMode === 'average' ? <td className="num"><strong>{money(avgSubtotal)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const summary = dealerTotalsById[dealer.invite_id]
                  const subtotal = summary?.subtotal || 0
                  const isBest = subtotal === bestDealerSubtotal
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleSubtotals, subtotal)
                    : delta(subtotal, avgSubtotal)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleSubtotals, subtotal)
                    : null
                  return (
                    <Fragment key={`subtotal-${dealer.invite_id}`}>
                      <td className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}><strong>—</strong></td>
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(subtotal)}</strong></td>
                      <td className={`${comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td>
                      {comparisonMode === 'competitive' && showNextBestDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              {activeGeneralFields.includes('delivery_amount') ? (
              <tr>
                <td colSpan={5}><strong>Delivery</strong></td>
                {comparisonMode === 'average' ? <td className="num"><strong>—</strong></td> : null}
                {comparisonMode === 'average' ? <td className="num"><strong>{money(avgDelivery)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.delivery || 0
                  const isBest = value === bestDealerDelivery
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleDeliveries, value)
                    : delta(value, avgDelivery)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleDeliveries, value)
                    : null
                  return (
                    <Fragment key={`delivery-${dealer.invite_id}`}>
                      <td className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}><strong>—</strong></td>
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      <td className={`${comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td>
                      {comparisonMode === 'competitive' && showNextBestDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              {activeGeneralFields.includes('install_amount') ? (
              <tr>
                <td colSpan={5}><strong>Install</strong></td>
                {comparisonMode === 'average' ? <td className="num"><strong>—</strong></td> : null}
                {comparisonMode === 'average' ? <td className="num"><strong>{money(avgInstall)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.install || 0
                  const isBest = value === bestDealerInstall
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleInstalls, value)
                    : delta(value, avgInstall)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleInstalls, value)
                    : null
                  return (
                    <Fragment key={`install-${dealer.invite_id}`}>
                      <td className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}><strong>—</strong></td>
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      <td className={`${comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td>
                      {comparisonMode === 'competitive' && showNextBestDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              {activeGeneralFields.includes('escalation_amount') ? (
              <tr>
                <td colSpan={5}><strong>Escalation</strong></td>
                {comparisonMode === 'average' ? <td className="num"><strong>—</strong></td> : null}
                {comparisonMode === 'average' ? <td className="num"><strong>{money(avgEscalation)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.escalation || 0
                  const isBest = value === bestDealerEscalation
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleEscalations, value)
                    : delta(value, avgEscalation)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleEscalations, value)
                    : null
                  return (
                    <Fragment key={`escalation-${dealer.invite_id}`}>
                      <td className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}><strong>—</strong></td>
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      <td className={`${comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td>
                      {comparisonMode === 'competitive' && showNextBestDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              {activeGeneralFields.includes('contingency_amount') ? (
              <tr>
                <td colSpan={5}><strong>Contingency</strong></td>
                {comparisonMode === 'average' ? <td className="num"><strong>—</strong></td> : null}
                {comparisonMode === 'average' ? <td className="num"><strong>{money(avgContingency)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.contingency || 0
                  const isBest = value === bestDealerContingency
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleContingencies, value)
                    : delta(value, avgContingency)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleContingencies, value)
                    : null
                  return (
                    <Fragment key={`contingency-${dealer.invite_id}`}>
                      <td className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}><strong>—</strong></td>
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      <td className={`${comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td>
                      {comparisonMode === 'competitive' && showNextBestDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              {activeGeneralFields.includes('sales_tax_amount') ? (
              <tr>
                <td colSpan={5}><strong>Sales Tax</strong></td>
                {comparisonMode === 'average' ? <td className="num"><strong>—</strong></td> : null}
                {comparisonMode === 'average' ? <td className="num"><strong>{money(avgSalesTax)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.salesTax || 0
                  const isBest = value === bestDealerSalesTax
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleSalesTaxes, value)
                    : delta(value, avgSalesTax)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleSalesTaxes, value)
                    : null
                  return (
                    <Fragment key={`sales-tax-${dealer.invite_id}`}>
                      <td className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}><strong>—</strong></td>
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      <td className={`${comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td>
                      {comparisonMode === 'competitive' && showNextBestDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              <tr className="total-row">
                <td colSpan={5}><strong>Total Bid Amount</strong></td>
                {comparisonMode === 'average' ? <td className="num"><strong>—</strong></td> : null}
                {comparisonMode === 'average' ? <td className="num"><strong>{money(avgTotal)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const total = dealerTotalsById[dealer.invite_id]?.total || 0
                  const isBest = total === bestDealerTotal
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleTotals, total)
                    : delta(total, avgTotal)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleTotals, total)
                    : null
                  return (
                    <Fragment key={`total-${dealer.invite_id}`}>
                      <td className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}><strong>—</strong></td>
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(total)}</strong></td>
                      <td className={`${comparisonMode === 'competitive' && showNextBestDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td>
                      {comparisonMode === 'competitive' && showNextBestDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>

        {(visibleDealers || []).length > 0 ? (
          <p className="text-muted">
            Only Sub-priced selections are marked in-row; BoD is the default unless Sub is selected.
          </p>
        ) : null}
        {(visibleDealers || []).length > 0 ? (
          <p className="text-muted">
            Dealers in view: {(visibleDealers || []).map((dealer) => companyName(dealer.dealer_name)).join(', ')}
          </p>
        ) : null}
      </SectionCard>
    </div>
  )
}
