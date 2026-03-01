import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import {
  awardBidPackage,
  clearBidPackageAward,
  changeBidPackageAward,
  comparisonExportUrl,
  fetchBidPackages,
  fetchComparison
} from '../lib/api'

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

function cellModeKey(specItemId, inviteId) {
  return `${specItemId}:${inviteId}`
}

const DEFAULT_COMPARISON_VIEW_STATE = {
  responderSort: 'lowest_bid',
  comparisonMode: 'none',
  showProductColumn: true,
  showBrandColumn: true,
  showLeadTimeColumn: false,
  showDealerNotesColumn: false
}

function comparisonStateStorageKey(bidPackageId) {
  return `bid_collections.comparison.state.${bidPackageId}`
}

function loadStoredComparisonState(bidPackageId) {
  if (!bidPackageId) {
    return {
      dealerPriceMode: {},
      cellPriceMode: {},
      excludedSpecItemIds: [],
      ...DEFAULT_COMPARISON_VIEW_STATE
    }
  }
  try {
    const raw = window.localStorage.getItem(comparisonStateStorageKey(bidPackageId))
    if (!raw) {
      return {
        dealerPriceMode: {},
        cellPriceMode: {},
        excludedSpecItemIds: [],
        ...DEFAULT_COMPARISON_VIEW_STATE
      }
    }
    const parsed = JSON.parse(raw)
    return {
      dealerPriceMode: parsed?.dealerPriceMode && typeof parsed.dealerPriceMode === 'object' ? parsed.dealerPriceMode : {},
      cellPriceMode: parsed?.cellPriceMode && typeof parsed.cellPriceMode === 'object' ? parsed.cellPriceMode : {},
      excludedSpecItemIds: Array.isArray(parsed?.excludedSpecItemIds) ? parsed.excludedSpecItemIds.map((id) => String(id)) : [],
      responderSort: parsed?.responderSort || DEFAULT_COMPARISON_VIEW_STATE.responderSort,
      comparisonMode: parsed?.comparisonMode || DEFAULT_COMPARISON_VIEW_STATE.comparisonMode,
      showProductColumn: typeof parsed?.showProductColumn === 'boolean' ? parsed.showProductColumn : DEFAULT_COMPARISON_VIEW_STATE.showProductColumn,
      showBrandColumn: typeof parsed?.showBrandColumn === 'boolean' ? parsed.showBrandColumn : DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn,
      showLeadTimeColumn: typeof parsed?.showLeadTimeColumn === 'boolean' ? parsed.showLeadTimeColumn : DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn,
      showDealerNotesColumn: typeof parsed?.showDealerNotesColumn === 'boolean' ? parsed.showDealerNotesColumn : DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn
    }
  } catch (_error) {
    return {
      dealerPriceMode: {},
      cellPriceMode: {},
      excludedSpecItemIds: [],
      ...DEFAULT_COMPARISON_VIEW_STATE
    }
  }
}

function storeComparisonState(bidPackageId, state) {
  if (!bidPackageId) return
  try {
    window.localStorage.setItem(comparisonStateStorageKey(bidPackageId), JSON.stringify({
      dealerPriceMode: state?.dealerPriceMode || {},
      cellPriceMode: state?.cellPriceMode || {},
      excludedSpecItemIds: Array.isArray(state?.excludedSpecItemIds) ? state.excludedSpecItemIds : [],
      responderSort: state?.responderSort || DEFAULT_COMPARISON_VIEW_STATE.responderSort,
      comparisonMode: state?.comparisonMode || DEFAULT_COMPARISON_VIEW_STATE.comparisonMode,
      showProductColumn: typeof state?.showProductColumn === 'boolean' ? state.showProductColumn : DEFAULT_COMPARISON_VIEW_STATE.showProductColumn,
      showBrandColumn: typeof state?.showBrandColumn === 'boolean' ? state.showBrandColumn : DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn,
      showLeadTimeColumn: typeof state?.showLeadTimeColumn === 'boolean' ? state.showLeadTimeColumn : DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn,
      showDealerNotesColumn: typeof state?.showDealerNotesColumn === 'boolean' ? state.showDealerNotesColumn : DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn
    }))
  } catch (_error) {
    // ignore storage failures
  }
}

function clearStoredComparisonState(bidPackageId) {
  if (!bidPackageId) return
  try {
    window.localStorage.removeItem(comparisonStateStorageKey(bidPackageId))
  } catch (_error) {
    // ignore storage failures
  }
}

function selectionStatusForDealer(dealer, awardedBidId) {
  if (dealer?.selection_status) return dealer.selection_status
  if (awardedBidId && dealer?.bid_id === awardedBidId) return 'awarded'
  if (awardedBidId) return 'not_selected'
  return 'pending'
}

export default function ComparisonPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const forcedBidPackageId = searchParams.get('bid_package_id') || ''
  const launchedFromDashboard = Boolean(forcedBidPackageId)
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState(forcedBidPackageId)
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [data, setData] = useState({ dealers: [], rows: [] })
  const [visibleDealerIds, setVisibleDealerIds] = useState([])
  const [responderSort, setResponderSort] = useState('lowest_bid')
  const [comparisonMode, setComparisonMode] = useState('none')
  const [showProductColumn, setShowProductColumn] = useState(true)
  const [showBrandColumn, setShowBrandColumn] = useState(true)
  const [showLeadTimeColumn, setShowLeadTimeColumn] = useState(false)
  const [showDealerNotesColumn, setShowDealerNotesColumn] = useState(false)
  const [activeSubPopoverKey, setActiveSubPopoverKey] = useState(null)
  const [activeNotePopoverKey, setActiveNotePopoverKey] = useState(null)
  const [rowSort, setRowSort] = useState({ key: 'sku', direction: 'asc', inviteId: null })
  const [dealerPriceMode, setDealerPriceMode] = useState({})
  const [cellPriceMode, setCellPriceMode] = useState({})
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
  const [awardedBidId, setAwardedBidId] = useState(null)
  const [awardedAt, setAwardedAt] = useState(null)
  const [awardModal, setAwardModal] = useState(null)
  const [awardSaving, setAwardSaving] = useState(false)
  const tableScrollRef = useRef(null)
  const tableInnerRef = useRef(null)
  const [scrollMax, setScrollMax] = useState(0)
  const [isDraggingTable, setIsDraggingTable] = useState(false)
  const dragStateRef = useRef({ active: false, startX: 0, startLeft: 0 })
  const dealerPriceModeRef = useRef(dealerPriceMode)
  const cellPriceModeRef = useRef(cellPriceMode)
  const excludedRowIdsRef = useRef(excludedRowIds)
  const responderSortRef = useRef(responderSort)
  const comparisonModeRef = useRef(comparisonMode)
  const showProductColumnRef = useRef(showProductColumn)
  const showBrandColumnRef = useRef(showBrandColumn)
  const showLeadTimeColumnRef = useRef(showLeadTimeColumn)
  const showDealerNotesColumnRef = useRef(showDealerNotesColumn)

  useEffect(() => {
    dealerPriceModeRef.current = dealerPriceMode
  }, [dealerPriceMode])

  useEffect(() => {
    cellPriceModeRef.current = cellPriceMode
  }, [cellPriceMode])

  useEffect(() => {
    excludedRowIdsRef.current = excludedRowIds
  }, [excludedRowIds])

  useEffect(() => {
    responderSortRef.current = responderSort
  }, [responderSort])

  useEffect(() => {
    comparisonModeRef.current = comparisonMode
  }, [comparisonMode])

  useEffect(() => {
    showProductColumnRef.current = showProductColumn
  }, [showProductColumn])

  useEffect(() => {
    showBrandColumnRef.current = showBrandColumn
  }, [showBrandColumn])

  useEffect(() => {
    showLeadTimeColumnRef.current = showLeadTimeColumn
  }, [showLeadTimeColumn])

  useEffect(() => {
    showDealerNotesColumnRef.current = showDealerNotesColumn
  }, [showDealerNotesColumn])

  const normalizeExcludedIds = (ids) => {
    const raw = Array.isArray(ids) ? ids : (ids == null ? [] : [ids])
    const normalized = raw
      .flatMap((id) => String(id).split(','))
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
    return Array.from(new Set(normalized))
  }

  const applyExcludedRowIds = (nextIds) => {
    setExcludedRowIds((prev) => {
      const resolved = typeof nextIds === 'function' ? nextIds(prev) : nextIds
      const normalized = normalizeExcludedIds(resolved)
      excludedRowIdsRef.current = normalized
      return normalized
    })
  }

  const addExcludedRowId = (id) => {
    const key = String(id)
    applyExcludedRowIds((prev) => [...prev, key])
  }

  const removeExcludedRowId = (id) => {
    const key = String(id)
    applyExcludedRowIds((prev) => prev.filter((existing) => String(existing) !== key))
  }

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

  const loadComparisonForBidPackage = async (
    bidPackageId,
    {
      dealerPriceMode: requestedDealerPriceMode = {},
      cellPriceMode: requestedCellPriceMode = {},
      excludedSpecItemIds: requestedExcludedSpecItemIds = [],
      responderSort: requestedResponderSort = DEFAULT_COMPARISON_VIEW_STATE.responderSort,
      comparisonMode: requestedComparisonMode = DEFAULT_COMPARISON_VIEW_STATE.comparisonMode,
      showProductColumn: requestedShowProductColumn = DEFAULT_COMPARISON_VIEW_STATE.showProductColumn,
      showBrandColumn: requestedShowBrandColumn = DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn,
      showLeadTimeColumn: requestedShowLeadTimeColumn = DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn,
      showDealerNotesColumn: requestedShowDealerNotesColumn = DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn
    } = {}
  ) => {
    if (!bidPackageId) return

    setLoading(true)
    setStatusMessage('Loading comparison...')

    try {
      const payload = await fetchComparison(bidPackageId, {
        dealerPriceMode: requestedDealerPriceMode,
        cellPriceMode: requestedCellPriceMode
      })
      setData({ dealers: payload.dealers || [], rows: payload.rows || [] })
      setAwardedBidId(payload.awarded_bid_id ?? null)
      setAwardedAt(payload.awarded_at || null)
      setAwardModal(null)
      setActiveGeneralFields(payload.active_general_fields || [
        'delivery_amount',
        'install_amount',
        'escalation_amount',
        'contingency_amount',
        'sales_tax_amount'
      ])
      setVisibleDealerIds((payload.dealers || []).map((dealer) => dealer.invite_id))
      const nextExcluded = Array(requestedExcludedSpecItemIds || []).map((id) => String(id))
      setExcludedRowIds(nextExcluded)
      setDealerPriceMode((payload.dealers || []).reduce((acc, dealer) => {
        const requestedMode = requestedDealerPriceMode?.[dealer.invite_id] || requestedDealerPriceMode?.[String(dealer.invite_id)]
        acc[dealer.invite_id] = requestedMode === 'alt' ? 'alt' : 'bod'
        return acc
      }, {}))
      setCellPriceMode(Object.fromEntries(
        Object.entries(requestedCellPriceMode || {}).filter(([, mode]) => mode === 'alt' || mode === 'bod')
      ))
      setResponderSort(requestedResponderSort || DEFAULT_COMPARISON_VIEW_STATE.responderSort)
      setComparisonMode(requestedComparisonMode || DEFAULT_COMPARISON_VIEW_STATE.comparisonMode)
      setShowProductColumn(typeof requestedShowProductColumn === 'boolean' ? requestedShowProductColumn : DEFAULT_COMPARISON_VIEW_STATE.showProductColumn)
      setShowBrandColumn(typeof requestedShowBrandColumn === 'boolean' ? requestedShowBrandColumn : DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn)
      setShowLeadTimeColumn(typeof requestedShowLeadTimeColumn === 'boolean' ? requestedShowLeadTimeColumn : DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn)
      setShowDealerNotesColumn(typeof requestedShowDealerNotesColumn === 'boolean' ? requestedShowDealerNotesColumn : DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn)
      setLoadedBidPackageId(String(bidPackageId))
      setStatusMessage('')
    } catch (error) {
      setData({ dealers: [], rows: [] })
      setAwardedBidId(null)
      setAwardedAt(null)
      setAwardModal(null)
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!forcedBidPackageId) return
    setSelectedBidPackageId(String(forcedBidPackageId))
    const storedState = loadStoredComparisonState(String(forcedBidPackageId))
    loadComparisonForBidPackage(String(forcedBidPackageId), storedState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedBidPackageId])

  const loadComparison = async () => {
    if (!selectedBidPackageId) return
    const hasInMemoryState = (
      Object.keys(dealerPriceMode).length > 0 ||
      Object.keys(cellPriceMode).length > 0 ||
      excludedRowIds.length > 0 ||
      responderSort !== DEFAULT_COMPARISON_VIEW_STATE.responderSort ||
      comparisonMode !== DEFAULT_COMPARISON_VIEW_STATE.comparisonMode ||
      showProductColumn !== DEFAULT_COMPARISON_VIEW_STATE.showProductColumn ||
      showBrandColumn !== DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn ||
      showLeadTimeColumn !== DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn ||
      showDealerNotesColumn !== DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn
    )
    const state = hasInMemoryState
      ? {
          dealerPriceMode,
          cellPriceMode,
          excludedSpecItemIds: excludedRowIds,
          responderSort,
          comparisonMode,
          showProductColumn,
          showBrandColumn,
          showLeadTimeColumn,
          showDealerNotesColumn
        }
      : loadStoredComparisonState(String(selectedBidPackageId))
    await loadComparisonForBidPackage(selectedBidPackageId, state)
  }

  const resetComparisonView = async () => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId
    if (!bidPackageId) return
    clearStoredComparisonState(String(bidPackageId))
    await loadComparisonForBidPackage(String(bidPackageId), {
      dealerPriceMode: {},
      cellPriceMode: {},
      excludedSpecItemIds: [],
      ...DEFAULT_COMPARISON_VIEW_STATE
    })
  }

  const effectiveChoice = (row, cell) => {
    if (!cell) return null
    if (cell.has_bod_price && cell.has_alt_price) {
      const modeKey = cellModeKey(row.spec_item_id, cell.invite_id)
      const cellMode = cellPriceMode[modeKey]
      if (cellMode === 'alt' || cellMode === 'bod') return cellMode
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

  const excludedRowIdSet = useMemo(
    () => new Set(normalizeExcludedIds(excludedRowIds)),
    [excludedRowIds]
  )
  const rowIncluded = (row) => !excludedRowIdSet.has(String(row.spec_item_id))
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

  useEffect(() => {
    const validKeys = new Set(
      (data.rows || []).flatMap((row) =>
        (row.dealers || [])
          .filter((cell) => cell?.has_bod_price && cell?.has_alt_price)
          .map((cell) => cellModeKey(row.spec_item_id, cell.invite_id))
      )
    )
    setCellPriceMode((prev) => Object.fromEntries(
      Object.entries(prev).filter(([key]) => validKeys.has(key))
    ))
  }, [data.rows])

  useEffect(() => {
    const knownIds = new Set((data.rows || []).map((row) => String(row.spec_item_id)))
    if (knownIds.size === 0) return
    applyExcludedRowIds((current) => current.filter((id) => knownIds.has(String(id))))
  }, [data.rows])

  useEffect(() => {
    if (!loadedBidPackageId) return
    storeComparisonState(String(loadedBidPackageId), {
      dealerPriceMode,
      cellPriceMode,
      excludedSpecItemIds: excludedRowIds,
      responderSort,
      comparisonMode,
      showProductColumn,
      showBrandColumn,
      showLeadTimeColumn,
      showDealerNotesColumn
    })
  }, [
    loadedBidPackageId,
    dealerPriceMode,
    cellPriceMode,
    excludedRowIds,
    responderSort,
    comparisonMode,
    showProductColumn,
    showBrandColumn,
    showLeadTimeColumn,
    showDealerNotesColumn
  ])

  const includeAllRows = () => {
    applyExcludedRowIds([])
  }

  const excludeAllRows = () => {
    const next = (data.rows || []).map((row) => String(row.spec_item_id))
    applyExcludedRowIds(next)
  }

  const toggleRowIncluded = (specItemId) => {
    const key = String(specItemId)
    if (excludedRowIds.some((id) => String(id) === key)) {
      removeExcludedRowId(key)
    } else {
      addExcludedRowId(key)
    }
  }

  const allRowsIncluded = (data.rows || []).length > 0 && excludedRowIdSet.size === 0

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
  const showAverageColumns = comparisonMode === 'average'
  const showDealerDeltaColumn = comparisonMode === 'average' || comparisonMode === 'competitive'
  const showDealerNextDeltaColumn = comparisonMode === 'competitive' && showNextBestDeltaColumn
  const comparisonLocked = Boolean(awardedBidId)
  const metricColumnsPerResponder = 2 + (showDealerDeltaColumn ? 1 : 0) + (showDealerNextDeltaColumn ? 1 : 0)
  const optionalColumnsPerResponder = (showLeadTimeColumn ? 1 : 0) + (showDealerNotesColumn ? 1 : 0)
  const dealerColumnsPerResponder = metricColumnsPerResponder + optionalColumnsPerResponder

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
  }, [data.rows, rowSort, dealerPriceMode, cellPriceMode, comparisonMode, visibleDealerIds])

  const openAwardModal = (mode, dealer) => {
    setAwardModal({
      mode,
      dealer,
      comparisonSnapshot: {
        dealerPriceMode: { ...dealerPriceMode },
        cellPriceMode: { ...cellPriceMode },
        excludedSpecItemIds: [...excludedRowIds]
      }
    })
  }

  const closeAwardModal = () => {
    if (awardSaving) return
    setAwardModal(null)
  }

  const submitAward = async () => {
    if (!awardModal || !loadedBidPackageId) return

    setAwardSaving(true)
    setStatusMessage(
      awardModal.mode === 'change'
        ? 'Changing award...'
        : awardModal.mode === 'clear'
          ? 'Removing award...'
          : 'Awarding vendor...'
    )
    try {
      const awardTotalSnapshot = numberOrNull(
        awardModal.dealer?.invite_id != null
          ? dealerTotalsById[awardModal.dealer.invite_id]?.total
          : null
      )
      const payload = {
        bidPackageId: loadedBidPackageId,
        bidId: awardModal.dealer?.bid_id,
        awardedAmountSnapshot: awardModal.mode === 'clear' ? undefined : awardTotalSnapshot,
        cellPriceMode: awardModal.comparisonSnapshot?.cellPriceMode || cellPriceMode,
        excludedSpecItemIds: awardModal.comparisonSnapshot?.excludedSpecItemIds || excludedRowIds
      }

      if (awardModal.mode === 'change') {
        await changeBidPackageAward(payload)
      } else if (awardModal.mode === 'clear') {
        await clearBidPackageAward(payload)
      } else {
        await awardBidPackage(payload)
      }

      setStatusMessage(
        awardModal.mode === 'change'
          ? 'Award reassigned.'
          : awardModal.mode === 'clear'
            ? 'Award removed.'
            : 'Vendor awarded.'
      )
      const snapshot = awardModal.comparisonSnapshot || {
        dealerPriceMode,
        cellPriceMode,
        excludedSpecItemIds: excludedRowIds
      }
      await loadComparisonForBidPackage(loadedBidPackageId, {
        dealerPriceMode: snapshot.dealerPriceMode,
        cellPriceMode: snapshot.cellPriceMode,
        excludedSpecItemIds: snapshot.excludedSpecItemIds
      })
      setAwardModal(null)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setAwardSaving(false)
    }
  }

  useEffect(() => {
    const closePopover = () => {
      setActiveSubPopoverKey(null)
      setActiveNotePopoverKey(null)
    }
    document.addEventListener('click', closePopover)
    return () => document.removeEventListener('click', closePopover)
  }, [])

  useEffect(() => {
    const updateScrollMetrics = () => {
      const tableWrap = tableScrollRef.current
      const tableInner = tableInnerRef.current
      const tableEl = tableInner?.querySelector('table')
      if (!tableWrap) return
      const contentWidth = Math.max(
        tableInner ? tableInner.scrollWidth : 0,
        tableEl ? Math.ceil(tableEl.getBoundingClientRect().width) : 0,
        tableWrap.scrollWidth
      )
      const max = Math.max(contentWidth - tableWrap.clientWidth, 0)
      setScrollMax(max)
    }

    updateScrollMetrics()
    window.addEventListener('resize', updateScrollMetrics)

    let observer = null
    if (window.ResizeObserver && tableScrollRef.current) {
      observer = new ResizeObserver(updateScrollMetrics)
      observer.observe(tableScrollRef.current)
      if (tableInnerRef.current) observer.observe(tableInnerRef.current)
    }

    return () => {
      window.removeEventListener('resize', updateScrollMetrics)
      if (observer) observer.disconnect()
    }
  }, [sortedRows.length, visibleDealers.length, comparisonMode, showProductColumn, showBrandColumn, showLeadTimeColumn, showDealerNotesColumn])

  const syncFromTable = () => {
    return
  }

  const nudgeHorizontalScroll = (distance) => {
    const table = tableScrollRef.current
    if (!table) return
    table.scrollBy({ left: distance, behavior: 'smooth' })
  }

  const handleTableMouseDown = () => {}
  const handleTableMouseMove = () => {}
  const stopTableDragging = () => {}

  const handleExportChange = (format) => {
    if (!loadedBidPackageId || !format) return
    const url = comparisonExportUrl(
      loadedBidPackageId,
      dealerPriceMode,
      cellPriceMode,
      format,
      excludedRowIds,
      comparisonMode,
      {
        showProduct: showProductColumn,
        showBrand: showBrandColumn,
        showLeadTime: showLeadTimeColumn,
        showNotes: showDealerNotesColumn
      }
    )
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const labelColumnsBeforeAverages = 3 + (showProductColumn ? 1 : 0) + (showBrandColumn ? 1 : 0)
  const baseColumnsBeforeDealers = labelColumnsBeforeAverages + (showAverageColumns ? 2 : 0)
  const baseTableMinWidth =
    70 + // Use
    130 + // Code/Tag
    (showProductColumn ? 220 : 0) +
    (showBrandColumn ? 180 : 0) +
    120 + // Qty/UOM
    (showAverageColumns ? (130 + 160) : 0) // Avg Unit + Avg Extended
  const perDealerMinWidth =
    130 + // Unit
    (showLeadTimeColumn ? 110 : 0) +
    (showDealerNotesColumn ? 110 : 0) +
    150 + // Extended
    (showDealerDeltaColumn ? 120 : 0) + // Delta
    (showDealerNextDeltaColumn ? 120 : 0)
  const tableMinWidth = baseTableMinWidth + (visibleDealers.length * perDealerMinWidth) + 40

  return (
    <div className="stack">
      {!launchedFromDashboard ? (
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

          {awardedBidId ? (
            <p className="text-muted">
              Awarded mode is active. Use and BoD/Sub selection are read-only.
              {awardedAt ? ` Awarded at ${new Date(awardedAt).toLocaleString()}.` : ''}
            </p>
          ) : null}
          {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Line Item Comparison"
        actions={
          loadedBidPackageId ? (
            <div className="action-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showProductColumn}
                  onChange={(event) => setShowProductColumn(event.target.checked)}
                />
                Product
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showBrandColumn}
                  onChange={(event) => setShowBrandColumn(event.target.checked)}
                />
                Brand
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showLeadTimeColumn}
                  onChange={(event) => setShowLeadTimeColumn(event.target.checked)}
                />
                Lead Time
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showDealerNotesColumn}
                  onChange={(event) => setShowDealerNotesColumn(event.target.checked)}
                />
                Notes
              </label>
              <span className="action-separator" aria-hidden="true">|</span>
              <label>
                Comparison
                <select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value)}>
                  <option value="none">None</option>
                  <option value="average">Average</option>
                  <option value="competitive">Competitive</option>
                </select>
              </label>
              <label>
                Sort
                <select value={responderSort} onChange={(event) => setResponderSort(event.target.value)}>
                  <option value="lowest_bid">Lowest Bid</option>
                  <option value="highest_bid">Highest Bid</option>
                  <option value="dealer_name">Dealer Name</option>
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
              <button
                className="btn"
                type="button"
                onClick={resetComparisonView}
                disabled={loading}
              >
                Reset View
              </button>
              {launchedFromDashboard ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
                    if (bidPackageId) {
                      storeComparisonState(String(bidPackageId), {
                        dealerPriceMode: dealerPriceModeRef.current,
                        cellPriceMode: cellPriceModeRef.current,
                        excludedSpecItemIds: excludedRowIdsRef.current,
                        responderSort: responderSortRef.current,
                        comparisonMode: comparisonModeRef.current,
                        showProductColumn: showProductColumnRef.current,
                        showBrandColumn: showBrandColumnRef.current,
                        showLeadTimeColumn: showLeadTimeColumnRef.current,
                        showDealerNotesColumn: showDealerNotesColumnRef.current
                      })
                    }
                    navigate('/package')
                  }}
                  disabled={loading}
                >
                  Close
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {launchedFromDashboard && statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
        {launchedFromDashboard && awardedBidId ? (
          <p className="text-muted">
            Awarded mode is active. Comparison controls are read-only.
            {awardedAt ? ` Awarded at ${new Date(awardedAt).toLocaleString()}.` : ''}
          </p>
        ) : null}
        <div className="table-scroll-top" aria-label="Horizontal scroll control">
          <button
            type="button"
            className="btn"
            onClick={() => nudgeHorizontalScroll(-320)}
            disabled={scrollMax <= 0}
          >
            ←
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => nudgeHorizontalScroll(320)}
            disabled={scrollMax <= 0}
          >
            →
          </button>
          <span className="table-scroll-hint">Drag table left/right</span>
        </div>
        <div
          className="table-scroll"
          ref={tableScrollRef}
          style={launchedFromDashboard ? { height: 'calc(100dvh - 195px)', maxHeight: 'calc(100dvh - 195px)' } : undefined}
          onScroll={syncFromTable}
        >
        <div className="comparison-table-inner" ref={tableInnerRef}>
        <table className="table comparison-table" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr>
              <th rowSpan={2}>
                <label className="comparison-use-header">
                  <span>Use</span>
                  <input
                    type="checkbox"
                    className="row-toggle-input"
                    checked={allRowsIncluded}
                    onChange={(event) => {
                      if (event.target.checked) includeAllRows()
                      else excludeAllRows()
                    }}
                    disabled={(data.rows || []).length === 0 || comparisonLocked}
                    aria-label="Toggle all rows"
                  />
                </label>
              </th>
              <th rowSpan={2}>
                <button className="th-sort-btn" onClick={() => cycleSort('sku')}>
                  Code/Tag{sortIndicator('sku')}
                </button>
              </th>
              {showProductColumn ? (
                <th rowSpan={2} className="comparison-col-product">
                  <button className="th-sort-btn" onClick={() => cycleSort('product_name')}>
                    Product{sortIndicator('product_name')}
                  </button>
                </th>
              ) : null}
              {showBrandColumn ? <th rowSpan={2} className="comparison-col-brand">Brand</th> : null}
              <th rowSpan={2}>
                <button className="th-sort-btn" onClick={() => cycleSort('quantity')}>
                  Qty/UOM{sortIndicator('quantity')}
                </button>
              </th>
              {showAverageColumns ? (
                <th rowSpan={2}>
                  <button className="th-sort-btn" onClick={() => cycleSort('avg_unit_price')}>
                    Avg Unit Price{sortIndicator('avg_unit_price')}
                  </button>
                </th>
              ) : null}
              {showAverageColumns ? <th rowSpan={2}>Avg Extended</th> : null}
                {visibleDealers.map((dealer) => (
                  (() => {
                    const status = selectionStatusForDealer(dealer, awardedBidId)
                    const isAwarded = status === 'awarded'
                    const canAward = !awardedBidId && Boolean(dealer.bid_id)
                    const canChangeAward = Boolean(awardedBidId) && !isAwarded && Boolean(dealer.bid_id)
                    const canClearAward = Boolean(awardedBidId) && isAwarded
                    return (
                      <th
                        key={`group-${dealer.invite_id}`}
                        colSpan={dealerColumnsPerResponder}
                        className={`dealer-group-header dealer-block-start dealer-block-end ${awardedBidId && dealer.bid_id === awardedBidId ? 'dealer-group-awarded' : ''}`.trim()}
                      >
                        <div className="dealer-group-header-inner">
                          <div className="dealer-group-header-actions">
                            {canAward ? (
                              <button
                                type="button"
                                className="btn btn-primary btn-award"
                                onClick={() => openAwardModal('award', dealer)}
                                disabled={loading || awardSaving}
                              >
                                Award
                              </button>
                            ) : null}
                            {canChangeAward ? (
                              <button
                                type="button"
                                className="btn btn-award-change"
                                onClick={() => openAwardModal('change', dealer)}
                                disabled={loading || awardSaving}
                              >
                                Change Award
                              </button>
                            ) : null}
                            {canClearAward ? (
                              <button
                                type="button"
                                className="btn btn-award-change"
                                onClick={() => openAwardModal('clear', dealer)}
                                disabled={loading || awardSaving}
                              >
                                Remove Award
                              </button>
                            ) : null}
                          </div>
                          <div className="dealer-group-header-name">{companyName(dealer.dealer_name)}</div>
                        </div>
                      </th>
                    )
                  })()
                ))}
            </tr>
            <tr>
              {visibleDealers.map((dealer) => (
                <Fragment key={dealer.invite_id}>
                  <th className="dealer-block-start dealer-metric-header">
                    <button className="th-sort-btn" onClick={() => cycleSort('dealer_price', dealer.invite_id)}>
                      Unit Price{sortIndicator('dealer_price', dealer.invite_id)}
                    </button>
                  </th>
                  {showLeadTimeColumn ? <th className="dealer-metric-header">Lead Time (Days)</th> : null}
                  {showDealerNotesColumn ? <th className="dealer-metric-header">Notes</th> : null}
                  <th className="dealer-metric-header">Extended</th>
                  {showDealerDeltaColumn ? (
                    <th className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} dealer-metric-header`.trim()}>
                      <button className="th-sort-btn" onClick={() => cycleSort('dealer_delta', dealer.invite_id)}>
                        {comparisonMode === 'competitive' ? '% Next Lower' : '% Avg Delta'}{sortIndicator('dealer_delta', dealer.invite_id)}
                      </button>
                    </th>
                  ) : null}
                  {showDealerNextDeltaColumn ? (
                    <th className="dealer-block-end dealer-metric-header">
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
                    type="checkbox"
                    className="row-toggle-input"
                    checked={rowIncluded(row)}
                    onChange={() => toggleRowIncluded(row.spec_item_id)}
                    disabled={comparisonLocked}
                    aria-label={`Use ${row.sku || row.product_name || 'line item'}`}
                  />
                </td>
                <td>
                  <span>{row.sku || '—'}</span>
                </td>
                {showProductColumn ? (
                  <td className="comparison-col-product" title={row.product_name || ''}>
                    {row.product_name || '—'}
                  </td>
                ) : null}
                {showBrandColumn ? (
                  <td className="comparison-col-brand" title={row.manufacturer || ''}>
                    {row.manufacturer || '—'}
                  </td>
                ) : null}
                <td>{row.quantity || '—'} {row.uom || ''}</td>
                {showAverageColumns ? <td className="num">{money(dynamicRowAverage(row))}</td> : null}
                {showAverageColumns ? <td className="num">{money(extendedAmount(dynamicRowAverage(row), row.quantity))}</td> : null}
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
                  const notePopoverKey = `note-${row.spec_item_id}-${dealer.invite_id}`
                  const modeKey = cellModeKey(row.spec_item_id, dealer.invite_id)
                  const canSelectQuotePerCell = Boolean(cell?.has_bod_price && cell?.has_alt_price)
                  const dealerNote = String(cell?.dealer_notes || '').trim()
                  const cells = [
                    <td
                      key={`${row.spec_item_id}-${dealer.invite_id}-price`}
                      className={`dealer-block-start num ${isBest ? 'best' : ''}`.trim()}
                    >
                      <div className="dealer-price-cell">
                        {canSelectQuotePerCell ? (
                          <span className="quote-toggle cell-quote-toggle">
                            <button
                              type="button"
                              className={`quote-toggle-btn ${choice === 'bod' ? 'active' : ''}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setCellPriceMode((prev) => ({ ...prev, [modeKey]: 'bod' }))
                              }}
                              disabled={comparisonLocked}
                            >
                              BoD
                            </button>
                            <button
                              type="button"
                              className={`quote-toggle-btn ${choice === 'alt' ? 'active' : ''}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setCellPriceMode((prev) => ({ ...prev, [modeKey]: 'alt' }))
                              }}
                              disabled={comparisonLocked}
                            >
                              Sub
                            </button>
                          </span>
                        ) : null}
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
                    showLeadTimeColumn ? (
                      <td key={`${row.spec_item_id}-${dealer.invite_id}-lead-time`} className="num">
                        {cell?.lead_time_days ?? '—'}
                      </td>
                    ) : null,
                    showDealerNotesColumn ? (
                      <td key={`${row.spec_item_id}-${dealer.invite_id}-dealer-notes`} className="dealer-notes-cell">
                        {dealerNote ? (
                          <span
                            className="sub-popover-wrap"
                            onMouseEnter={() => setActiveNotePopoverKey(notePopoverKey)}
                            onMouseLeave={() => setActiveNotePopoverKey((prev) => (prev === notePopoverKey ? null : prev))}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="note-chip"
                              onClick={() => setActiveNotePopoverKey((prev) => (prev === notePopoverKey ? null : notePopoverKey))}
                              aria-label="View dealer note"
                            >
                              i
                            </button>
                            {activeNotePopoverKey === notePopoverKey ? (
                              <div className="sub-popover dealer-note-popover">
                                {dealerNote}
                              </div>
                            ) : null}
                          </span>
                        ) : '—'}
                      </td>
                    ) : null,
                    <td key={`${row.spec_item_id}-${dealer.invite_id}-extended`} className="num">
                      {money(extendedAmount(effectivePrice, row.quantity))}
                    </td>,
                    ...(showDealerDeltaColumn
                      ? [(
                        <td key={`${row.spec_item_id}-${dealer.invite_id}-delta`} className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}>
                          {betterDelta}
                        </td>
                      )]
                      : []),
                    ...(showDealerNextDeltaColumn
                      ? [<td key={`${row.spec_item_id}-${dealer.invite_id}-next-delta`} className="dealer-block-end num">{nextBestDelta}</td>]
                      : [])
                  ]
                  return cells.filter(Boolean)
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
                <td colSpan={labelColumnsBeforeAverages}><strong>Sub-total</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgSubtotal)}</strong></td> : null}
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
                      {showLeadTimeColumn ? <td className="num"><strong>—</strong></td> : null}
                      {showDealerNotesColumn ? <td><strong>—</strong></td> : null}
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(subtotal)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              {activeGeneralFields.includes('delivery_amount') ? (
              <tr>
                <td colSpan={labelColumnsBeforeAverages}><strong>Shipping</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgDelivery)}</strong></td> : null}
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
                      {showLeadTimeColumn ? <td className="num"><strong>—</strong></td> : null}
                      {showDealerNotesColumn ? <td><strong>—</strong></td> : null}
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              {activeGeneralFields.includes('install_amount') ? (
              <tr>
                <td colSpan={labelColumnsBeforeAverages}><strong>Install</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgInstall)}</strong></td> : null}
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
                      {showLeadTimeColumn ? <td className="num"><strong>—</strong></td> : null}
                      {showDealerNotesColumn ? <td><strong>—</strong></td> : null}
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              {activeGeneralFields.includes('escalation_amount') ? (
              <tr>
                <td colSpan={labelColumnsBeforeAverages}><strong>Escalation</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgEscalation)}</strong></td> : null}
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
                      {showLeadTimeColumn ? <td className="num"><strong>—</strong></td> : null}
                      {showDealerNotesColumn ? <td><strong>—</strong></td> : null}
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              {activeGeneralFields.includes('contingency_amount') ? (
              <tr>
                <td colSpan={labelColumnsBeforeAverages}><strong>Contingency</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgContingency)}</strong></td> : null}
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
                      {showLeadTimeColumn ? <td className="num"><strong>—</strong></td> : null}
                      {showDealerNotesColumn ? <td><strong>—</strong></td> : null}
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              {activeGeneralFields.includes('sales_tax_amount') ? (
              <tr>
                <td colSpan={labelColumnsBeforeAverages}><strong>Sales Tax</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgSalesTax)}</strong></td> : null}
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
                      {showLeadTimeColumn ? <td className="num"><strong>—</strong></td> : null}
                      {showDealerNotesColumn ? <td><strong>—</strong></td> : null}
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
              ) : null}
              <tr className="total-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Total Bid Amount</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgTotal)}</strong></td> : null}
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
                      {showLeadTimeColumn ? <td className="num"><strong>—</strong></td> : null}
                      {showDealerNotesColumn ? <td><strong>—</strong></td> : null}
                      <td className={`num ${isBest ? 'best' : ''}`.trim()}><strong>{money(total)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className="dealer-block-end num"><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
        </div>
        </div>

        {(visibleDealers || []).length > 0 ? (
          <p className="text-muted">
            Use BoD/Sub toggles in each cell to override quote source per vendor per line item.
          </p>
        ) : null}
        {(visibleDealers || []).length > 0 ? (
          <p className="text-muted">
            Dealers in view: {(visibleDealers || []).map((dealer) => companyName(dealer.dealer_name)).join(', ')}
          </p>
        ) : null}
      </SectionCard>

      {awardModal ? (
        <div className="modal-backdrop" onClick={closeAwardModal}>
          <div className="modal-card award-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{awardModal.mode === 'change' ? 'Change Award' : awardModal.mode === 'clear' ? 'Remove Award' : 'Award Vendor'}</h3>
            <p>
              {awardModal.mode === 'change'
                ? `Change award to ${companyName(awardModal.dealer.dealer_name)}?`
                : awardModal.mode === 'clear'
                  ? `Remove award from ${companyName(awardModal.dealer.dealer_name)}?`
                : `Award ${companyName(awardModal.dealer.dealer_name)}?`}
            </p>
            <p className="text-muted">
              {awardModal.mode === 'change'
                ? 'The current award will be removed and this vendor will become awarded.'
                : awardModal.mode === 'clear'
                  ? 'The bid package will return to bidding mode with no vendor selected.'
                : 'The other bidders will be marked as Lost.'}
            </p>
            <div className="action-row">
              <button type="button" className="btn" onClick={closeAwardModal} disabled={awardSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitAward} disabled={awardSaving}>
                {awardSaving
                  ? 'Saving...'
                  : awardModal.mode === 'change'
                    ? 'Change Award'
                    : awardModal.mode === 'clear'
                      ? 'Remove Award'
                      : 'Award Vendor'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
