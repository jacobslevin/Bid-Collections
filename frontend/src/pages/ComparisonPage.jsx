import { Fragment, useEffect, useMemo, useState } from 'react'
import SectionCard from '../components/SectionCard'
import { comparisonExportUrl, fetchBidPackages, fetchComparison } from '../lib/api'

function numberOrNull(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function money(value) {
  const n = numberOrNull(value)
  return n == null ? '—' : `$${n.toFixed(2)}`
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

export default function ComparisonPage() {
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState('')
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [data, setData] = useState({ dealers: [], rows: [] })
  const [visibleDealerIds, setVisibleDealerIds] = useState([])
  const [responderSort, setResponderSort] = useState('lowest_bid')
  const [rowSort, setRowSort] = useState({ key: 'sku', direction: 'asc', inviteId: null })
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
      setVisibleDealerIds((payload.dealers || []).map((dealer) => dealer.invite_id))
      setLoadedBidPackageId(String(selectedBidPackageId))
      setStatusMessage('')
    } catch (error) {
      setData({ dealers: [], rows: [] })
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const avgTotal = (data.rows || []).reduce((sum, row) => {
    const value = extendedAmount(row.avg_unit_price, row.quantity)
    return value == null ? sum : sum + value
  }, 0)

  const dealerTotalsById = (data.dealers || []).reduce((acc, dealer) => {
    const total = (data.rows || []).reduce((sum, row) => {
      const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
      const value = extendedAmount(cell?.unit_price, row.quantity)
      return value == null ? sum : sum + value
    }, 0)
    acc[dealer.invite_id] = total
    return acc
  }, {})

  const toggleDealer = (inviteId) => {
    setVisibleDealerIds((prev) => (
      prev.includes(inviteId) ? prev.filter((id) => id !== inviteId) : [...prev, inviteId]
    ))
  }

  const sortedDealers = [...(data.dealers || [])].sort((a, b) => {
    const totalA = dealerTotalsById[a.invite_id] || 0
    const totalB = dealerTotalsById[b.invite_id] || 0

    if (responderSort === 'highest_bid') return totalB - totalA
    if (responderSort === 'dealer_name') return (a.dealer_name || '').localeCompare(b.dealer_name || '')
    return totalA - totalB
  })

  const visibleDealers = sortedDealers.filter((dealer) => visibleDealerIds.includes(dealer.invite_id))
  const visibleTotals = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]).filter((v) => Number.isFinite(v))
  const bestDealerTotal = visibleTotals.length > 0 ? Math.min(...visibleTotals) : null

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
    if (rowSort.key === 'avg_unit_price') return numberOrNull(row.avg_unit_price)
    if (rowSort.key === 'dealer_price') {
      const cell = (row.dealers || []).find((d) => d.invite_id === rowSort.inviteId)
      return numberOrNull(cell?.unit_price)
    }
    if (rowSort.key === 'dealer_delta') {
      const cell = (row.dealers || []).find((d) => d.invite_id === rowSort.inviteId)
      return deltaNumeric(cell?.unit_price, row.avg_unit_price)
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
  }, [data.rows, rowSort])

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
                <option key={pkg.id} value={pkg.id}>{pkg.name} (#{pkg.id})</option>
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
          {sortedDealers.map((dealer) => (
            <label key={dealer.invite_id} className="responder-item">
              <input
                type="checkbox"
                checked={visibleDealerIds.includes(dealer.invite_id)}
                onChange={() => toggleDealer(dealer.invite_id)}
              />
              <span className="responder-name">{dealer.dealer_name || 'Dealer'}</span>
              <span className="responder-total">{money(dealerTotalsById[dealer.invite_id])}</span>
            </label>
          ))}
          {(data.dealers || []).length === 0 ? (
            <p className="text-muted">Load comparison to see responders.</p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Line Item Comparison"
        actions={
          loadedBidPackageId ? (
            <a className="btn" href={comparisonExportUrl(loadedBidPackageId)} target="_blank" rel="noreferrer">Export CSV</a>
          ) : null
        }
      >
        <table className="table comparison-table">
          <thead>
            <tr>
              <th>
                <button className="th-sort-btn" onClick={() => cycleSort('sku')}>
                  Code/Tag{sortIndicator('sku')}
                </button>
              </th>
              <th>
                <button className="th-sort-btn" onClick={() => cycleSort('product_name')}>
                  Product{sortIndicator('product_name')}
                </button>
              </th>
              <th>
                <button className="th-sort-btn" onClick={() => cycleSort('quantity')}>
                  Qty/UOM{sortIndicator('quantity')}
                </button>
              </th>
              <th>
                <button className="th-sort-btn" onClick={() => cycleSort('avg_unit_price')}>
                  Avg Unit Price{sortIndicator('avg_unit_price')}
                </button>
              </th>
              {visibleDealers.map((dealer) => (
                <Fragment key={dealer.invite_id}>
                  <th className="dealer-block-start">
                    <button className="th-sort-btn" onClick={() => cycleSort('dealer_price', dealer.invite_id)}>
                      {dealer.dealer_name || 'Dealer'}{sortIndicator('dealer_price', dealer.invite_id)}
                    </button>
                  </th>
                  <th className="dealer-block-end">
                    <button className="th-sort-btn" onClick={() => cycleSort('dealer_delta', dealer.invite_id)}>
                      % Avg Delta{sortIndicator('dealer_delta', dealer.invite_id)}
                    </button>
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.spec_item_id}>
                <td>{row.sku || '—'}</td>
                <td>{row.product_name || '—'}</td>
                <td>{row.quantity || '—'} {row.uom || ''}</td>
                <td>{money(row.avg_unit_price)}</td>
                {(row.dealers || [])
                  .filter((cell) => visibleDealerIds.includes(cell.invite_id))
                  .flatMap((cell) => {
                  const isBest = numberOrNull(cell.unit_price) != null && numberOrNull(cell.unit_price) === numberOrNull(row.best_unit_price)
                  return [
                    <td
                      key={`${row.spec_item_id}-${cell.invite_id}-price`}
                      className={`dealer-block-start ${isBest ? 'best' : ''}`.trim()}
                    >
                      {money(cell.unit_price)}
                    </td>,
                    <td key={`${row.spec_item_id}-${cell.invite_id}-delta`} className="dealer-block-end">
                      {delta(cell.unit_price, row.avg_unit_price)}
                    </td>
                  ]
                })}
              </tr>
            ))}
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={4 + (visibleDealers.length * 2)} className="text-muted">No comparison rows loaded yet.</td>
              </tr>
            ) : null}
          </tbody>
          {sortedRows.length > 0 ? (
            <tfoot>
              <tr className="total-row">
                <td colSpan={3}><strong>Total Bid Amount</strong></td>
                <td><strong>{money(avgTotal)}</strong></td>
                {visibleDealers.map((dealer) => {
                  const total = dealerTotalsById[dealer.invite_id]
                  const isBest = total === bestDealerTotal
                  return (
                    <Fragment key={`total-${dealer.invite_id}`}>
                      <td className={`dealer-block-start ${isBest ? 'best' : ''}`.trim()}><strong>{money(total)}</strong></td>
                      <td className="dealer-block-end"><strong>{delta(total, avgTotal)}</strong></td>
                    </Fragment>
                  )
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>

        {(visibleDealers || []).length > 0 ? (
          <p className="text-muted">
            Dealers in view: {(visibleDealers || []).map((dealer) => dealer.dealer_name || 'Dealer').join(', ')}
          </p>
        ) : null}
      </SectionCard>
    </div>
  )
}
