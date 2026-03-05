import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import ApprovalTimestampTooltip from '../components/ApprovalTimestampTooltip'
import {
  awardBidPackage,
  clearBidPackageAward,
  changeBidPackageAward,
  comparisonExportUrl,
  deactivateSpecItem,
  fetchBidPackageDashboard,
  fetchBidPackages,
  fetchComparison,
  approveSpecItemRequirement,
  markSpecItemRequirementNeedsFix,
  unapproveSpecItemRequirement,
  reactivateSpecItem
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

function deltaToneClass(displayValue) {
  const text = String(displayValue || '').trim()
  if (text.startsWith('+')) return 'delta-positive'
  if (text.startsWith('-')) return 'delta-negative'
  return ''
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
  showUnitPriceColumn: true,
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
      showUnitPriceColumn: typeof parsed?.showUnitPriceColumn === 'boolean' ? parsed.showUnitPriceColumn : DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn,
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
      showUnitPriceColumn: typeof state?.showUnitPriceColumn === 'boolean' ? state.showUnitPriceColumn : DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn,
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

function decodeHistoryViewFromSearchParams(searchParams) {
  const bidderIdRaw = searchParams.get('history_bidder_id')
  const versionRaw = searchParams.get('history_version')
  const dealerName = searchParams.get('history_dealer_name')
  const date = searchParams.get('history_date')
  const time = searchParams.get('history_time')
  if (!bidderIdRaw || !versionRaw || !dealerName || !date || !time) return null
  const bidderId = Number(bidderIdRaw)
  const version = Number(versionRaw)
  if (!Number.isFinite(bidderId) || !Number.isFinite(version)) return null
  return { bidderId, version, dealerName, date, time }
}

function IconCheck() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

function IconX() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function IconFile() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M15 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
      <path d="M9 9h1" />
    </svg>
  )
}

export default function ComparisonPage({
  embedded = false,
  bidPackageId: embeddedBidPackageId = '',
  onClose = null,
  allowItemManagement = false,
  onAwardChanged = null,
  forcedVisibleDealerIds = null,
  historyView = null,
  onExitHistoryView = null,
  awardedWorkspace = false,
  requiredApprovalColumns = [],
  requiredApprovalsBySpecItem = {},
  lineItemUploadsBySpecItem = {},
  onApproveRequirement = null,
  onUnapproveRequirement = null,
  onNeedsFixRequirement = null,
  onOpenLineItemFiles = null,
  lineItemsHeaderActionLabel = '',
  onLineItemsHeaderAction = null,
  lineItemsHeaderActionDisabled = false
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const forcedBidPackageId = embedded
    ? String(embeddedBidPackageId || '')
    : (searchParams.get('bid_package_id') || '')
  const launchedFromDashboard = Boolean(forcedBidPackageId)
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState(forcedBidPackageId)
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [data, setData] = useState({ dealers: [], rows: [] })
  const [visibleDealerIds, setVisibleDealerIds] = useState([])
  const [responderSort, setResponderSort] = useState('lowest_bid')
  const [comparisonMode, setComparisonMode] = useState('none')
  const [showUnitPriceColumn, setShowUnitPriceColumn] = useState(true)
  const [showProductColumn, setShowProductColumn] = useState(true)
  const [showBrandColumn, setShowBrandColumn] = useState(true)
  const [showLeadTimeColumn, setShowLeadTimeColumn] = useState(false)
  const [showDealerNotesColumn, setShowDealerNotesColumn] = useState(false)
  const [fullscreenHistoryView, setFullscreenHistoryView] = useState(() => (
    embedded ? null : decodeHistoryViewFromSearchParams(searchParams)
  ))
  const [activeSubPopoverKey, setActiveSubPopoverKey] = useState(null)
  const [activeNotePopoverKey, setActiveNotePopoverKey] = useState(null)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showViewSubmenu, setShowViewSubmenu] = useState(false)
  const [showExportSubmenu, setShowExportSubmenu] = useState(false)
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
  const [unapproveModal, setUnapproveModal] = useState(null)
  const [unapproveSaving, setUnapproveSaving] = useState(false)
  const [fullscreenRequiredApprovalColumns, setFullscreenRequiredApprovalColumns] = useState([])
  const [fullscreenRequiredApprovalsBySpecItem, setFullscreenRequiredApprovalsBySpecItem] = useState({})
  const [fullscreenLineItemUploadsBySpecItem, setFullscreenLineItemUploadsBySpecItem] = useState({})
  const [tableScrollLeft, setTableScrollLeft] = useState(0)
  const [tableScrollTop, setTableScrollTop] = useState(0)
  const includeInactiveRows = allowItemManagement
  const isAwardedWorkspace = Boolean(awardedWorkspace || (launchedFromDashboard && awardedBidId))
  const effectiveHistoryView = historyView || fullscreenHistoryView
  const historyModeActive = Boolean(effectiveHistoryView)
  const effectiveRequiredApprovalColumns = (requiredApprovalColumns && requiredApprovalColumns.length > 0)
    ? requiredApprovalColumns
    : fullscreenRequiredApprovalColumns
  const effectiveRequiredApprovalsBySpecItem = (requiredApprovalsBySpecItem && Object.keys(requiredApprovalsBySpecItem).length > 0)
    ? requiredApprovalsBySpecItem
    : fullscreenRequiredApprovalsBySpecItem
  const effectiveLineItemUploadsBySpecItem = (lineItemUploadsBySpecItem && Object.keys(lineItemUploadsBySpecItem).length > 0)
    ? lineItemUploadsBySpecItem
    : fullscreenLineItemUploadsBySpecItem
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
  const showUnitPriceColumnRef = useRef(showUnitPriceColumn)
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
    showUnitPriceColumnRef.current = showUnitPriceColumn
  }, [showUnitPriceColumn])

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

  const updateFullscreenRequirement = ({ specItemId, requirementKey, updates }) => {
    setFullscreenRequiredApprovalsBySpecItem((prev) => {
      const next = { ...prev }
      const current = Array.isArray(next[String(specItemId)]) ? next[String(specItemId)] : []
      next[String(specItemId)] = current.map((item) => (
        item.key === requirementKey
          ? { ...item, ...updates }
          : item
      ))
      return next
    })
  }

  useEffect(() => {
    if (forcedBidPackageId) return
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
  }, [forcedBidPackageId])

  const loadComparisonForBidPackage = async (
    bidPackageId,
    {
      dealerPriceMode: requestedDealerPriceMode = {},
      cellPriceMode: requestedCellPriceMode = {},
      excludedSpecItemIds: requestedExcludedSpecItemIds = [],
      includeInactive: requestedIncludeInactive = false,
      responderSort: requestedResponderSort = DEFAULT_COMPARISON_VIEW_STATE.responderSort,
      comparisonMode: requestedComparisonMode = DEFAULT_COMPARISON_VIEW_STATE.comparisonMode,
      showUnitPriceColumn: requestedShowUnitPriceColumn = DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn,
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
        cellPriceMode: requestedCellPriceMode,
        includeInactive: requestedIncludeInactive
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
      setResponderSort(DEFAULT_COMPARISON_VIEW_STATE.responderSort)
      setComparisonMode(requestedComparisonMode || DEFAULT_COMPARISON_VIEW_STATE.comparisonMode)
      setShowUnitPriceColumn(typeof requestedShowUnitPriceColumn === 'boolean' ? requestedShowUnitPriceColumn : DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn)
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
    loadComparisonForBidPackage(String(forcedBidPackageId), {
      ...storedState,
      includeInactive: includeInactiveRows
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedBidPackageId, includeInactiveRows])

  useEffect(() => {
    if (!Array.isArray(forcedVisibleDealerIds)) return
    const available = new Set((data.dealers || []).map((dealer) => String(dealer.invite_id)))
    const normalized = forcedVisibleDealerIds
      .map((id) => String(id))
      .filter((id) => available.has(id))
    setVisibleDealerIds(normalized.map((id) => {
      const parsed = Number(id)
      return Number.isFinite(parsed) ? parsed : id
    }))
  }, [forcedVisibleDealerIds, data.dealers])

  useEffect(() => {
    if (!launchedFromDashboard || embedded) return
    if (!loadedBidPackageId) return
    if (!isAwardedWorkspace) {
      setFullscreenRequiredApprovalColumns([])
      setFullscreenRequiredApprovalsBySpecItem({})
      setFullscreenLineItemUploadsBySpecItem({})
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const dashboardData = await fetchBidPackageDashboard(loadedBidPackageId)
        if (cancelled) return
        const specItems = Array.isArray(dashboardData?.spec_items) ? dashboardData.spec_items : []
        const approvalsBySpecItem = specItems.reduce((acc, item) => {
          if (item?.id != null) {
            acc[String(item.id)] = Array.isArray(item.required_approvals) ? item.required_approvals : []
          }
          return acc
        }, {})
        const uploadsBySpecItem = specItems.reduce((acc, item) => {
          if (item?.id != null) {
            acc[String(item.id)] = Array.isArray(item.uploads) ? item.uploads : []
          }
          return acc
        }, {})
        setFullscreenRequiredApprovalColumns(Array.isArray(dashboardData?.required_approval_columns) ? dashboardData.required_approval_columns : [])
        setFullscreenRequiredApprovalsBySpecItem(approvalsBySpecItem)
        setFullscreenLineItemUploadsBySpecItem(uploadsBySpecItem)
      } catch (_error) {
        if (!cancelled) {
          setFullscreenRequiredApprovalColumns([])
          setFullscreenRequiredApprovalsBySpecItem({})
          setFullscreenLineItemUploadsBySpecItem({})
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [launchedFromDashboard, embedded, loadedBidPackageId, isAwardedWorkspace])

  const loadComparison = async () => {
    if (!selectedBidPackageId) return
    const hasInMemoryState = (
      Object.keys(dealerPriceMode).length > 0 ||
      Object.keys(cellPriceMode).length > 0 ||
      excludedRowIds.length > 0 ||
      responderSort !== DEFAULT_COMPARISON_VIEW_STATE.responderSort ||
      comparisonMode !== DEFAULT_COMPARISON_VIEW_STATE.comparisonMode ||
      showUnitPriceColumn !== DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn ||
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
          showUnitPriceColumn,
          showProductColumn,
          showBrandColumn,
          showLeadTimeColumn,
          showDealerNotesColumn
        }
      : loadStoredComparisonState(String(selectedBidPackageId))
    await loadComparisonForBidPackage(selectedBidPackageId, {
      ...state,
      includeInactive: includeInactiveRows
    })
  }

  const reloadCurrentComparison = async () => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
    if (!bidPackageId) return
    await loadComparisonForBidPackage(String(bidPackageId), {
      dealerPriceMode: dealerPriceModeRef.current,
      cellPriceMode: cellPriceModeRef.current,
      excludedSpecItemIds: excludedRowIdsRef.current,
      includeInactive: includeInactiveRows,
      responderSort: responderSortRef.current,
      comparisonMode: comparisonModeRef.current,
      showUnitPriceColumn: showUnitPriceColumnRef.current,
      showProductColumn: showProductColumnRef.current,
      showBrandColumn: showBrandColumnRef.current,
      showLeadTimeColumn: showLeadTimeColumnRef.current,
      showDealerNotesColumn: showDealerNotesColumnRef.current
    })
  }

  const deactivateComparisonItem = async (row) => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
    if (!bidPackageId) return
    setLoading(true)
    setStatusMessage(`Deactivating ${row.sku || row.spec_item_id}...`)
    try {
      await deactivateSpecItem({ bidPackageId, specItemId: row.spec_item_id })
      setStatusMessage('Line item deactivated.')
      await reloadCurrentComparison()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const reactivateComparisonItem = async (row) => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
    if (!bidPackageId) return
    setLoading(true)
    setStatusMessage(`Re-activating ${row.sku || row.spec_item_id}...`)
    try {
      await reactivateSpecItem({ bidPackageId, specItemId: row.spec_item_id })
      setStatusMessage('Line item re-activated.')
      await reloadCurrentComparison()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loadedBidPackageId) return
    reloadCurrentComparison()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedBidPackageId])

  const resetComparisonView = async () => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId
    if (!bidPackageId) return
    clearStoredComparisonState(String(bidPackageId))
    await loadComparisonForBidPackage(String(bidPackageId), {
      dealerPriceMode: {},
      cellPriceMode: {},
      excludedSpecItemIds: [],
      includeInactive: includeInactiveRows,
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
      showUnitPriceColumn,
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
    showUnitPriceColumn,
    showProductColumn,
    showBrandColumn,
    showLeadTimeColumn,
    showDealerNotesColumn
  ])

  const toggleRowIncluded = (specItemId) => {
    const key = String(specItemId)
    if (excludedRowIds.some((id) => String(id) === key)) {
      removeExcludedRowId(key)
    } else {
      addExcludedRowId(key)
    }
  }

  const sortedDealers = useMemo(() => {
    const sortedDealersByTotal = [...(data.dealers || [])].sort((a, b) => {
      const totalA = dealerTotalsById[a.invite_id]?.total || 0
      const totalB = dealerTotalsById[b.invite_id]?.total || 0
      return totalA - totalB
    })
    const availableByInviteId = new Map((data.dealers || []).map((dealer) => [String(dealer.invite_id), dealer]))
    if (!Array.isArray(forcedVisibleDealerIds)) return sortedDealersByTotal
    const ordered = visibleDealerIds
      .map((id) => availableByInviteId.get(String(id)))
      .filter(Boolean)
    return ordered
  }, [data.dealers, dealerTotalsById, forcedVisibleDealerIds, visibleDealerIds])

  const visibleDealerIdSet = useMemo(
    () => new Set((visibleDealerIds || []).map((id) => String(id))),
    [visibleDealerIds]
  )

  const visibleDealers = sortedDealers.filter((dealer) => {
    if (!visibleDealerIdSet.has(String(dealer.invite_id))) return false
    if (!isAwardedWorkspace) return true
    return awardedBidId ? dealer.bid_id === awardedBidId : false
  })
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
  const showNextBestDeltaColumn = !isAwardedWorkspace && visibleDealers.length >= 2
  const showAverageColumns = !isAwardedWorkspace && comparisonMode === 'average'
  const showDealerDeltaColumn = !isAwardedWorkspace && (comparisonMode === 'average' || comparisonMode === 'competitive')
  const showDealerNextDeltaColumn = !isAwardedWorkspace && comparisonMode === 'competitive' && showNextBestDeltaColumn
  const showUseColumn = !isAwardedWorkspace
  const showUnitPriceColumnEffective = showUnitPriceColumn
  const showLeadTimeColumnEffective = showLeadTimeColumn
  const showDealerNotesColumnEffective = showDealerNotesColumn
  const showProductColumnEffective = showProductColumn
  const showBrandColumnEffective = showBrandColumn
  const comparisonLocked = Boolean(awardedBidId)
  const metricColumnsPerResponder = (showUnitPriceColumnEffective ? 1 : 0) + 1 + (showDealerDeltaColumn ? 1 : 0) + (showDealerNextDeltaColumn ? 1 : 0)
  const optionalColumnsPerResponder = (showLeadTimeColumnEffective ? 1 : 0) + (showDealerNotesColumnEffective ? 1 : 0)
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
    if (historyModeActive) return
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

  const openUnapproveModal = (entry) => {
    setUnapproveModal(entry)
  }

  const closeUnapproveModal = () => {
    if (unapproveSaving) return
    setUnapproveModal(null)
  }

  const submitAward = async () => {
    if (!awardModal || !loadedBidPackageId) return
    if (historyModeActive) return

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
        excludedSpecItemIds: snapshot.excludedSpecItemIds,
        includeInactive: includeInactiveRows
      })
      if (typeof onAwardChanged === 'function') {
        await onAwardChanged()
      }
      setAwardModal(null)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setAwardSaving(false)
    }
  }

  const submitUnapprove = async () => {
    if (!unapproveModal) return

    setUnapproveSaving(true)
    setStatusMessage('Removing approval...')
    try {
      const { specItemId, requirementKey, needsFixDates = [], actionType = 'unapproved' } = unapproveModal

      if (onUnapproveRequirement) {
        await onUnapproveRequirement({ specItemId, requirementKey, actionType })
      } else if (loadedBidPackageId) {
        await unapproveSpecItemRequirement({
          bidPackageId: loadedBidPackageId,
          specItemId,
          requirementKey,
          actionType
        })
        updateFullscreenRequirement({
          specItemId,
          requirementKey,
          updates: {
            status: 'pending',
            approved: false,
            approved_at: null,
            approved_by: null,
            needs_fix_dates: needsFixDates
          }
        })
      }

      setStatusMessage(actionType === 'reset' ? 'Requirement reset to pending.' : 'Approval removed.')
      setUnapproveModal(null)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setUnapproveSaving(false)
    }
  }

  useEffect(() => {
    const closePopover = () => {
      setActiveSubPopoverKey(null)
      setActiveNotePopoverKey(null)
      setShowActionsMenu(false)
      setShowViewSubmenu(false)
      setShowExportSubmenu(false)
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
    const table = tableScrollRef.current
    if (!table) return
    setTableScrollLeft(table.scrollLeft || 0)
    setTableScrollTop(table.scrollTop || 0)
  }

  const nudgeHorizontalScroll = (distance) => {
    const table = tableScrollRef.current
    if (!table) return
    const minJump = Math.round(table.clientWidth * 0.78)
    const jump = Math.sign(distance || 1) * Math.max(Math.abs(distance), minJump)
    table.scrollBy({ left: jump, behavior: 'smooth' })
  }

  const handleTableMouseDown = () => {}
  const handleTableMouseMove = () => {}
  const stopTableDragging = () => {}

  const handleExportChange = (format, exportType = 'comparison') => {
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
      },
      exportType
    )
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const labelColumnsBeforeAverages = (showUseColumn ? 3 : 2) + (showProductColumnEffective ? 1 : 0) + (showBrandColumnEffective ? 1 : 0)
  const baseColumnsBeforeDealers = labelColumnsBeforeAverages + (showAverageColumns ? 2 : 0)
  const baseTableMinWidth =
    (showUseColumn ? 70 : 0) + // Use
    130 + // Code/Tag
    (showProductColumnEffective ? 220 : 0) +
    (showBrandColumnEffective ? 180 : 0) +
    120 + // Qty/UOM
    (showAverageColumns ? (130 + 160) : 0) // Avg Unit + Avg Extended
  const perDealerMinWidth =
    (showUnitPriceColumnEffective ? 130 : 0) + // Unit
    (showLeadTimeColumnEffective ? 110 : 0) +
    (showDealerNotesColumnEffective ? 110 : 0) +
    150 + // Extended
    (showDealerDeltaColumn ? 120 : 0) + // Delta
    (showDealerNextDeltaColumn ? 120 : 0)
  const hasFilesColumn = isAwardedWorkspace && (
    typeof onOpenLineItemFiles === 'function' ||
    Object.keys(effectiveLineItemUploadsBySpecItem || {}).length > 0
  )
  const awardedColumnsCount = isAwardedWorkspace
    ? (effectiveRequiredApprovalColumns.length + (hasFilesColumn ? 1 : 0))
    : 0
  const renderAwardedRequirementsFooterCells = (prefix) => (
    isAwardedWorkspace
      ? [
        ...(hasFilesColumn ? [
          <td key={`${prefix}-files`} className="approval-cell-na">
            <strong>—</strong>
          </td>
        ] : []),
        ...effectiveRequiredApprovalColumns.map((column) => (
          <td key={`${prefix}-${column.key}`} className="approval-cell-na">
            <strong>—</strong>
          </td>
        ))
      ]
      : null
  )
  const requirementsColumnsMinWidth = (effectiveRequiredApprovalColumns.length * 120) + (hasFilesColumn ? 110 : 0)
  const tableMinWidth = baseTableMinWidth + (visibleDealers.length * perDealerMinWidth) + requirementsColumnsMinWidth + 40
  const shouldPinCodeColumn = tableScrollLeft > 140
  const shouldHideAwardActions = isAwardedWorkspace || tableScrollTop > 8
  const showDealerGroupHeader = !isAwardedWorkspace && visibleDealers.length > 0
  const sparseNoBidderLayout = visibleDealers.length === 0 && !isAwardedWorkspace
  const sparseColumnPercents = useMemo(() => {
    if (!sparseNoBidderLayout) return []
    const columns = []
    if (showUseColumn) columns.push({ key: 'use', weight: 1.2 })
    columns.push({ key: 'code', weight: 1.5 })
    if (showProductColumnEffective) columns.push({ key: 'product', weight: 4.8 })
    if (showBrandColumnEffective) columns.push({ key: 'brand', weight: 2.8 })
    columns.push({ key: 'qty', weight: 1.3 })

    const totalWeight = columns.reduce((sum, col) => sum + col.weight, 0) || 1
    return columns.map((col) => ({
      key: col.key,
      widthPct: (col.weight / totalWeight) * 100
    }))
  }, [sparseNoBidderLayout, showUseColumn, showProductColumnEffective, showBrandColumnEffective])
  const unitPriceStartClass = isAwardedWorkspace ? '' : 'dealer-block-start'
  const leadTimeStartClass = !showUnitPriceColumnEffective ? 'dealer-block-start' : ''
  const notesStartClass = !showUnitPriceColumnEffective && !showLeadTimeColumnEffective ? 'dealer-block-start' : ''
  const extendedStartClass = !showUnitPriceColumnEffective && !showLeadTimeColumnEffective && !showDealerNotesColumnEffective ? 'dealer-block-start' : ''

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

          {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
        </SectionCard>
      ) : null}

      <SectionCard className="comparison-flat">
        {embedded ? (
          <div className="section-head comparison-subheader-wrap">
            <h2>Line Items ({data.rows?.length || 0})</h2>
            <div className="section-actions">
              {lineItemsHeaderActionLabel && typeof onLineItemsHeaderAction === 'function' ? (
                <button
                  type="button"
                  className="btn"
                  onClick={onLineItemsHeaderAction}
                  disabled={lineItemsHeaderActionDisabled || loading}
                >
                  {lineItemsHeaderActionLabel}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {launchedFromDashboard && statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
        <div className="table-scroll-top" aria-label="Horizontal scroll control">
          <div className="comparison-toolbar-left">
            <button
              type="button"
              className="btn"
              onClick={() => nudgeHorizontalScroll(-520)}
              disabled={scrollMax <= 0}
            >
              ←
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => nudgeHorizontalScroll(520)}
              disabled={scrollMax <= 0}
            >
              →
            </button>
            <span className="table-scroll-hint">Drag table left/right</span>
          </div>
          <div className="comparison-toolbar-right" onClick={(event) => event.stopPropagation()}>
            <div className="actions-menu-wrap">
              <button
                type="button"
                className="btn icon-btn-subtle"
                onClick={() => {
                  const nextOpen = !showActionsMenu
                  setShowActionsMenu(nextOpen)
                  if (!nextOpen) {
                    setShowViewSubmenu(false)
                    setShowExportSubmenu(false)
                  }
                }}
                disabled={loading}
                title="Actions"
                aria-label="Actions"
              >
                …
              </button>
              {showActionsMenu ? (
                <div className="actions-menu-panel">
                  <button
                    type="button"
                    className="actions-menu-item"
                    onMouseEnter={() => {
                      setShowViewSubmenu(true)
                      setShowExportSubmenu(false)
                    }}
                  >
                    {!embedded ? '← View' : 'View →'}
                  </button>
                  <button
                    type="button"
                    className="actions-menu-item"
                    onMouseEnter={() => {
                      setShowExportSubmenu(true)
                      setShowViewSubmenu(false)
                    }}
                  >
                    {!embedded ? '← Export' : 'Export →'}
                  </button>
                  <button
                    type="button"
                    className="actions-menu-item"
                    onClick={() => {
                      resetComparisonView()
                      setShowActionsMenu(false)
                      setShowViewSubmenu(false)
                      setShowExportSubmenu(false)
                    }}
                    disabled={loading}
                  >
                    Reset View
                  </button>

                  {showViewSubmenu ? (
                    <div className={`actions-submenu-panel ${!embedded ? 'actions-submenu-panel-left' : ''}`.trim()}>
                      <p className="actions-submenu-head">Columns</p>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowProductColumn((prev) => !prev)}>
                        {showProductColumn ? '✓ ' : '○ '}Product
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowBrandColumn((prev) => !prev)}>
                        {showBrandColumn ? '✓ ' : '○ '}Brand
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowUnitPriceColumn((prev) => !prev)}>
                        {showUnitPriceColumn ? '✓ ' : '○ '}Unit Price
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowLeadTimeColumn((prev) => !prev)}>
                        {showLeadTimeColumn ? '✓ ' : '○ '}Lead Time
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowDealerNotesColumn((prev) => !prev)}>
                        {showDealerNotesColumn ? '✓ ' : '○ '}Notes
                      </button>
                      <p className="actions-submenu-head">Comparison</p>
                      <button type="button" className="actions-submenu-item" onClick={() => setComparisonMode('none')}>
                        {comparisonMode === 'none' ? '✓ ' : '○ '}None
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setComparisonMode('average')}>
                        {comparisonMode === 'average' ? '✓ ' : '○ '}Average
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setComparisonMode('competitive')}>
                        {comparisonMode === 'competitive' ? '✓ ' : '○ '}Competitive
                      </button>
                    </div>
                  ) : null}

                  {showExportSubmenu ? (
                    <div className={`actions-submenu-panel ${!embedded ? 'actions-submenu-panel-left' : ''}`.trim()}>
                      {isAwardedWorkspace ? <p className="actions-submenu-head">Matrix</p> : null}
                      {isAwardedWorkspace ? (
                        <button
                          type="button"
                          className="actions-submenu-item"
                          onClick={() => {
                            handleExportChange('csv', 'approval_matrix')
                            setShowActionsMenu(false)
                            setShowExportSubmenu(false)
                          }}
                        >
                          CSV
                        </button>
                      ) : null}
                      {isAwardedWorkspace ? (
                        <button
                          type="button"
                          className="actions-submenu-item"
                          onClick={() => {
                            handleExportChange('xlsx', 'approval_matrix')
                            setShowActionsMenu(false)
                            setShowExportSubmenu(false)
                          }}
                        >
                          Excel
                        </button>
                      ) : null}

                      {isAwardedWorkspace ? <p className="actions-submenu-head">Audit</p> : null}
                      {isAwardedWorkspace ? (
                        <button
                          type="button"
                          className="actions-submenu-item"
                          onClick={() => {
                            handleExportChange('csv', 'approval_audit')
                            setShowActionsMenu(false)
                            setShowExportSubmenu(false)
                          }}
                        >
                          CSV
                        </button>
                      ) : null}
                      {isAwardedWorkspace ? (
                        <button
                          type="button"
                          className="actions-submenu-item"
                          onClick={() => {
                            handleExportChange('xlsx', 'approval_audit')
                            setShowActionsMenu(false)
                            setShowExportSubmenu(false)
                          }}
                        >
                          Excel
                        </button>
                      ) : null}

                      <p className="actions-submenu-head">Bid Comparison</p>
                      <button
                        type="button"
                        className="actions-submenu-item"
                        onClick={() => {
                          handleExportChange('csv', 'comparison')
                          setShowActionsMenu(false)
                          setShowExportSubmenu(false)
                        }}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        className="actions-submenu-item"
                        onClick={() => {
                          handleExportChange('xlsx', 'comparison')
                          setShowActionsMenu(false)
                          setShowExportSubmenu(false)
                        }}
                      >
                        Excel
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {embedded && loadedBidPackageId ? (
              <button
                className="btn btn-primary icon-btn-subtle comparison-fullscreen-btn"
                type="button"
                onClick={() => {
                  const params = new URLSearchParams()
                  params.set('bid_package_id', String(loadedBidPackageId))
                  if (effectiveHistoryView) {
                    params.set('history_bidder_id', String(effectiveHistoryView.bidderId))
                    params.set('history_version', String(effectiveHistoryView.version))
                    params.set('history_dealer_name', effectiveHistoryView.dealerName)
                    params.set('history_date', effectiveHistoryView.date)
                    params.set('history_time', effectiveHistoryView.time)
                  }
                  navigate(`/comparison?${params.toString()}`)
                }}
                disabled={loading}
                title="Full screen"
                aria-label="Full screen"
              >
                ⛶
              </button>
            ) : null}
            {launchedFromDashboard && !embedded ? (
              <button
                className="btn icon-btn-subtle"
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
                      showUnitPriceColumn: showUnitPriceColumnRef.current,
                      showProductColumn: showProductColumnRef.current,
                      showBrandColumn: showBrandColumnRef.current,
                      showLeadTimeColumn: showLeadTimeColumnRef.current,
                      showDealerNotesColumn: showDealerNotesColumnRef.current
                    })
                  }
                  if (typeof onClose === 'function') onClose()
                  else if (bidPackageId) navigate(`/package/${bidPackageId}`)
                  else navigate('/package')
                }}
                disabled={loading}
                title="Close"
                aria-label="Close"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
        {launchedFromDashboard && !embedded && historyModeActive ? (
          <div className="comparison-history-banner comparison-history-banner-compact">
            <div className="comparison-history-banner-left">
              <span className="comparison-history-banner-icon" aria-hidden="true">📋</span>
              <div className="comparison-history-banner-content">
                <p className="comparison-history-banner-title">
                  {`Viewing History: ${effectiveHistoryView.dealerName} v${effectiveHistoryView.version}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn comparison-history-exit-btn comparison-history-exit-btn-compact"
              onClick={() => {
                if (typeof onExitHistoryView === 'function') onExitHistoryView()
                setFullscreenHistoryView(null)
                if (!embedded) {
                  const nextParams = new URLSearchParams(searchParams.toString())
                  nextParams.delete('history_bidder_id')
                  nextParams.delete('history_version')
                  nextParams.delete('history_dealer_name')
                  nextParams.delete('history_date')
                  nextParams.delete('history_time')
                  navigate(`/comparison?${nextParams.toString()}`, { replace: true })
                }
              }}
            >
              Exit
            </button>
          </div>
        ) : null}
        <div
          className="table-scroll"
          ref={tableScrollRef}
          style={launchedFromDashboard && !embedded ? { height: 'calc(100dvh - 128px)', maxHeight: 'calc(100dvh - 128px)' } : undefined}
          onScroll={syncFromTable}
        >
        <div className="comparison-table-inner" ref={tableInnerRef}>
        <table
          className={`table comparison-table ${shouldPinCodeColumn ? 'pin-code-column' : ''} ${shouldHideAwardActions ? 'hide-award-actions' : ''} ${!showDealerGroupHeader ? 'single-header' : ''} ${sparseNoBidderLayout ? 'comparison-table-sparse' : ''}`.trim()}
          style={{ width: '100%', minWidth: `${tableMinWidth}px` }}
        >
          {sparseNoBidderLayout ? (
            <colgroup>
              {sparseColumnPercents.map((col) => (
                <col key={`sparse-col-${col.key}`} style={{ width: `${col.widthPct}%` }} />
              ))}
            </colgroup>
          ) : null}
          <thead>
            {showDealerGroupHeader ? (
              <tr className="header-top">
                <th colSpan={baseColumnsBeforeDealers} />
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
                                  disabled={loading || awardSaving || historyModeActive}
                                  title={historyModeActive ? 'Exit history view to award bids' : undefined}
                                  style={historyModeActive ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
                                >
                                  Award
                                </button>
                              ) : null}
                              {canChangeAward ? (
                                <button
                                  type="button"
                                  className="btn btn-award-change"
                                  onClick={() => openAwardModal('change', dealer)}
                                  disabled={loading || awardSaving || historyModeActive}
                                  title={historyModeActive ? 'Exit history view to award bids' : undefined}
                                  style={historyModeActive ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
                                >
                                  Change Award
                                </button>
                              ) : null}
                              {canClearAward ? (
                                <button
                                  type="button"
                                  className="btn btn-award-change"
                                  onClick={() => openAwardModal('clear', dealer)}
                                  disabled={loading || awardSaving || historyModeActive}
                                  title={historyModeActive ? 'Exit history view to award bids' : undefined}
                                  style={historyModeActive ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
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
            ) : null}
            <tr className="header-bottom">
              {showUseColumn ? <th className="use-col-head" /> : null}
              <th className="code-col-head">
                <button className="th-sort-btn" onClick={() => cycleSort('sku')}>
                  Code/Tag{sortIndicator('sku')}
                </button>
              </th>
              {showProductColumnEffective ? (
                <th className="comparison-col-product">
                  <button className="th-sort-btn" onClick={() => cycleSort('product_name')}>
                    Product{sortIndicator('product_name')}
                  </button>
                </th>
              ) : null}
              {showBrandColumnEffective ? <th className="comparison-col-brand">Brand</th> : null}
              <th>
                <button className="th-sort-btn" onClick={() => cycleSort('quantity')}>
                  Qty/UOM{sortIndicator('quantity')}
                </button>
              </th>
              {showAverageColumns ? (
                <th className="avg-col-head">
                  <button className="th-sort-btn" onClick={() => cycleSort('avg_unit_price')}>
                    Avg Unit Price{sortIndicator('avg_unit_price')}
                  </button>
                </th>
              ) : null}
              {showAverageColumns ? <th className="avg-col-head">Avg Extended</th> : null}
              {visibleDealers.map((dealer) => (
                <Fragment key={dealer.invite_id}>
                  {showUnitPriceColumnEffective ? (
                    <th className={`${unitPriceStartClass} dealer-metric-header`.trim()}>
                      <button className="th-sort-btn" onClick={() => cycleSort('dealer_price', dealer.invite_id)}>
                        Unit Price{sortIndicator('dealer_price', dealer.invite_id)}
                      </button>
                    </th>
                  ) : null}
                  {showLeadTimeColumnEffective ? <th className={`${leadTimeStartClass} dealer-metric-header`.trim()}>Lead Time (Days)</th> : null}
                  {showDealerNotesColumnEffective ? <th className={`${notesStartClass} dealer-metric-header dealer-notes-header`.trim()}>Notes</th> : null}
                  <th className={`${extendedStartClass} dealer-metric-header`.trim()}>Extended</th>
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
              {isAwardedWorkspace && hasFilesColumn ? (
                <th className="approval-col-head">Files</th>
              ) : null}
              {isAwardedWorkspace ? effectiveRequiredApprovalColumns.map((column) => (
                <th key={`approval-col-${column.key}`} className="approval-col-head">{column.label}</th>
              )) : null}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              (() => {
                const awardedDealer = isAwardedWorkspace && visibleDealers.length === 1 ? visibleDealers[0] : null
                const awardedDealerCell = awardedDealer
                  ? (row.dealers || []).find((d) => d.invite_id === awardedDealer.invite_id)
                  : null
                const awardedChoice = awardedDealerCell ? effectiveChoice(row, awardedDealerCell) : null
                const winningSubProductName = awardedDealerCell?.selected_alt_product_name || awardedDealerCell?.alt_product_name
                const winningSubBrandName = awardedDealerCell?.selected_alt_brand_name || awardedDealerCell?.alt_brand_name
                const displayProductName = isAwardedWorkspace && awardedChoice === 'alt' && winningSubProductName
                  ? winningSubProductName
                  : row.product_name
                const displayBrandName = isAwardedWorkspace && awardedChoice === 'alt' && winningSubBrandName
                  ? winningSubBrandName
                  : row.manufacturer

                return (
              <tr
                key={row.spec_item_id}
                className={`${rowIncluded(row) ? '' : 'row-excluded'} ${row.active === false ? 'comparison-row-inactive' : ''}`.trim()}
              >
                {showUseColumn ? (
                  <td className="use-col-cell">
                    <div className="comparison-use-cell">
                      <button
                        type="button"
                        className={`btn comparison-include-btn ${rowIncluded(row) ? '' : 'is-excluded'}`.trim()}
                        onClick={() => toggleRowIncluded(row.spec_item_id)}
                        disabled={comparisonLocked}
                        aria-label={`${rowIncluded(row) ? 'Exclude' : 'Include'} ${row.sku || row.product_name || 'line item'}`}
                      >
                        {rowIncluded(row) ? '✓ In Totals' : 'Excluded'}
                      </button>
                    </div>
                  </td>
                ) : null}
                <td className="code-col-cell">
                  {(() => {
                    const rowRequirements = effectiveRequiredApprovalsBySpecItem[String(row.spec_item_id)] || []
                    const applicableRequirements = rowRequirements.filter((requirement) => requirement.applies)
                    const rowFullyApproved = applicableRequirements.length > 0 && applicableRequirements.every((requirement) => requirement.approved)
                    const codeStatusClass = rowFullyApproved ? 'code-tag-approved' : 'code-tag-pending'
                    return (
                      <div className="comparison-code-cell">
                        {!isAwardedWorkspace ? (
                          <button
                            type="button"
                            className={`comparison-active-dot-btn ${row.active === false ? 'is-inactive' : 'is-active'}`.trim()}
                            onClick={() => {
                              if (row.active === false) reactivateComparisonItem(row)
                              else deactivateComparisonItem(row)
                            }}
                            disabled={loading || comparisonLocked}
                            title={row.active === false ? 'Inactive (hidden from bidders) - click to show' : 'Active (visible to bidders) - click to hide'}
                            aria-label={row.active === false ? 'Inactive (hidden from bidders) - click to show' : 'Active (visible to bidders) - click to hide'}
                          />
                        ) : null}
                        <span className={isAwardedWorkspace ? `code-tag-status ${codeStatusClass}` : ''}>{row.sku || '—'}</span>
                      </div>
                    )
                  })()}
                </td>
                {showProductColumnEffective ? (
                  <td className="comparison-col-product" title={displayProductName || ''}>
                    <span className="comparison-awarded-cell-value">
                      <span>{displayProductName || '—'}</span>
                      {isAwardedWorkspace && awardedChoice === 'alt' && displayProductName ? (
                        <span className="winner-sub-pill" title="Approved Substitute">Sub</span>
                      ) : null}
                    </span>
                  </td>
                ) : null}
                {showBrandColumnEffective ? (
                  <td className="comparison-col-brand" title={displayBrandName || ''}>
                    <span className="comparison-awarded-cell-value">
                      <span>{displayBrandName || '—'}</span>
                      {isAwardedWorkspace && awardedChoice === 'alt' && displayBrandName ? (
                        <span className="winner-sub-pill" title="Approved Substitute">Sub</span>
                      ) : null}
                    </span>
                  </td>
                ) : null}
                <td>{row.quantity || '—'} {row.uom || ''}</td>
                {showAverageColumns ? <td className="num">{money(dynamicRowAverage(row))}</td> : null}
                {showAverageColumns ? <td className="num">{money(extendedAmount(dynamicRowAverage(row), row.quantity))}</td> : null}
                {visibleDealers.flatMap((dealer) => {
                  const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
                  const effectivePrice = effectiveUnitPrice(row, cell)
                  const bestUnitPrice = rowBestPrice(row)
                  const isBest = !isAwardedWorkspace && numberOrNull(effectivePrice) != null && numberOrNull(effectivePrice) === numberOrNull(bestUnitPrice)
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
                  const isSubPopoverOpen = activeSubPopoverKey === subPopoverKey
                  const isNotePopoverOpen = activeNotePopoverKey === notePopoverKey
                  const priceSourceControls = (
                    <span className={`price-source-slot ${(!isAwardedWorkspace && (canSelectQuotePerCell || choice === 'alt')) ? '' : 'is-empty'}`.trim()}>
                      {!isAwardedWorkspace && canSelectQuotePerCell ? (
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
                          <span
                            className="sub-popover-wrap"
                            onMouseEnter={() => {
                              if (choice === 'alt') setActiveSubPopoverKey(subPopoverKey)
                            }}
                            onMouseLeave={() => setActiveSubPopoverKey((prev) => (prev === subPopoverKey ? null : prev))}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className={`quote-toggle-btn ${choice === 'alt' ? 'active' : ''}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setCellPriceMode((prev) => ({ ...prev, [modeKey]: 'alt' }))
                                setActiveSubPopoverKey((prev) => (prev === subPopoverKey ? null : subPopoverKey))
                              }}
                              disabled={comparisonLocked}
                            >
                              Sub
                            </button>
                            {choice === 'alt' && isSubPopoverOpen ? (
                              <div className="sub-popover">
                                <div className="sub-popover-row">
                                  <strong>Sub Product:</strong>
                                  <span className="sub-popover-value">{cell?.alt_product_name || '—'}</span>
                                </div>
                                <div className="sub-popover-row">
                                  <strong>Sub Brand:</strong>
                                  <span className="sub-popover-value">{cell?.alt_brand_name || '—'}</span>
                                </div>
                              </div>
                            ) : null}
                          </span>
                        </span>
                      ) : null}
                      {!isAwardedWorkspace && !canSelectQuotePerCell && choice === 'alt' ? (
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
                          {isSubPopoverOpen ? (
                            <div className="sub-popover">
                              <div className="sub-popover-row">
                                <strong>Sub Product:</strong>
                                <span className="sub-popover-value">{cell?.alt_product_name || '—'}</span>
                              </div>
                              <div className="sub-popover-row">
                                <strong>Sub Brand:</strong>
                                <span className="sub-popover-value">{cell?.alt_brand_name || '—'}</span>
                              </div>
                            </div>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  )
                  const cells = [
                    showUnitPriceColumnEffective ? (
                      <td
                        key={`${row.spec_item_id}-${dealer.invite_id}-price`}
                        className={`${unitPriceStartClass} num`.trim()}
                      >
                        {money(effectivePrice)}
                      </td>
                    ) : null,
                    showLeadTimeColumnEffective ? (
                      <td key={`${row.spec_item_id}-${dealer.invite_id}-lead-time`} className={`${leadTimeStartClass} num`.trim()}>
                        {cell?.lead_time_days ?? '—'}
                      </td>
                    ) : null,
                    showDealerNotesColumnEffective ? (
                      <td key={`${row.spec_item_id}-${dealer.invite_id}-dealer-notes`} className={`${notesStartClass} dealer-notes-cell ${isNotePopoverOpen ? 'popover-open' : ''}`.trim()}>
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
                            {isNotePopoverOpen ? (
                              <div className="sub-popover dealer-note-popover">
                                {dealerNote}
                              </div>
                            ) : null}
                          </span>
                        ) : <span className="dealer-notes-empty">—</span>}
                      </td>
                    ) : null,
                    <td key={`${row.spec_item_id}-${dealer.invite_id}-extended`} className={`${extendedStartClass} num ${isBest ? 'best' : ''} ${isSubPopoverOpen ? 'popover-open' : ''}`.trim()}>
                      <div className="dealer-price-cell dealer-extended-price-cell">
                        {priceSourceControls}
                        <span>{money(extendedAmount(effectivePrice, row.quantity))}</span>
                      </div>
                    </td>,
                    ...(showDealerDeltaColumn
                      ? [(
                        <td
                          key={`${row.spec_item_id}-${dealer.invite_id}-delta`}
                          className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num ${deltaToneClass(betterDelta)}`.trim()}
                        >
                          {betterDelta}
                        </td>
                      )]
                      : []),
                    ...(showDealerNextDeltaColumn
                      ? [(
                        <td
                          key={`${row.spec_item_id}-${dealer.invite_id}-next-delta`}
                          className={`dealer-block-end num ${deltaToneClass(nextBestDelta)}`.trim()}
                        >
                          {nextBestDelta}
                        </td>
                      )]
                      : [])
                  ]
                  return cells.filter(Boolean)
                })}
                {isAwardedWorkspace ? (
                  [
                    ...(hasFilesColumn ? [(
                      <td key={`${row.spec_item_id}-files`} className="approval-cell-files">
                        {(() => {
                          const uploads = Array.isArray(effectiveLineItemUploadsBySpecItem[String(row.spec_item_id)])
                            ? effectiveLineItemUploadsBySpecItem[String(row.spec_item_id)]
                            : []
                          const count = uploads.length
                          if (typeof onOpenLineItemFiles === 'function') {
                            return (
                              <button
                                type="button"
                                className={`btn approval-files-btn ${count > 0 ? 'has-files' : 'no-files'}`.trim()}
                                onClick={() => onOpenLineItemFiles({
                                  specItemId: row.spec_item_id,
                                  codeTag: row.sku || row.spec_item_id,
                                  productName: displayProductName || row.product_name || '',
                                  brandName: displayBrandName || row.manufacturer || '',
                                  uploads
                                })}
                                disabled={loading}
                                title={count > 0 ? `View ${count} uploaded file${count === 1 ? '' : 's'}` : 'No uploaded files yet'}
                              >
                                <IconFile />
                                {count > 0 ? <span>{count}</span> : null}
                              </button>
                            )
                          }
                          return (
                            <span className={`approval-files-inline ${count > 0 ? 'has-files' : 'no-files'}`.trim()}>
                              <IconFile />
                              {count > 0 ? <span>{count}</span> : null}
                            </span>
                          )
                        })()}
                      </td>
                    )] : []),
                    ...(effectiveRequiredApprovalsBySpecItem[String(row.spec_item_id)] || []).map((requirement) => {
                    const requirementStatus = requirement.status || (requirement.approved ? 'approved' : 'pending')
                    const needsFixDates = Array.isArray(requirement.needs_fix_dates) ? requirement.needs_fix_dates : []
                    const latestNeedsFixDate = needsFixDates.length > 0 ? needsFixDates[needsFixDates.length - 1] : null

                    if (!requirement.applies) {
                      return (
                        <td key={`${row.spec_item_id}-${requirement.key}`} className="approval-cell-na">
                          N/A
                        </td>
                      )
                    }

                    if (requirementStatus === 'approved') {
                      return (
                        <td key={`${row.spec_item_id}-${requirement.key}`} className="approval-cell-approved">
                          <button
                            type="button"
                            className="approval-approved-btn"
                            onClick={async () => {
                              openUnapproveModal({
                                specItemId: row.spec_item_id,
                                requirementKey: requirement.key,
                                requirementLabel: requirement.label,
                                code: row.sku || row.spec_item_id,
                                needsFixDates,
                                actionType: 'unapproved'
                              })
                            }}
                            disabled={loading || (!onUnapproveRequirement && !loadedBidPackageId)}
                          >
                            <div>Approved</div>
                            {requirement.approved_at ? (
                              <div className="approval-approved-date">{new Date(requirement.approved_at).toLocaleDateString()}</div>
                            ) : null}
                            {needsFixDates.length > 0 ? (
                              <ApprovalTimestampTooltip
                                label={`(Fixed ${needsFixDates.length}x)`}
                                timestamps={needsFixDates}
                                showCount={false}
                                labelClassName="approval-fixed-note"
                              />
                            ) : null}
                          </button>
                        </td>
                      )
                    }

                    if (requirementStatus === 'needs_revision') {
                      return (
                        <td key={`${row.spec_item_id}-${requirement.key}`} className="approval-cell-needs-revision">
                          <div className="approval-needs-fix-wrap">
                            <ApprovalTimestampTooltip
                              label="Needs Fix"
                              timestamps={needsFixDates}
                            />
                            {latestNeedsFixDate ? (
                              <div className="approval-needs-fix-date">{new Date(latestNeedsFixDate).toLocaleDateString()}</div>
                            ) : null}
                            <div className="approval-cell-action-row">
                              <button
                                type="button"
                                className="btn approval-icon-btn approval-pending-btn"
                                title="Approve"
                                aria-label="Approve"
                                onClick={async () => {
                                  if (onApproveRequirement) {
                                    await onApproveRequirement({ specItemId: row.spec_item_id, requirementKey: requirement.key })
                                    return
                                  }
                                  if (!loadedBidPackageId) return
                                  const response = await approveSpecItemRequirement({
                                    bidPackageId: loadedBidPackageId,
                                    specItemId: row.spec_item_id,
                                    requirementKey: requirement.key
                                  })
                                  updateFullscreenRequirement({
                                    specItemId: row.spec_item_id,
                                    requirementKey: requirement.key,
                                    updates: {
                                      status: response?.status || 'approved',
                                      approved: true,
                                      approved_at: response?.approved_at || new Date().toISOString(),
                                      approved_by: response?.approved_by || 'Designer',
                                      needs_fix_dates: Array.isArray(response?.needs_fix_dates) ? response.needs_fix_dates : needsFixDates
                                    }
                                  })
                                }}
                                disabled={loading || (!onApproveRequirement && !loadedBidPackageId)}
                              >
                                <IconCheck />
                              </button>
                              <button
                                type="button"
                                className="btn approval-icon-btn approval-needs-fix-btn"
                                title="Needs Fix Again"
                                aria-label="Needs Fix Again"
                                onClick={async () => {
                                  if (onNeedsFixRequirement) {
                                    await onNeedsFixRequirement({ specItemId: row.spec_item_id, requirementKey: requirement.key })
                                    return
                                  }
                                  if (!loadedBidPackageId) return
                                  const response = await markSpecItemRequirementNeedsFix({
                                    bidPackageId: loadedBidPackageId,
                                    specItemId: row.spec_item_id,
                                    requirementKey: requirement.key
                                  })
                                  updateFullscreenRequirement({
                                    specItemId: row.spec_item_id,
                                    requirementKey: requirement.key,
                                    updates: {
                                      status: response?.status || 'needs_revision',
                                      approved: false,
                                      approved_at: null,
                                      approved_by: null,
                                      needs_fix_dates: Array.isArray(response?.needs_fix_dates) ? response.needs_fix_dates : needsFixDates
                                    }
                                  })
                                }}
                                disabled={loading || (!onNeedsFixRequirement && !loadedBidPackageId)}
                              >
                                <IconRefresh />
                              </button>
                              <button
                                type="button"
                                className="btn approval-icon-btn approval-reset-btn"
                                title="Reset to Pending"
                                aria-label="Reset to Pending"
                                onClick={() => {
                                  openUnapproveModal({
                                    specItemId: row.spec_item_id,
                                    requirementKey: requirement.key,
                                    requirementLabel: requirement.label,
                                    code: row.sku || row.spec_item_id,
                                    needsFixDates,
                                    actionType: 'reset'
                                  })
                                }}
                                disabled={loading || (!onUnapproveRequirement && !loadedBidPackageId)}
                              >
                                <IconX />
                              </button>
                            </div>
                          </div>
                        </td>
                      )
                    }

                    return (
                      <td key={`${row.spec_item_id}-${requirement.key}`} className="approval-cell-pending">
                        <div className="approval-cell-action-row">
                          <button
                            type="button"
                            className="btn approval-icon-btn approval-pending-btn"
                            title="Approve"
                            aria-label="Approve"
                            onClick={async () => {
                              if (onApproveRequirement) {
                                await onApproveRequirement({ specItemId: row.spec_item_id, requirementKey: requirement.key })
                                return
                              }
                              if (!loadedBidPackageId) return
                              const response = await approveSpecItemRequirement({
                                bidPackageId: loadedBidPackageId,
                                specItemId: row.spec_item_id,
                                requirementKey: requirement.key
                              })
                              updateFullscreenRequirement({
                                specItemId: row.spec_item_id,
                                requirementKey: requirement.key,
                                updates: {
                                  status: response?.status || 'approved',
                                  approved: true,
                                  approved_at: response?.approved_at || new Date().toISOString(),
                                  approved_by: response?.approved_by || 'Designer',
                                  needs_fix_dates: Array.isArray(response?.needs_fix_dates) ? response.needs_fix_dates : needsFixDates
                                }
                              })
                            }}
                            disabled={loading || (!onApproveRequirement && !loadedBidPackageId)}
                          >
                            <IconCheck />
                          </button>
                          <button
                            type="button"
                            className="btn approval-icon-btn approval-needs-fix-btn"
                            title="Needs Fix"
                            aria-label="Needs Fix"
                            onClick={async () => {
                              if (onNeedsFixRequirement) {
                                await onNeedsFixRequirement({ specItemId: row.spec_item_id, requirementKey: requirement.key })
                                return
                              }
                              if (!loadedBidPackageId) return
                              const response = await markSpecItemRequirementNeedsFix({
                                bidPackageId: loadedBidPackageId,
                                specItemId: row.spec_item_id,
                                requirementKey: requirement.key
                              })
                              updateFullscreenRequirement({
                                specItemId: row.spec_item_id,
                                requirementKey: requirement.key,
                                updates: {
                                  status: response?.status || 'needs_revision',
                                  approved: false,
                                  approved_at: null,
                                  approved_by: null,
                                  needs_fix_dates: Array.isArray(response?.needs_fix_dates) ? response.needs_fix_dates : [new Date().toISOString()]
                                }
                              })
                            }}
                            disabled={loading || (!onNeedsFixRequirement && !loadedBidPackageId)}
                          >
                            <IconRefresh />
                          </button>
                        </div>
                      </td>
                    )
                  })
                  ]
                ) : null}
              </tr>
                )
              })()
            ))}
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={baseColumnsBeforeDealers + (visibleDealers.length * dealerColumnsPerResponder) + awardedColumnsCount} className="text-muted">No comparison rows loaded yet.</td>
              </tr>
            ) : null}
          </tbody>
          {sortedRows.length > 0 && visibleDealers.length > 0 ? (
            <tfoot>
              <tr className="total-row summary-row summary-subtotal-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Subtotal</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgSubtotal)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const summary = dealerTotalsById[dealer.invite_id]
                  const subtotal = summary?.subtotal || 0
                  const isBest = !isAwardedWorkspace && subtotal === bestDealerSubtotal
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleSubtotals, subtotal)
                    : delta(subtotal, avgSubtotal)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleSubtotals, subtotal)
                    : null
                  return (
                    <Fragment key={`subtotal-${dealer.invite_id}`}>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showDealerNotesColumnEffective ? <td className={notesStartClass}><strong>—</strong></td> : null}
                      <td className={`${extendedStartClass} num ${isBest ? 'best' : ''}`.trim()}><strong>{money(subtotal)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-block-end num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('subtotal')}
              </tr>
              {activeGeneralFields.includes('delivery_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Shipping</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgDelivery)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.delivery || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerDelivery
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleDeliveries, value)
                    : delta(value, avgDelivery)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleDeliveries, value)
                    : null
                  return (
                    <Fragment key={`delivery-${dealer.invite_id}`}>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showDealerNotesColumnEffective ? <td className={notesStartClass}><strong>—</strong></td> : null}
                      <td className={`${extendedStartClass} num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-block-end num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('shipping')}
              </tr>
              ) : null}
              {activeGeneralFields.includes('install_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Install</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgInstall)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.install || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerInstall
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleInstalls, value)
                    : delta(value, avgInstall)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleInstalls, value)
                    : null
                  return (
                    <Fragment key={`install-${dealer.invite_id}`}>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showDealerNotesColumnEffective ? <td className={notesStartClass}><strong>—</strong></td> : null}
                      <td className={`${extendedStartClass} num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-block-end num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('install')}
              </tr>
              ) : null}
              {activeGeneralFields.includes('escalation_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Escalation</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgEscalation)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.escalation || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerEscalation
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleEscalations, value)
                    : delta(value, avgEscalation)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleEscalations, value)
                    : null
                  return (
                    <Fragment key={`escalation-${dealer.invite_id}`}>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showDealerNotesColumnEffective ? <td className={notesStartClass}><strong>—</strong></td> : null}
                      <td className={`${extendedStartClass} num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-block-end num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('escalation')}
              </tr>
              ) : null}
              {activeGeneralFields.includes('contingency_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Contingency</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgContingency)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.contingency || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerContingency
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleContingencies, value)
                    : delta(value, avgContingency)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleContingencies, value)
                    : null
                  return (
                    <Fragment key={`contingency-${dealer.invite_id}`}>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showDealerNotesColumnEffective ? <td className={notesStartClass}><strong>—</strong></td> : null}
                      <td className={`${extendedStartClass} num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-block-end num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('contingency')}
              </tr>
              ) : null}
              {activeGeneralFields.includes('sales_tax_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Sales Tax</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgSalesTax)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.salesTax || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerSalesTax
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleSalesTaxes, value)
                    : delta(value, avgSalesTax)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleSalesTaxes, value)
                    : null
                  return (
                    <Fragment key={`sales-tax-${dealer.invite_id}`}>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showDealerNotesColumnEffective ? <td className={notesStartClass}><strong>—</strong></td> : null}
                      <td className={`${extendedStartClass} num ${isBest ? 'best' : ''}`.trim()}><strong>{money(value)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-block-end num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('sales-tax')}
              </tr>
              ) : null}
              <tr className="total-row summary-row summary-grand-total-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Grand Total</strong></td>
                {showAverageColumns ? <td className="num"><strong>—</strong></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgTotal)}</strong></td> : null}
                {visibleDealers.map((dealer) => {
                  const total = dealerTotalsById[dealer.invite_id]?.total || 0
                  const isBest = !isAwardedWorkspace && total === bestDealerTotal
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleTotals, total)
                    : delta(total, avgTotal)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleTotals, total)
                    : null
                  return (
                    <Fragment key={`total-${dealer.invite_id}`}>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} num`.trim()}><strong>—</strong></td> : null}
                      {showDealerNotesColumnEffective ? <td className={notesStartClass}><strong>—</strong></td> : null}
                      <td className={`${extendedStartClass} num ${isBest ? 'best' : ''}`.trim()}><strong>{money(total)}</strong></td>
                      {showDealerDeltaColumn ? <td className={`${showDealerNextDeltaColumn ? '' : 'dealer-block-end'} num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-block-end num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('grand-total')}
              </tr>
            </tfoot>
          ) : null}
        </table>
        </div>
        </div>

      </SectionCard>

      {awardModal ? (
        <div className="modal-backdrop" onClick={closeAwardModal}>
          <div className="modal-card award-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{awardModal.mode === 'clear' ? 'Confirm Remove Award' : 'Confirm Award'}</h3>
            <p className="award-modal-copy">
              {awardModal.mode === 'clear'
                ? `Removing this award will return the package to bidding mode. You can lock in ${companyName(awardModal.dealer.dealer_name)} as the selected vendor again later if needed.`
                : `Awarding this bid will lock in ${companyName(awardModal.dealer.dealer_name)} as the selected vendor and switch to approval tracking mode. You can undo this later if needed.`}
            </p>
            <div className="action-row">
              <button type="button" className="btn" onClick={closeAwardModal} disabled={awardSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitAward} disabled={awardSaving}>
                {awardSaving
                  ? 'Saving...'
                  : awardModal.mode === 'change'
                    ? 'Award Bid'
                    : awardModal.mode === 'clear'
                      ? 'Remove Award'
                      : 'Award Bid'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unapproveModal ? (
        <div className="modal-backdrop" onClick={closeUnapproveModal}>
          <div className="modal-card award-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{unapproveModal.actionType === 'reset' ? 'Confirm Reset' : 'Confirm Unapprove'}</h3>
            <p className="award-modal-copy">
              {unapproveModal.actionType === 'reset'
                ? `Reset ${unapproveModal?.code || 'this item'}${unapproveModal?.requirementLabel ? ` \u2013 ${unapproveModal.requirementLabel}` : ''} to pending? This clears the current status. Past approvals and fixes will be preserved in the audit export only.`
                : `Unapprove ${unapproveModal?.code || 'this item'}${unapproveModal?.requirementLabel ? ` \u2013 ${unapproveModal.requirementLabel}` : ''}? This clears the current status. Past approvals and fixes will be preserved in the audit export only.`}
            </p>
            <div className="action-row">
              <button type="button" className="btn" onClick={closeUnapproveModal} disabled={unapproveSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitUnapprove} disabled={unapproveSaving}>
                {unapproveSaving ? 'Saving...' : (unapproveModal.actionType === 'reset' ? 'Reset' : 'Unapprove')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
