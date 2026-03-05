import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import ComparisonPage from './ComparisonPage'
import lockIcon from '../assets/bidders-icons/lock.svg'
import linkIcon from '../assets/bidders-icons/link.svg'
import emailIcon from '../assets/bidders-icons/email.svg'
import reopenIcon from '../assets/bidders-icons/reopen.svg'
import plusBidderIcon from '../assets/bidders-icons/plus-bidder.svg'
import {
  API_BASE_URL,
  approveSpecItemRequirement,
  clearCurrentAwardApprovals,
  clearBidPackageAward,
  createInvite,
  createBidPackagePostAwardUpload,
  bidPackagePostAwardUploadsBundleUrl,
  deleteBidPackagePostAwardUpload,
  updateBidPackagePostAwardUpload,
  deactivateSpecItem,
  deleteInvite,
  disableInvite,
  enableInvite,
  markSpecItemRequirementNeedsFix,
  reactivateSpecItem,
  unapproveSpecItemRequirement,
  deleteBidPackage,
  fetchBidPackageDashboard,
  fetchBidPackages,
  fetchInviteHistory,
  recloseInviteBid,
  reopenInviteBid,
  updateBidPackage,
  updateInvitePassword
} from '../lib/api'
import vendors from '../data/vendors.json'

const GENERAL_PRICING_FIELDS = [
  { key: 'delivery_amount', label: 'Shipping' },
  { key: 'install_amount', label: 'Install' },
  { key: 'escalation_amount', label: 'Escalation' },
  { key: 'contingency_amount', label: 'Contingency' },
  { key: 'sales_tax_amount', label: 'Sales Tax' }
]
const EDIT_GENERAL_FIELD_ORDER = [
  'sales_tax_amount',
  'delivery_amount',
  'install_amount',
  'escalation_amount',
  'contingency_amount'
]
const DASHBOARD_SELECTED_PACKAGE_KEY = 'bid_collections.dashboard.selected_bid_package_id'
const DASHBOARD_LOADED_PACKAGE_KEY = 'bid_collections.dashboard.loaded_bid_package_id'
const DASHBOARD_LINE_ITEMS_VIEW_KEY_PREFIX = 'bid_collections.dashboard.line_items_view.'
const DASHBOARD_SKIP_TO_APPROVALS_KEY_PREFIX = 'bid_collections.dashboard.skip_to_approvals.'

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function awardStatusMeta(selectionStatus) {
  if (selectionStatus === 'awarded') return { label: 'Awarded', toneClass: 'state-good' }
  if (selectionStatus === 'not_selected') return { label: 'Lost', toneClass: 'state-bad' }
  return null
}

function statusMeta(status) {
  if (status === 'submitted') return { label: 'Submitted', toneClass: 'state-good' }
  if (status === 'in_progress') return { label: 'In Progress', toneClass: 'state-warn' }
  if (status === 'not_started') return { label: 'No Activity', toneClass: 'state-bad' }
  return { label: 'No Activity', toneClass: 'state-bad' }
}

function accessMeta(accessState) {
  if (accessState === 'disabled') return { label: 'Disabled', toneClass: 'state-bad' }
  return { label: 'Enabled', toneClass: 'state-good' }
}

function formatTimestamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatShortDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function formatCompactDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const day = date.toLocaleDateString('en-CA')
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${day} ${time}`
}

function formatHistoryDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function compactHistoryMoney(value) {
  const n = numberOrNull(value)
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function normalizeFileToken(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildDownloadFileName({ codeTag, fileName, requirementLabel, includeRequirementTag, includeCodeTag }) {
  const base = String(fileName || 'download')
  const normalizedCode = includeCodeTag ? normalizeFileToken(codeTag) : ''
  const normalizedRequirement = includeRequirementTag ? normalizeFileToken(requirementLabel) : ''
  const dotIndex = base.lastIndexOf('.')
  const name = dotIndex > 0 ? base.slice(0, dotIndex) : base
  const ext = dotIndex > 0 ? base.slice(dotIndex) : ''
  const parts = [normalizedCode, normalizedRequirement, name].filter(Boolean)
  if (parts.length === 0) return base
  return `${parts.join('_')}${ext}`
}

function fileNameWithRequirementTag(fileName, requirementLabel, codeTag, includeRequirementTag, includeCodeTag) {
  return buildDownloadFileName({
    codeTag,
    fileName,
    requirementLabel,
    includeRequirementTag,
    includeCodeTag
  })
}

function vendorDisplayName(value) {
  if (!value) return '—'
  const parts = String(value).split(' - ')
  return parts[0]?.trim() || String(value)
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

function compactMoney(value) {
  const n = numberOrNull(value)
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${Number((n / 1_000_000).toFixed(1))}MM`
  if (abs >= 1_000) return `$${Number((n / 1_000).toFixed(1))}K`
  return `$${n.toFixed(2)}`
}

function totalLabel(row, { postAwardActive = false } = {}) {
  if (postAwardActive) {
    const awardedSnapshot = numberOrNull(row?.awarded_amount_snapshot)
    if (row?.selection_status === 'awarded' && awardedSnapshot != null) return money(awardedSnapshot)
    return money(row?.latest_total_amount)
  }

  const minTotal = numberOrNull(row?.min_total_amount)
  const maxTotal = numberOrNull(row?.max_total_amount)
  if (minTotal != null && maxTotal != null) {
    const minLabel = compactMoney(minTotal)
    const maxLabel = compactMoney(maxTotal)
    if (Math.abs(maxTotal - minTotal) < 0.005 || minLabel === maxLabel) return minLabel
    return `${minLabel}-${maxLabel}`
  }

  return compactMoney(row?.latest_total_amount)
}

function loadStoredValue(key) {
  try {
    return window.localStorage.getItem(key) || ''
  } catch (_error) {
    return ''
  }
}

function storeValue(key, value) {
  try {
    if (value) window.localStorage.setItem(key, String(value))
    else window.localStorage.removeItem(key)
  } catch (_error) {
    // no-op when localStorage is unavailable
  }
}

function lineItemsViewStorageKey(bidPackageId) {
  return `${DASHBOARD_LINE_ITEMS_VIEW_KEY_PREFIX}${bidPackageId}`
}

function approvalsOnlyStorageKey(bidPackageId) {
  return `${DASHBOARD_SKIP_TO_APPROVALS_KEY_PREFIX}${bidPackageId}`
}

function loadLineItemsViewPreferences(bidPackageId) {
  const defaults = { showProductColumn: true, showBrandColumn: true, showQtyColumn: true }
  if (!bidPackageId) return defaults
  try {
    const raw = window.localStorage.getItem(lineItemsViewStorageKey(bidPackageId))
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      showProductColumn: typeof parsed?.showProductColumn === 'boolean' ? parsed.showProductColumn : defaults.showProductColumn,
      showBrandColumn: typeof parsed?.showBrandColumn === 'boolean' ? parsed.showBrandColumn : defaults.showBrandColumn,
      showQtyColumn: typeof parsed?.showQtyColumn === 'boolean' ? parsed.showQtyColumn : defaults.showQtyColumn
    }
  } catch (_error) {
    return defaults
  }
}

function storeLineItemsViewPreferences(bidPackageId, prefs) {
  if (!bidPackageId) return
  try {
    window.localStorage.setItem(lineItemsViewStorageKey(bidPackageId), JSON.stringify({
      showProductColumn: Boolean(prefs?.showProductColumn),
      showBrandColumn: Boolean(prefs?.showBrandColumn),
      showQtyColumn: Boolean(prefs?.showQtyColumn)
    }))
  } catch (_error) {
    // no-op when localStorage is unavailable
  }
}

export default function PackageDashboardPage() {
  const navigate = useNavigate()
  const { bidPackageId: routeBidPackageId = '' } = useParams()
  const normalizedRouteBidPackageId = routeBidPackageId ? String(routeBidPackageId) : ''
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState(() => (
    normalizedRouteBidPackageId || loadStoredValue(DASHBOARD_SELECTED_PACKAGE_KEY)
  ))
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [restoredLoadedBidPackageId, setRestoredLoadedBidPackageId] = useState(() => loadStoredValue(DASHBOARD_LOADED_PACKAGE_KEY))
  const [rows, setRows] = useState([])
  const [specItems, setSpecItems] = useState([])
  const [requiredApprovalColumns, setRequiredApprovalColumns] = useState([])
  const [currentAwardedBidId, setCurrentAwardedBidId] = useState(null)
  const [generalUploads, setGeneralUploads] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [copiedInviteId, setCopiedInviteId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyData, setHistoryData] = useState(null)
  const [historyView, setHistoryView] = useState(null)
  const [historyInviteId, setHistoryInviteId] = useState(null)
  const [activeLineItemFilesModal, setActiveLineItemFilesModal] = useState(null)
  const [lineItemUploadFile, setLineItemUploadFile] = useState(null)
  const [lineItemUploadRequirementKey, setLineItemUploadRequirementKey] = useState('')
  const [lineItemFilterRequirementKey, setLineItemFilterRequirementKey] = useState('all')
  const [lineItemDownloadIncludeTag, setLineItemDownloadIncludeTag] = useState(false)
  const [lineItemDownloadIncludeCode, setLineItemDownloadIncludeCode] = useState(false)
  const [lineItemBulkDownloading, setLineItemBulkDownloading] = useState(false)
  const [lineItemSavingTagUploadId, setLineItemSavingTagUploadId] = useState(null)
  const [clearAwardModal, setClearAwardModal] = useState(null)
  const [editingPasswordInviteId, setEditingPasswordInviteId] = useState(null)
  const [passwordEditDraft, setPasswordEditDraft] = useState('')
  const [savingPasswordInviteId, setSavingPasswordInviteId] = useState(null)
  const [loadedPackageSettings, setLoadedPackageSettings] = useState(null)
  const [packageNameDraft, setPackageNameDraft] = useState('')
  const [visibilityDraft, setVisibilityDraft] = useState('private')
  const [instructionsDraft, setInstructionsDraft] = useState('')
  const [activeGeneralFieldsDraft, setActiveGeneralFieldsDraft] = useState(GENERAL_PRICING_FIELDS.map((field) => field.key))
  const [editingBidPackage, setEditingBidPackage] = useState(false)
  const [showProductColumn, setShowProductColumn] = useState(true)
  const [showBrandColumn, setShowBrandColumn] = useState(true)
  const [showQtyColumn, setShowQtyColumn] = useState(true)
  const [lineItemsSort, setLineItemsSort] = useState('code_tag')
  const [lineItemsPendingSnapshot, setLineItemsPendingSnapshot] = useState({})
  const [lineItemsPage, setLineItemsPage] = useState(1)
  const [lineItemsPerPage, setLineItemsPerPage] = useState(50)
  const [comparisonVisibleInviteIds, setComparisonVisibleInviteIds] = useState([])
  const [biddersSort, setBiddersSort] = useState('created')
  const [showAllAwardedBidders, setShowAllAwardedBidders] = useState(false)
  const [approvalsOnlyMode, setApprovalsOnlyMode] = useState(false)

  const [dealerName, setDealerName] = useState('')
  const [dealerEmail, setDealerEmail] = useState('')
  const [selectedVendorKey, setSelectedVendorKey] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [showAddBidderForm, setShowAddBidderForm] = useState(false)
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false)

  const loadBidPackages = async (preserveSelectedId = true) => {
    setLoadingPackages(true)
    try {
      const data = await fetchBidPackages()
      const list = data.bid_packages || []
      setBidPackages(list)

      if (list.length === 0) {
        setSelectedBidPackageId('')
        setLoadedBidPackageId('')
        setRestoredLoadedBidPackageId('')
        setRows([])
        setSpecItems([])
        storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, '')
        storeValue(DASHBOARD_LOADED_PACKAGE_KEY, '')
        return
      }

      const preferredId = normalizedRouteBidPackageId || selectedBidPackageId || loadStoredValue(DASHBOARD_SELECTED_PACKAGE_KEY)
      const routePackageExists = normalizedRouteBidPackageId
        ? list.some((item) => String(item.id) === String(normalizedRouteBidPackageId))
        : false

      if (preserveSelectedId) {
        const hasSelected = preferredId && list.some((item) => String(item.id) === String(preferredId))
        if (hasSelected) {
          if (String(selectedBidPackageId) !== String(preferredId)) {
            setSelectedBidPackageId(String(preferredId))
          }
          return
        }
      }

      if (normalizedRouteBidPackageId && !routePackageExists) {
        setStatusMessage('Bid package not found.')
        navigate('/package', { replace: true })
        return
      }

      const fallbackId = String(list[0].id)
      setSelectedBidPackageId(fallbackId)
      storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, fallbackId)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoadingPackages(false)
    }
  }

  useEffect(() => {
    loadBidPackages(false)
  }, [])

  useEffect(() => {
    if (!normalizedRouteBidPackageId) return
    if (String(selectedBidPackageId) !== normalizedRouteBidPackageId) {
      setSelectedBidPackageId(normalizedRouteBidPackageId)
    }
    if (loading) return
    if (String(loadedBidPackageId) === normalizedRouteBidPackageId) return
    loadDashboard({ bidPackageId: normalizedRouteBidPackageId })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedRouteBidPackageId, loadedBidPackageId, selectedBidPackageId, loading])

  const loadedPackageLabel = useMemo(() => {
    if (!loadedBidPackageId) return ''
    const match = bidPackages.find((item) => String(item.id) === String(loadedBidPackageId))
    if (!match) return `Bid Package ID: ${loadedBidPackageId}`
    const projectName = match.project_name || 'Unknown Project'
    const projectId = match.project_id ?? '—'
    return `${match.name} in ${projectName} (Bid Package ID: ${match.id}, Project ID: ${projectId})`
  }, [bidPackages, loadedBidPackageId])
  const loadedPackageRecord = useMemo(
    () => bidPackages.find((item) => String(item.id) === String(loadedBidPackageId)) || null,
    [bidPackages, loadedBidPackageId]
  )
  const packageHeaderTitle = useMemo(() => {
    const packageName = loadedPackageRecord?.name || loadedPackageSettings?.name || ''
    if (packageName) return packageName
    return loadedPackageLabel || 'Bid Package'
  }, [loadedPackageLabel, loadedPackageRecord, loadedPackageSettings])

  const loadDashboard = async ({ closeEdit = true, bidPackageId = '' } = {}) => {
    const targetBidPackageId = String(bidPackageId || selectedBidPackageId || '')
    if (!targetBidPackageId) return

    setLoading(true)
    setStatusMessage('Loading bid package...')
    try {
      const data = await fetchBidPackageDashboard(targetBidPackageId)
      const viewPrefs = loadLineItemsViewPreferences(targetBidPackageId)
      const invites = data.invites || []
      const activeSpecItems = data.spec_items || []
      const bidPackage = data.bid_package || null
      setRows(invites)
      setSpecItems(activeSpecItems)
      setLineItemsPage(1)
      setRequiredApprovalColumns(data.required_approval_columns || [])
      setCurrentAwardedBidId(data.current_awarded_bid_id ?? null)
      setGeneralUploads(data.general_uploads || [])
      setLoadedPackageSettings(bidPackage)
      setPackageNameDraft(bidPackage?.name || '')
      setVisibilityDraft(bidPackage?.visibility || 'private')
      setInstructionsDraft(bidPackage?.instructions || '')
      setActiveGeneralFieldsDraft(bidPackage?.active_general_fields || GENERAL_PRICING_FIELDS.map((field) => field.key))
      setShowProductColumn(viewPrefs.showProductColumn)
      setShowBrandColumn(viewPrefs.showBrandColumn)
      setShowQtyColumn(viewPrefs.showQtyColumn)
      if (closeEdit) setEditingBidPackage(false)
      setSelectedBidPackageId(targetBidPackageId)
      setLoadedBidPackageId(targetBidPackageId)
      storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, targetBidPackageId)
      storeValue(DASHBOARD_LOADED_PACKAGE_KEY, targetBidPackageId)
      setRestoredLoadedBidPackageId(targetBidPackageId)
      setShowAllAwardedBidders(false)
      setHistoryView(null)
      setHistoryInviteId(null)
      const isApprovalsOnlyStored = loadStoredValue(approvalsOnlyStorageKey(targetBidPackageId)) === '1'
      setApprovalsOnlyMode(!bidPackage?.awarded_bid_id && isApprovalsOnlyStored)
      setStatusMessage('')
    } catch (error) {
      setStatusMessage(error.message)
      setRows([])
      setSpecItems([])
      setRequiredApprovalColumns([])
      setCurrentAwardedBidId(null)
      setGeneralUploads([])
    } finally {
      setLoading(false)
    }
  }

  const addInvite = async () => {
    const trimmedName = dealerName.trim()
    const trimmedEmail = dealerEmail.trim()
    const fallbackName = trimmedEmail ? trimmedEmail.split('@')[0] : ''
    const resolvedDealerName = trimmedName || fallbackName
    if (!loadedBidPackageId || !resolvedDealerName || !invitePassword) return

    setLoading(true)
    setStatusMessage('Creating invite...')
    try {
      if (loadedBidPackageId) {
        storeValue(approvalsOnlyStorageKey(loadedBidPackageId), '')
      }
      setApprovalsOnlyMode(false)
      const created = await createInvite({
        bidPackageId: loadedBidPackageId,
        dealerName: resolvedDealerName,
        dealerEmail: trimmedEmail,
        password: invitePassword
      })
      setSelectedVendorKey('')
      setDealerName('')
      setDealerEmail('')
      setInvitePassword('')
      setShowAddBidderForm(false)
      setStatusMessage('Invite created. Reloading dashboard...')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const vendorOptions = vendors.map((vendor, index) => {
    const company = vendor['Company Name'] || 'Vendor'
    const contact = vendor['Contact Name'] || 'Contact'
    const email = vendor['Email Address'] || ''
    const key = `${company}|${contact}|${email}|${index}`
    return {
      key,
      dealerName: `${company} - ${contact}`,
      dealerEmail: email,
      label: `${company} - ${contact}${email ? ` (${email})` : ''}`
    }
  })

  const onVendorChange = (value) => {
    setSelectedVendorKey(value)
    const match = vendorOptions.find((option) => option.key === value)
    if (!match) {
      setDealerName('')
      setDealerEmail('')
      return
    }

    setDealerName(match.dealerName)
    setDealerEmail(match.dealerEmail)
  }

  const copyInviteLink = async (row) => {
    const absoluteUrl = `${window.location.origin}${row.invite_url}`
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      setCopiedInviteId(row.invite_id)
      setStatusMessage('Invite link copied.')
      setTimeout(() => setCopiedInviteId(null), 1200)
    } catch (_error) {
      setStatusMessage('Unable to copy link in this browser.')
    }
  }

  const copyPublicUrl = async () => {
    const relativeUrl = loadedPackageSettings?.public_url
    if (!relativeUrl) return
    const absoluteUrl = `${window.location.origin}${relativeUrl}`
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      setCopiedPublicUrl(true)
      setTimeout(() => setCopiedPublicUrl(false), 1200)
      setStatusMessage('Public URL copied.')
    } catch (_error) {
      setStatusMessage('Unable to copy URL in this browser.')
    }
  }

  const emailInvite = (row) => {
    const to = row.dealer_email || ''
    const subject = `Bid Invitation: ${loadedPackageLabel || 'Bid Package'}`
    const absoluteUrl = `${window.location.origin}${row.invite_url}`
    const knownPassword = row.invite_password || ''
    if (!knownPassword) {
      setStatusMessage('No password found for this invite. Use the password edit icon first.')
      return
    }
    const passwordLine = `Password: ${knownPassword}`
    const body = [
      `Hi ${row.dealer_name || 'there'},`,
      '',
      'You are invited to submit pricing for this bid package.',
      '',
      `Bid Link: ${absoluteUrl}`,
      passwordLine,
      '',
      'Please use the link above to unlock and submit your bid.',
      '',
      'Thank you.'
    ].join('\n')

    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
  }

  const editInvitePassword = async (row, nextPassword) => {
    if (!loadedBidPackageId) return
    const inviteId = row.invite_id
    const newPassword = String(nextPassword ?? '').trim()
    if (!newPassword) {
      setStatusMessage('Password cannot be blank.')
      return
    }

    setLoading(true)
    setSavingPasswordInviteId(inviteId)
    setStatusMessage('Updating password...')
    try {
      await updateInvitePassword({
        bidPackageId: loadedBidPackageId,
        inviteId,
        password: newPassword
      })
      setStatusMessage('Password updated.')
      setRows((prev) =>
        prev.map((invite) => (
          invite.invite_id === inviteId ? { ...invite, invite_password: newPassword } : invite
        ))
      )
      setEditingPasswordInviteId((prev) => (prev === inviteId ? null : prev))
      setPasswordEditDraft('')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
      setSavingPasswordInviteId(null)
    }
  }

  const openHistory = async (inviteId) => {
    if (!loadedBidPackageId) return
    if (historyOpen && String(historyInviteId) === String(inviteId)) {
      setHistoryOpen(false)
      return
    }

    setHistoryInviteId(inviteId)
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryData(null)
    try {
      const data = await fetchInviteHistory({ bidPackageId: loadedBidPackageId, inviteId })
      setHistoryData(data)
    } catch (error) {
      setStatusMessage(error.message)
      setHistoryOpen(false)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (!historyOpen) return

    const handlePointerDown = (event) => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest('.bidder-history-popover') || event.target.closest('.bidder-version-trigger')) return
      setHistoryOpen(false)
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') setHistoryOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [historyOpen])

  const enterHistoryView = (version) => {
    const submittedAt = version?.submitted_at ? new Date(version.submitted_at) : null
    const isValidDate = submittedAt && !Number.isNaN(submittedAt.getTime())
    setHistoryView({
      bidderId: Number(historyInviteId) || 0,
      version: Number(version?.version_number) || 0,
      dealerName: String(historyData?.dealer_name || 'Unknown Vendor'),
      date: isValidDate ? submittedAt.toLocaleDateString() : '—',
      time: isValidDate ? submittedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'
    })
    setHistoryOpen(false)
  }

  const reopenBid = async (inviteId) => {
    if (!loadedBidPackageId) return

    setLoading(true)
    setStatusMessage('Reopening bid...')
    try {
      await reopenInviteBid({ bidPackageId: loadedBidPackageId, inviteId, reason: '' })
      setStatusMessage('Bid reopened. Bidder can edit and resubmit.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const recloseBid = async (row) => {
    if (!loadedBidPackageId) return
    const confirmed = window.confirm(
      `Reclose ${row.dealer_name} to submitted version v${row.current_version}?\n\nThis will lock invite access and keep their current submitted version in comparison.`
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Reclosing bid to submitted version...')
    try {
      await recloseInviteBid({ bidPackageId: loadedBidPackageId, inviteId: row.invite_id })
      setStatusMessage(`Bid reclosed at v${row.current_version}. Invite locked.`)
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const removeBidPackage = async () => {
    if (!selectedBidPackageId) return

    const selectedPackage = bidPackages.find((pkg) => String(pkg.id) === String(selectedBidPackageId))
    const label = selectedPackage
      ? `${selectedPackage.name} in ${selectedPackage.project_name || 'Unknown Project'} (Bid Package ID: ${selectedPackage.id}, Project ID: ${selectedPackage.project_id ?? '—'})`
      : `Bid Package ID: ${selectedBidPackageId}`
    const confirmed = window.confirm(`Delete bid package ${label}?\n\nThis permanently removes its invites, bids, and line items.`)
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting bid package...')
    try {
      await deleteBidPackage(selectedBidPackageId)
      setStatusMessage('Bid package deleted.')
      setLoadedBidPackageId((prev) => (String(prev) === String(selectedBidPackageId) ? '' : prev))
      if (String(loadedBidPackageId) === String(selectedBidPackageId)) {
        setRows([])
        setSpecItems([])
      }
      await loadBidPackages(false)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const saveBidPackageSettings = async () => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Saving bid package settings...')
    try {
      await updateBidPackage({
        bidPackageId: loadedBidPackageId,
        name: packageNameDraft.trim(),
        visibility: visibilityDraft,
        activeGeneralFields: activeGeneralFieldsDraft,
        instructions: instructionsDraft
      })
      setStatusMessage('Bid package settings saved.')
      await loadBidPackages(false)
      await loadDashboard()
      setEditingBidPackage(false)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const removeSpecItem = async (item) => {
    if (!loadedBidPackageId) return

    const confirmed = window.confirm(
      `Deactivate ${item.code_tag || item.id} in this bid package?\n\nThis hides it from bidder and comparison views.`
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deactivating line item in bid package...')
    try {
      await deactivateSpecItem({ bidPackageId: loadedBidPackageId, specItemId: item.id })
      setStatusMessage('Line item deactivated in bid package.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const reactivateItem = async (item) => {
    if (!loadedBidPackageId) return

    setLoading(true)
    setStatusMessage('Re-activating line item...')
    try {
      await reactivateSpecItem({ bidPackageId: loadedBidPackageId, specItemId: item.id })
      setStatusMessage('Line item re-activated.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const approveRequirement = async (item, requirementKey) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Saving approval...')
    try {
      await approveSpecItemRequirement({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        requirementKey
      })
      setStatusMessage('Approval saved.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const unapproveRequirement = async (item, requirementKey, actionType = 'unapproved') => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage(actionType === 'reset' ? 'Resetting requirement...' : 'Removing approval...')
    try {
      await unapproveSpecItemRequirement({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        requirementKey,
        actionType
      })
      setStatusMessage(actionType === 'reset' ? 'Requirement reset.' : 'Approval removed.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const markRequirementNeedsFix = async (item, requirementKey) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Marking requirement as needs fix...')
    try {
      await markSpecItemRequirementNeedsFix({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        requirementKey
      })
      setStatusMessage('Requirement marked as needs fix.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const uploadLineItemFile = async (file) => {
    if (!loadedBidPackageId || !activeLineItemFilesModal?.specItemId || !file) return
    setLoading(true)
    setStatusMessage('Uploading file...')
    try {
      const result = await createBidPackagePostAwardUpload(loadedBidPackageId, {
        file,
        fileName: file.name,
        specItemId: activeLineItemFilesModal.specItemId,
        requirementKey: lineItemUploadRequirementKey || undefined
      })
      const upload = result?.upload
      if (upload) {
        setActiveLineItemFilesModal((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            uploads: [upload, ...(prev.uploads || [])]
          }
        })
      }
      setLineItemUploadFile(null)
      setLineItemUploadRequirementKey('')
      setStatusMessage('File uploaded.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const downloadSingleLineItemFile = async (upload) => {
    if (!upload?.download_url) return
    const requirementLabel = upload.requirement_key ? (activeModalRequirementLabelByKey[upload.requirement_key] || upload.requirement_key) : ''
    const targetFileName = fileNameWithRequirementTag(
      upload.file_name || 'download',
      requirementLabel,
      activeLineItemFilesModal?.codeTag || '',
      lineItemDownloadIncludeTag,
      lineItemDownloadIncludeCode
    )

    const response = await fetch(`${API_BASE_URL}${upload.download_url}`, { credentials: 'include' })
    if (!response.ok) throw new Error(`Download failed (${response.status})`)
    const blob = await response.blob()
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = targetFileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(objectUrl)
  }

  const downloadAllLineItemFiles = async () => {
    const downloadableUploads = filteredActiveModalUploads.filter((upload) => Boolean(upload?.download_url))
    if (downloadableUploads.length === 0) return

    setLineItemBulkDownloading(true)
    try {
      const url = bidPackagePostAwardUploadsBundleUrl(loadedBidPackageId, {
        uploadIds: downloadableUploads.map((upload) => upload.id),
        includeTag: lineItemDownloadIncludeTag,
        includeCode: lineItemDownloadIncludeCode
      })
      window.open(url, '_blank', 'noopener,noreferrer')
      setStatusMessage(`Preparing ZIP for ${downloadableUploads.length} file${downloadableUploads.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setStatusMessage(error.message || 'Unable to download all files.')
    } finally {
      setLineItemBulkDownloading(false)
    }
  }

  const deleteLineItemFile = async (upload) => {
    if (!loadedBidPackageId || !upload?.id) return
    if (upload?.uploader_role !== 'designer') return
    const confirmed = window.confirm('Delete this designer-uploaded file?')
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting file...')
    try {
      await deleteBidPackagePostAwardUpload(loadedBidPackageId, upload.id)
      setActiveLineItemFilesModal((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          uploads: (prev.uploads || []).filter((item) => item.id !== upload.id)
        }
      })
      setStatusMessage('File deleted.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const updateLineItemUploadRequirement = async (upload, requirementKey) => {
    if (!loadedBidPackageId || !upload?.id) return
    setLineItemSavingTagUploadId(upload.id)
    try {
      const result = await updateBidPackagePostAwardUpload(loadedBidPackageId, upload.id, { requirementKey })
      const updatedUpload = result?.upload
      setActiveLineItemFilesModal((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          uploads: (prev.uploads || []).map((item) => (
            item.id === upload.id
              ? { ...item, ...(updatedUpload || {}), requirement_key: (updatedUpload?.requirement_key ?? requirementKey) || null }
              : item
          ))
        }
      })
      setStatusMessage('File tag updated.')
    } catch (error) {
      setStatusMessage(error.message || 'Unable to update requirement tag.')
    } finally {
      setLineItemSavingTagUploadId(null)
    }
  }

  const clearApprovalsForCurrentVendor = async () => {
    if (!loadedBidPackageId || !postAwardActive) return
    const confirmed = window.confirm(
      'Clear all approval cells for the currently awarded vendor?\n\nThis will not affect approvals for other vendors.'
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Clearing current vendor approvals...')
    try {
      const result = await clearCurrentAwardApprovals({ bidPackageId: loadedBidPackageId })
      setStatusMessage(`Cleared ${result.deleted_count || 0} approvals for current vendor.`)
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const disableBidder = async (inviteId) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Disabling bidder...')
    try {
      await disableInvite({ bidPackageId: loadedBidPackageId, inviteId })
      setStatusMessage('Bidder disabled.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const enableBidder = async (inviteId) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Enabling bidder...')
    try {
      await enableInvite({ bidPackageId: loadedBidPackageId, inviteId })
      setStatusMessage('Bidder enabled.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteBidderRow = async (row) => {
    if (!loadedBidPackageId) return
    const confirmed = window.confirm(
      `Delete ${row.dealer_name || 'this bidder'} and associated bid?\n\nThis action cannot be undone.`
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting bidder and bid...')
    try {
      await deleteInvite({ bidPackageId: loadedBidPackageId, inviteId: row.invite_id })
      setStatusMessage('Bidder and bid deleted.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const openClearAwardModal = (row) => {
    if (!loadedBidPackageId || !postAwardActive) return
    setClearAwardModal({
      dealerName: vendorDisplayName(row?.dealer_name)
    })
  }

  const clearAwardForPackage = async () => {
    if (!loadedBidPackageId || !postAwardActive) return

    setLoading(true)
    setStatusMessage('Removing award...')
    try {
      await clearBidPackageAward({ bidPackageId: loadedBidPackageId })
      setStatusMessage('Award removed.')
      setClearAwardModal(null)
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const enableApprovalsOnlyMode = () => {
    if (!loadedBidPackageId) return
    storeValue(approvalsOnlyStorageKey(loadedBidPackageId), '1')
    setApprovalsOnlyMode(true)
  }

  const disableApprovalsOnlyMode = () => {
    if (!loadedBidPackageId) return
    storeValue(approvalsOnlyStorageKey(loadedBidPackageId), '')
    setApprovalsOnlyMode(false)
  }

  const inviteBiddersFromApprovals = () => {
    disableApprovalsOnlyMode()
    setShowAddBidderForm(false)
  }

  useEffect(() => {
    if (!selectedBidPackageId) return
    storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, selectedBidPackageId)
  }, [selectedBidPackageId])

  useEffect(() => {
    if (!loadedBidPackageId) return
    storeLineItemsViewPreferences(String(loadedBidPackageId), {
      showProductColumn,
      showBrandColumn,
      showQtyColumn
    })
  }, [loadedBidPackageId, showProductColumn, showBrandColumn, showQtyColumn])

  useEffect(() => {
    if (!restoredLoadedBidPackageId) return
    if (loadedBidPackageId) return
    if (!selectedBidPackageId) return
    if (String(selectedBidPackageId) !== String(restoredLoadedBidPackageId)) return
    if (loadingPackages || loading) return

    loadDashboard()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredLoadedBidPackageId, selectedBidPackageId, loadingPackages, loading])

  const postAwardActive = Boolean(loadedPackageSettings?.awarded_bid_id)
  const approvalTrackingActive = Boolean(postAwardActive || approvalsOnlyMode)
  const currentAwardedBidIdStr = loadedPackageSettings?.awarded_bid_id != null
    ? String(loadedPackageSettings.awarded_bid_id)
    : null
  const visibleInviteRows = useMemo(() => {
    if (!postAwardActive || !currentAwardedBidIdStr || showAllAwardedBidders) return rows
    return rows.filter((row) => row.bid_id != null && String(row.bid_id) === currentAwardedBidIdStr)
  }, [rows, postAwardActive, currentAwardedBidIdStr, showAllAwardedBidders])
  const sortedInviteRows = useMemo(() => {
    const list = [...visibleInviteRows]
    const indexByInviteId = new Map(visibleInviteRows.map((row, index) => [String(row.invite_id), index]))
    const createdOrderSort = (a, b) => {
      const ai = indexByInviteId.get(String(a.invite_id)) ?? 0
      const bi = indexByInviteId.get(String(b.invite_id)) ?? 0
      return ai - bi
    }
    const bidderTotalForSort = (row) => {
      const minTotal = numberOrNull(row.min_total_amount)
      if (minTotal != null) return minTotal
      return numberOrNull(row.latest_total_amount)
    }
    const statusRankForSort = (row) => {
      if (row.status === 'submitted') return 0
      if (row.status === 'in_progress') return 1
      if (row.status === 'not_started') return 2
      return 3
    }

    if (biddersSort === 'vendor_asc') {
      return list.sort((a, b) => (
        String(vendorDisplayName(a.dealer_name)).localeCompare(String(vendorDisplayName(b.dealer_name)), undefined, { sensitivity: 'base' })
      ))
    }
    if (biddersSort === 'status') {
      return list.sort((a, b) => {
        const rankCmp = statusRankForSort(a) - statusRankForSort(b)
        if (rankCmp !== 0) return rankCmp
        return createdOrderSort(a, b)
      })
    }
    if (biddersSort === 'total_low_high') {
      return list.sort((a, b) => {
        const av = bidderTotalForSort(a)
        const bv = bidderTotalForSort(b)
        if (av == null && bv == null) return createdOrderSort(a, b)
        if (av == null) return 1
        if (bv == null) return -1
        if (av !== bv) return av - bv
        return createdOrderSort(a, b)
      })
    }
    if (biddersSort === 'total_high_low') {
      return list.sort((a, b) => {
        const av = bidderTotalForSort(a)
        const bv = bidderTotalForSort(b)
        if (av == null && bv == null) return createdOrderSort(a, b)
        if (av == null) return 1
        if (bv == null) return -1
        if (av !== bv) return bv - av
        return createdOrderSort(a, b)
      })
    }

    return list.sort(createdOrderSort)
  }, [visibleInviteRows, biddersSort])
  const comparisonVisibleInviteIdSet = useMemo(
    () => new Set((comparisonVisibleInviteIds || []).map((id) => String(id))),
    [comparisonVisibleInviteIds]
  )
  useEffect(() => {
    if (approvalTrackingActive) {
      setComparisonVisibleInviteIds([])
      return
    }

    const inviteIds = sortedInviteRows.map((row) => row.invite_id)
    setComparisonVisibleInviteIds((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return inviteIds
      const prevSet = new Set(prev.map((id) => String(id)))
      const retained = inviteIds.filter((id) => prevSet.has(String(id)))
      const added = inviteIds.filter((id) => !prevSet.has(String(id)))
      const merged = [...retained, ...added]
      return merged.length > 0 ? merged : inviteIds
    })
  }, [sortedInviteRows, approvalTrackingActive, loadedBidPackageId])
  const lineItemsActionColumnCount = approvalTrackingActive ? 0 : 1
  const lineItemsBaseColumnCount = 1 + (showProductColumn ? 1 : 0) + (showBrandColumn ? 1 : 0) + (showQtyColumn ? 1 : 0) + lineItemsActionColumnCount
  const lineItemsExtraColumnCount = approvalTrackingActive ? (requiredApprovalColumns.length + 1) : 0
  const normalizedLineItemsPerPage = Number.isFinite(Number(lineItemsPerPage)) ? Number(lineItemsPerPage) : 50
  const pendingApprovalsCount = (item) => (item.required_approvals || []).reduce((count, requirement) => (
    requirement.applies && !requirement.approved ? count + 1 : count
  ), 0)
  const buildPendingSnapshot = (items) => (items || []).reduce((acc, item) => {
    acc[item.id] = pendingApprovalsCount(item)
    return acc
  }, {})
  const refreshLineItemsSort = () => setLineItemsPendingSnapshot(buildPendingSnapshot(specItems))
  const sortedSpecItems = useMemo(() => {
    const list = [...specItems]
    const codeTagSort = (a, b) => String(a.code_tag || '').localeCompare(String(b.code_tag || ''), undefined, { numeric: true, sensitivity: 'base' })
    const snapshotPendingFor = (item) => (
      Object.prototype.hasOwnProperty.call(lineItemsPendingSnapshot, item.id)
        ? lineItemsPendingSnapshot[item.id]
        : pendingApprovalsCount(item)
    )

    if (!approvalTrackingActive || lineItemsSort === 'code_tag') {
      return list.sort(codeTagSort)
    }

    if (lineItemsSort === 'pending_desc') {
      return list.sort((a, b) => {
        const cmp = snapshotPendingFor(b) - snapshotPendingFor(a)
        return cmp !== 0 ? cmp : codeTagSort(a, b)
      })
    }

    if (lineItemsSort === 'pending_asc') {
      return list.sort((a, b) => {
        const cmp = snapshotPendingFor(a) - snapshotPendingFor(b)
        return cmp !== 0 ? cmp : codeTagSort(a, b)
      })
    }

    return list.sort(codeTagSort)
  }, [specItems, approvalTrackingActive, lineItemsSort, lineItemsPendingSnapshot])
  const totalLineItemsPages = Math.max(Math.ceil(sortedSpecItems.length / normalizedLineItemsPerPage), 1)
  const lineItemsRangeStart = sortedSpecItems.length === 0 ? 0 : ((lineItemsPage - 1) * normalizedLineItemsPerPage) + 1
  const lineItemsRangeEnd = Math.min(lineItemsPage * normalizedLineItemsPerPage, sortedSpecItems.length)
  const lineItemsSectionTitle = loadedBidPackageId
    ? `Line Items (${lineItemsRangeStart}-${lineItemsRangeEnd} of ${sortedSpecItems.length})`
    : 'Line Items In Package'
  const biddersSectionTitle = `Bidders (${visibleInviteRows.length})`
  const requiredApprovalsBySpecItem = useMemo(
    () => Object.fromEntries(
      (specItems || []).map((item) => [String(item.id), item.required_approvals || []])
    ),
    [specItems]
  )
  const lineItemUploadsBySpecItem = useMemo(
    () => Object.fromEntries(
      (specItems || []).map((item) => [String(item.id), item.uploads || []])
    ),
    [specItems]
  )
  const activeModalRequirementOptions = useMemo(() => (
    Array.isArray(activeLineItemFilesModal?.requirements)
      ? activeLineItemFilesModal.requirements
      : []
  ), [activeLineItemFilesModal])
  const activeModalRequirementLabelByKey = useMemo(() => (
    Object.fromEntries(activeModalRequirementOptions.map((option) => [option.key, option.label]))
  ), [activeModalRequirementOptions])
  const activeModalRetagOptions = useMemo(() => {
    const options = [...activeModalRequirementOptions]
    const seen = new Set(options.map((option) => String(option.key)))
    const uploads = Array.isArray(activeLineItemFilesModal?.uploads) ? activeLineItemFilesModal.uploads : []
    uploads.forEach((upload) => {
      const key = String(upload?.requirement_key || '').trim()
      if (!key || seen.has(key)) return
      seen.add(key)
      options.push({ key, label: activeModalRequirementLabelByKey[key] || key })
    })
    return options
  }, [activeLineItemFilesModal, activeModalRequirementLabelByKey, activeModalRequirementOptions])
  const filteredActiveModalUploads = useMemo(() => {
    const uploads = Array.isArray(activeLineItemFilesModal?.uploads) ? activeLineItemFilesModal.uploads : []
    if (lineItemFilterRequirementKey === 'all') return uploads
    if (lineItemFilterRequirementKey === 'untagged') return uploads.filter((upload) => !upload.requirement_key)
    return uploads.filter((upload) => String(upload.requirement_key || '') === String(lineItemFilterRequirementKey))
  }, [activeLineItemFilesModal, lineItemFilterRequirementKey])
  const paginatedSpecItems = sortedSpecItems.slice(
    (lineItemsPage - 1) * normalizedLineItemsPerPage,
    lineItemsPage * normalizedLineItemsPerPage
  )

  useEffect(() => {
    if (lineItemsPage > totalLineItemsPages) {
      setLineItemsPage(totalLineItemsPages)
    }
    if (lineItemsPage < 1) {
      setLineItemsPage(1)
    }
  }, [lineItemsPage, totalLineItemsPages])

  useEffect(() => {
    if (!approvalTrackingActive) {
      if (lineItemsSort !== 'code_tag') setLineItemsSort('code_tag')
      if (Object.keys(lineItemsPendingSnapshot).length > 0) setLineItemsPendingSnapshot({})
      return
    }
    if (showAddBidderForm) setShowAddBidderForm(false)
  }, [approvalTrackingActive, showAddBidderForm, lineItemsSort, lineItemsPendingSnapshot])

  useEffect(() => {
    if (!approvalTrackingActive) return
    if (lineItemsSort === 'code_tag') return
    setLineItemsPendingSnapshot(buildPendingSnapshot(specItems))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedBidPackageId, lineItemsSort, approvalTrackingActive])

  return (
    <div className="stack">
      <SectionCard className="section-card-flat package-detail-header-card">
        <button
          type="button"
          className="all-packages-back-link"
          onClick={() => navigate('/package')}
        >
          ‹ All Packages
        </button>
        <h1 className="package-detail-title">{packageHeaderTitle}</h1>
        {loadedPackageSettings?.visibility === 'public' && loadedPackageSettings?.public_url ? (
          <div className="public-url-inline">
            <span className="text-muted">Public URL:</span>
            <a
              href={`${window.location.origin}${loadedPackageSettings.public_url}`}
              target="_blank"
              rel="noreferrer"
            >
              <code>{`${window.location.origin}${loadedPackageSettings.public_url}`}</code>
            </a>
            <button className="btn" onClick={copyPublicUrl} disabled={loading}>
              {copiedPublicUrl ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : null}
        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
      </SectionCard>

      {!(approvalsOnlyMode && !postAwardActive) ? (
      <SectionCard className="section-card-flat bidders-flat">
        <div style={{ maxWidth: '985px' }}>
          <div className="bidders-head-row">
            <h2>{biddersSectionTitle}</h2>
            {!postAwardActive && !approvalsOnlyMode ? (
              <div className="bidders-head-actions">
                <label className="bidders-sort-control">
                  <span className="bidders-sort-label">Sort by:</span>
                  <select
                    className="bidders-sort-select"
                    value={biddersSort}
                    onChange={(event) => setBiddersSort(event.target.value)}
                    disabled={loading}
                  >
                    <option value="created">Created</option>
                    <option value="vendor_asc">Vendor Name</option>
                    <option value="total_low_high">Ascending</option>
                    <option value="total_high_low">Descending</option>
                  </select>
                </label>
              </div>
            ) : null}
            {!postAwardActive && approvalsOnlyMode ? (
              <div className="bidders-head-actions">
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Approvals-only mode</span>
              </div>
            ) : null}
          </div>
          <table className="table data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '200px' }} className="data-table-col-head">Vendor</th>
                <th style={{ width: '110px' }} className="data-table-col-head">Status</th>
                <th style={{ width: '240px' }} className="data-table-col-head">Snapshot</th>
                <th style={{ width: '160px' }} className="data-table-col-head">Total</th>
                <th style={{ width: '60px', textAlign: 'right' }} className="data-table-col-head"></th>
              </tr>
            </thead>
            <tbody>
              {sortedInviteRows.map((row) => {
                const effectiveSelectionStatus = postAwardActive
                  ? (row.bid_id != null && String(row.bid_id) === currentAwardedBidIdStr ? 'awarded' : 'not_selected')
                  : row.selection_status
                const isNotStarted = row.status === 'not_started'
                const completionPct = Math.max(0, Math.min(100, Number(row.completion_pct ?? 0)))
                const isFullyComplete = completionPct >= 100
                const minTotal = numberOrNull(row.min_total_amount)
                const maxTotal = numberOrNull(row.max_total_amount)
                const minLabel = compactMoney(minTotal)
                const maxLabel = compactMoney(maxTotal)
                const totalDisplay = postAwardActive
                  ? totalLabel(row, { postAwardActive })
                  : (minTotal != null && maxTotal != null
                    ? (minLabel === maxLabel ? minLabel : `${minLabel}-${maxLabel}`)
                    : compactMoney(row.latest_total_amount))
                const isComparisonVisible = comparisonVisibleInviteIdSet.has(String(row.invite_id))
                return (
                  <tr key={row.invite_id} className={isNotStarted ? 'bidder-row-muted' : ''}>
                    <td>
                      <div className="bidder-vendor-topline">
                        <span className="bidder-controls">
                          {!postAwardActive ? (
                            <input
                              type="checkbox"
                              className="comparison-visibility-checkbox"
                              checked={isComparisonVisible}
                              onChange={(event) => {
                                const checked = event.target.checked
                                setComparisonVisibleInviteIds((prev) => {
                                  const current = Array.isArray(prev) ? prev : []
                                  if (checked) {
                                    return current.some((id) => String(id) === String(row.invite_id))
                                      ? current
                                      : [...current, row.invite_id]
                                  }
                                  const next = current.filter((id) => String(id) !== String(row.invite_id))
                                  return next
                                })
                              }}
                              disabled={loading}
                              title="Show/hide bidder in comparison table"
                              aria-label="Show/hide bidder in comparison table"
                            />
                          ) : null}
                          <button
                            type="button"
                            className="access-dot-btn"
                            onClick={() => {
                              if (row.access_state === 'enabled') disableBidder(row.invite_id)
                              else enableBidder(row.invite_id)
                            }}
                            disabled={loading}
                            title={row.access_state === 'enabled' ? 'Click to disable bidder access' : 'Click to enable bidder access'}
                            aria-label={row.access_state === 'enabled' ? 'Disable bidder access' : 'Enable bidder access'}
                            style={{ background: row.access_state === 'enabled' ? '#10b981' : '#ef4444' }}
                          />
                        </span>
                        <span className="bidder-vendor-name">{vendorDisplayName(row.dealer_name)}</span>
                      </div>
                      <div className="bidder-password-line">
                        <span className="bidder-controls-spacer" />
                        <span>Password:</span>
                        {editingPasswordInviteId === row.invite_id ? (
                          <input
                            className="password-inline-input"
                            type="text"
                            value={passwordEditDraft}
                            onChange={(event) => setPasswordEditDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                editInvitePassword(row, passwordEditDraft)
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                setEditingPasswordInviteId(null)
                                setPasswordEditDraft('')
                              }
                            }}
                            autoFocus
                            disabled={savingPasswordInviteId === row.invite_id}
                          />
                        ) : (
                          <button
                            className="btn"
                            style={{ padding: '0.1rem 0.35rem', fontSize: '0.75rem', minWidth: 'auto', lineHeight: '1', fontFamily: 'monospace', background: '#f5f5f5', border: '1px solid #e0e0e0' }}
                            title="Click to change password"
                            onClick={() => {
                              setEditingPasswordInviteId(row.invite_id)
                              setPasswordEditDraft(row.invite_password || '')
                            }}
                            disabled={loading}
                          >
                            {row.invite_password || '—'}
                          </button>
                        )}
                        <button
                          className="btn bidder-inline-icon-btn"
                          title="Copy access link"
                          onClick={() => copyInviteLink(row)}
                          disabled={loading}
                        >
                          <img src={linkIcon} alt="" aria-hidden="true" />
                        </button>
                        <button
                          className="btn bidder-inline-icon-btn"
                          title="Email invitation"
                          onClick={() => emailInvite(row)}
                          disabled={loading}
                        >
                          <img src={emailIcon} alt="" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    <td>
                      {postAwardActive && effectiveSelectionStatus === 'awarded' ? (
                        <div className="bidder-status-cell">
                          <button
                            type="button"
                            className="bidder-status-main status-tone-submitted"
                            title="Click to remove award"
                            onClick={() => openClearAwardModal(row)}
                            disabled={loading}
                          >
                            Awarded
                          </button>
                        </div>
                      ) : null}
                      {postAwardActive && effectiveSelectionStatus === 'not_selected' ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-neutral">Lost</span>
                        </div>
                      ) : null}
                      {!postAwardActive && row.status === 'submitted' ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-submitted">Submitted</span>
                          <button
                            type="button"
                            className="bidder-status-action"
                            title="Click to reopen bid"
                            onClick={() => reopenBid(row.invite_id)}
                            disabled={loading}
                          >
                            <img src={reopenIcon} alt="" aria-hidden="true" />
                            <span>Re-open</span>
                          </button>
                        </div>
                      ) : null}
                      {!postAwardActive && row.status === 'in_progress' && row.current_version > 0 ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-warning">In progress</span>
                          <button
                            type="button"
                            className="bidder-status-action bidder-status-action-lock"
                            title="Click to lock bid"
                            onClick={() => recloseBid(row)}
                            disabled={loading}
                          >
                            <img src={lockIcon} alt="" aria-hidden="true" />
                            <span>Lock</span>
                          </button>
                        </div>
                      ) : null}
                      {!postAwardActive && row.status === 'in_progress' && row.current_version === 0 ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-warning">In progress</span>
                        </div>
                      ) : null}
                      {!postAwardActive && row.status === 'not_started' ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-neutral">No Activity</span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {isNotStarted ? (
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>Not started</span>
                      ) : (
                        <>
                          <div
                            style={{
                              background: '#e8e8e8',
                              height: '6px',
                              borderRadius: '3px',
                              overflow: 'hidden',
                              marginBottom: '0.4rem'
                            }}
                          >
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, Number(row.completion_pct ?? 0)))}%`,
                              height: '100%',
                              background: isFullyComplete ? '#10b981' : '#f59e0b',
                              transition: 'width 0.3s'
                            }}
                          />
                        </div>
                          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                            <span
                              style={{
                                color: isFullyComplete ? '#10b981' : '#f59e0b',
                                fontWeight: '500'
                              }}
                            >
                              {`${Math.round(completionPct)}% complete`}
                            </span>
                            {(row.bod_skipped_pct ?? 0) > 0 ? (
                              <span style={{ color: '#f59e0b', fontWeight: '500' }}>
                                {`${Math.round(row.bod_skipped_pct ?? 0)}% BoD skipped`}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                            {`${row.bod_only_count ?? 0} BoD • ${row.mixed_line_count ?? 0} BoD-Sub • ${row.sub_only_count ?? 0} Sub`}
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="bidder-total-main">
                        {totalDisplay}
                      </div>
                      {!isNotStarted && (row.submitted_at || row.last_saved_at) ? (
                        <div className="bidder-version-cell">
                          <div className="bidder-version-line">
                            <span className="bidder-version-date">
                              {formatCompactDateTime(row.submitted_at || row.last_saved_at)}
                            </span>
                            <button
                              type="button"
                              className="mini-link-btn bidder-total-sub bidder-version-trigger"
                              style={{ marginTop: 0 }}
                              onClick={() => openHistory(row.invite_id)}
                              disabled={loading}
                              title="View bid version history"
                              aria-expanded={historyOpen && String(historyInviteId) === String(row.invite_id)}
                            >
                              {`v${row.current_version || 0}`}
                            </button>
                          </div>
                          {historyOpen && String(historyInviteId) === String(row.invite_id) ? (
                            <div className="bidder-history-popover" role="dialog" aria-label="Bid Version History">
                              <div className="history-modal-head">
                                <h2>Bid Version History</h2>
                              </div>
                              {historyLoading ? <p className="text-muted">Loading history...</p> : null}
                              {!historyLoading && historyData ? (
                                <div className="history-version-list">
                                  {(historyData.versions || []).map((version) => {
                                    const isCurrent = Number(version.version_number) === Number(historyData.current_version)
                                    const itemCount = Number.isFinite(Number(version.line_items_count))
                                      ? Number(version.line_items_count)
                                        : Array.isArray(version.line_items)
                                        ? version.line_items.length
                                        : 0
                                    if (isCurrent) {
                                      return (
                                        <div key={version.id} className="history-version-item is-current">
                                          <div className="history-version-grid">
                                            <div className="history-version-top">
                                              <div className="history-version-label-wrap">
                                                <span className="history-version-label">v{version.version_number}</span>
                                                <span className="history-version-current-pill">Current</span>
                                              </div>
                                            </div>
                                            <div className="history-version-left">
                                              <div className="history-version-date">{formatHistoryDateTime(version.submitted_at)}</div>
                                              <div className="history-version-items">{`${itemCount} items`}</div>
                                            </div>
                                            <span className="history-version-total">{compactHistoryMoney(version.total_amount)}</span>
                                          </div>
                                      </div>
                                    )
                                  }

                                  return (
                                      <button
                                        key={version.id}
                                        type="button"
                                        className="history-version-item is-clickable"
                                        onClick={() => enterHistoryView(version)}
                                      >
                                        <div className="history-version-grid">
                                          <div className="history-version-top">
                                            <div className="history-version-label-wrap">
                                              <span className="history-version-label">v{version.version_number}</span>
                                            </div>
                                          </div>
                                          <div className="history-version-left">
                                            <div className="history-version-date">{formatHistoryDateTime(version.submitted_at)}</div>
                                            <div className="history-version-items">{`${itemCount} items`}</div>
                                          </div>
                                          <span className="history-version-total">{compactHistoryMoney(version.total_amount)}</span>
                                        </div>
                                      </button>
                                    )
                                  })}
                                  {(historyData.versions || []).length === 0 ? (
                                    <p className="text-muted">No submitted versions yet.</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn"
                        style={{
                          padding: '0.25rem 0.4rem',
                          fontSize: '0.75rem',
                          minWidth: 'auto',
                          lineHeight: '1',
                          color: '#ef4444'
                        }}
                        title="Remove bidder"
                        onClick={() => deleteBidderRow(row)}
                        disabled={loading}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
              {sortedInviteRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    {postAwardActive ? 'No awarded bidder found.' : 'No invite rows loaded yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="action-row bidders-footer-actions">
          {postAwardActive && rows.length > 1 ? (
            <button
              className="btn btn-primary"
              onClick={() => setShowAllAwardedBidders((prev) => !prev)}
              disabled={!loadedBidPackageId || loading}
            >
              {showAllAwardedBidders ? 'View Winner Only' : 'View All'}
            </button>
          ) : null}
          {!postAwardActive && !approvalsOnlyMode && showAddBidderForm ? (
            <div className="bidder-add-head-inline">
              <button
                className="btn bidder-add-cancel-btn"
                type="button"
                onClick={() => setShowAddBidderForm(false)}
                disabled={loading}
                title="Cancel"
              >
                ✕
              </button>
              <select
                className="bidder-add-head-input bidder-add-head-select"
                value={selectedVendorKey}
                onChange={(event) => onVendorChange(event.target.value)}
              >
                <option value="">Select vendor</option>
                {vendorOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
              <input
                className="bidder-add-head-input bidder-add-head-password"
                type="text"
                value={invitePassword}
                onChange={(event) => setInvitePassword(event.target.value)}
                placeholder="Set Invite Password"
              />
              <button
                className="btn bidder-add-submit-btn"
                onClick={addInvite}
                disabled={loading || !dealerName.trim() || !invitePassword || !loadedBidPackageId}
                title="Add bidder"
              >
                +
              </button>
            </div>
          ) : null}
          {!postAwardActive && !showAddBidderForm ? (
            <button
              className="btn bidder-add-link-btn"
              onClick={() => setShowAddBidderForm(true)}
              disabled={!loadedBidPackageId || loading || approvalsOnlyMode}
            >
              <img src={plusBidderIcon} alt="" aria-hidden="true" />
              <span>Bidder</span>
            </button>
          ) : null}
          {!postAwardActive && !showAddBidderForm && rows.length === 0 && !approvalsOnlyMode ? (
            <button
              className="btn"
              onClick={enableApprovalsOnlyMode}
              disabled={!loadedBidPackageId || loading}
            >
              Skip to Approvals
            </button>
          ) : null}
        </div>
      </SectionCard>
      ) : null}
      {loadedBidPackageId ? (
        <>
          {historyView ? (
            <div className="comparison-history-banner">
              <div className="comparison-history-banner-left">
                <span className="comparison-history-banner-icon" aria-hidden="true">📋</span>
                <div className="comparison-history-banner-content">
                  <p className="comparison-history-banner-title">Viewing Historical Bid</p>
                  <p className="comparison-history-banner-details">{`${historyView.dealerName} - Version ${historyView.version} (${historyView.date} at ${historyView.time})`}</p>
                  <p className="comparison-history-banner-subtext">You cannot award a bid while in history mode.</p>
                </div>
              </div>
              <button type="button" className="btn comparison-history-exit-btn" onClick={() => setHistoryView(null)}>
                Exit History View
              </button>
            </div>
          ) : null}
          <ComparisonPage
            embedded
            bidPackageId={loadedBidPackageId}
            allowItemManagement={!approvalTrackingActive}
            awardedWorkspace={approvalTrackingActive}
            requiredApprovalColumns={approvalTrackingActive ? requiredApprovalColumns : []}
            requiredApprovalsBySpecItem={approvalTrackingActive ? requiredApprovalsBySpecItem : {}}
            lineItemUploadsBySpecItem={approvalTrackingActive ? lineItemUploadsBySpecItem : {}}
            onApproveRequirement={approvalTrackingActive ? ({ specItemId, requirementKey }) => approveRequirement({ id: specItemId }, requirementKey) : null}
            onUnapproveRequirement={approvalTrackingActive ? ({ specItemId, requirementKey, actionType }) => unapproveRequirement({ id: specItemId }, requirementKey, actionType) : null}
            onNeedsFixRequirement={approvalTrackingActive ? ({ specItemId, requirementKey }) => markRequirementNeedsFix({ id: specItemId }, requirementKey) : null}
            onOpenLineItemFiles={approvalTrackingActive ? ({ specItemId, codeTag, productName, brandName, uploads = [] }) => {
              setLineItemUploadFile(null)
              setLineItemUploadRequirementKey('')
              setLineItemFilterRequirementKey('all')
              setLineItemDownloadIncludeTag(false)
              setLineItemDownloadIncludeCode(false)
              const applicableRequirements = (requiredApprovalsBySpecItem[String(specItemId)] || [])
                .filter((requirement) => requirement.applies)
                .map((requirement) => ({ key: requirement.key, label: requirement.label }))
              setActiveLineItemFilesModal({
                specItemId: specItemId || null,
                codeTag: codeTag || '—',
                productName: productName || '—',
                brandName: brandName || '',
                uploads,
                requirements: applicableRequirements
              })
            } : null}
            onAwardChanged={async () => {
              await loadDashboard({ closeEdit: false })
            }}
            forcedVisibleDealerIds={approvalTrackingActive ? null : comparisonVisibleInviteIds}
            historyView={historyView}
            onExitHistoryView={() => setHistoryView(null)}
            lineItemsHeaderActionLabel={!postAwardActive && approvalsOnlyMode ? 'Invite Bidders' : ''}
            onLineItemsHeaderAction={!postAwardActive && approvalsOnlyMode ? inviteBiddersFromApprovals : null}
            lineItemsHeaderActionDisabled={!loadedBidPackageId || loading}
          />
        </>
      ) : (
        <SectionCard title="Line Item Comparison">
          <p className="text-muted">Load a bid package to view comparison.</p>
        </SectionCard>
      )}

      {activeLineItemFilesModal ? (
        <div className="modal-backdrop" onClick={() => {
          setActiveLineItemFilesModal(null)
          setLineItemUploadFile(null)
          setLineItemUploadRequirementKey('')
          setLineItemFilterRequirementKey('all')
          setLineItemDownloadIncludeTag(false)
          setLineItemDownloadIncludeCode(false)
        }}>
          <div className="modal-card file-room-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <h2>{`Files · ${activeLineItemFilesModal.codeTag}`}</h2>
              <button
                className="btn"
                onClick={() => {
                  setActiveLineItemFilesModal(null)
                  setLineItemUploadFile(null)
                  setLineItemUploadRequirementKey('')
                  setLineItemFilterRequirementKey('all')
                  setLineItemDownloadIncludeTag(false)
                  setLineItemDownloadIncludeCode(false)
                }}
              >
                ✕
              </button>
            </div>
            <p className="text-muted file-room-subtitle" style={{ marginTop: 0 }}>
              {activeLineItemFilesModal.brandName
                ? `${activeLineItemFilesModal.productName} by ${activeLineItemFilesModal.brandName}`
                : activeLineItemFilesModal.productName}
            </p>
            <div className="designer-file-room-dropzone">
              <div className="designer-file-room-upload-icon">⇪</div>
              <div className="designer-file-room-drop-copy">Drag and drop files here, or click to browse</div>
              {activeModalRequirementOptions.length > 0 ? (
                <label className="designer-file-room-tag-select">
                  <span>Requirement Tag (optional)</span>
                  <select
                    value={lineItemUploadRequirementKey}
                    onChange={(event) => setLineItemUploadRequirementKey(event.target.value)}
                    disabled={loading}
                  >
                    <option value="">None</option>
                    {activeModalRequirementOptions.map((option) => (
                      <option key={`upload-requirement-${option.key}`} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="btn btn-primary designer-file-room-select-btn">
                Select Files
                <input
                  type="file"
                  style={{ display: 'none' }}
                  disabled={loading}
                  onChange={async (event) => {
                    const file = event.target.files?.[0] || null
                    setLineItemUploadFile(file)
                    if (file) await uploadLineItemFile(file)
                    event.target.value = ''
                  }}
                />
              </label>
            </div>
            {activeModalRequirementOptions.length > 0 ? (
              <div className="designer-file-room-filter-row">
                <span>Filter:</span>
                <select
                  value={lineItemFilterRequirementKey}
                  onChange={(event) => setLineItemFilterRequirementKey(event.target.value)}
                >
                  <option value="all">All files</option>
                  <option value="untagged">Untagged</option>
                  {activeModalRequirementOptions.map((option) => (
                    <option key={`filter-requirement-${option.key}`} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="designer-file-room-bulk-actions">
              <div className="designer-file-room-download-options">
                <label className="checkbox-row designer-file-room-download-toggle">
                  <input
                    type="checkbox"
                    checked={lineItemDownloadIncludeCode}
                    onChange={(event) => setLineItemDownloadIncludeCode(event.target.checked)}
                  />
                  Include code/tag in filenames
                </label>
                <label className="checkbox-row designer-file-room-download-toggle">
                  <input
                    type="checkbox"
                    checked={lineItemDownloadIncludeTag}
                    onChange={(event) => setLineItemDownloadIncludeTag(event.target.checked)}
                  />
                  Include requirement tag in filenames
                </label>
              </div>
              <button
                type="button"
                className="btn"
                onClick={downloadAllLineItemFiles}
                disabled={lineItemBulkDownloading || filteredActiveModalUploads.filter((upload) => Boolean(upload?.download_url)).length === 0}
              >
                {lineItemBulkDownloading ? 'Downloading…' : 'Download All'}
              </button>
            </div>
            <div className="designer-file-room-list">
              {filteredActiveModalUploads.map((upload) => (
                <div key={`line-item-modal-upload-${upload.id}`} className="designer-file-room-item">
                  <div className="designer-file-room-item-icon">📄</div>
                  <div className="designer-file-room-item-main">
                    <div className="designer-file-room-item-name">
                      {upload.file_name || '—'}
                      {upload.requirement_key ? (
                        <span className="designer-file-room-requirement-chip">
                          {activeModalRequirementLabelByKey[upload.requirement_key] || upload.requirement_key}
                        </span>
                      ) : null}
                    </div>
                    <div className="designer-file-room-item-meta">
                      {[formatFileSize(upload.byte_size), upload.uploaded_by || upload.uploader_role || '—', formatShortDate(upload.uploaded_at)].filter(Boolean).join(' • ')}
                    </div>
                  </div>
                  <div className="designer-file-room-item-actions">
                    {activeModalRetagOptions.length > 0 ? (
                      <select
                        className="designer-file-room-item-tag-select"
                        value={upload.requirement_key || ''}
                        onChange={(event) => updateLineItemUploadRequirement(upload, event.target.value)}
                        disabled={loading || lineItemSavingTagUploadId === upload.id}
                        title="Requirement tag"
                      >
                        <option value="">No tag</option>
                        {activeModalRetagOptions.map((option) => (
                          <option key={`upload-item-tag-${upload.id}-${option.key}`} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    ) : null}
                    {upload.download_url ? (
                      <button
                        type="button"
                        className="btn designer-file-room-icon-btn"
                        onClick={async () => {
                          try {
                            await downloadSingleLineItemFile(upload)
                          } catch (error) {
                            setStatusMessage(error.message || 'Unable to download file.')
                          }
                        }}
                        title="Download"
                      >
                        ↓
                      </button>
                    ) : null}
                    {upload.uploader_role === 'designer' ? (
                      <button
                        className="btn designer-file-room-icon-btn danger"
                        onClick={() => deleteLineItemFile(upload)}
                        disabled={loading}
                        title="Delete"
                      >
                        🗑
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {filteredActiveModalUploads.length === 0 ? (
                <div className="designer-file-room-empty text-muted">No files uploaded yet</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {clearAwardModal ? (
        <div className="modal-backdrop" onClick={() => setClearAwardModal(null)}>
          <div className="modal-card award-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Confirm Remove Award</h3>
            <p className="award-modal-copy">
              {`Removing this award will return the package to bidding mode. You can lock in ${clearAwardModal.dealerName || 'this vendor'} as the selected vendor again later if needed.`}
            </p>
            <div className="action-row">
              <button type="button" className="btn" onClick={() => setClearAwardModal(null)} disabled={loading}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={clearAwardForPackage} disabled={loading}>
                Remove Award
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
