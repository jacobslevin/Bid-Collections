import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import {
  API_BASE_URL,
  approveSpecItemRequirement,
  clearCurrentAwardApprovals,
  clearBidPackageAward,
  createInvite,
  deactivateSpecItem,
  deleteInvite,
  disableInvite,
  enableInvite,
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
const DASHBOARD_SELECTED_PACKAGE_KEY = 'bid_collections.dashboard.selected_bid_package_id'
const DASHBOARD_LOADED_PACKAGE_KEY = 'bid_collections.dashboard.loaded_bid_package_id'
const DASHBOARD_LINE_ITEMS_VIEW_KEY_PREFIX = 'bid_collections.dashboard.line_items_view.'

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
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(3)}MM`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(3)}K`
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
    if (Math.abs(maxTotal - minTotal) < 0.005) return compactMoney(minTotal)
    return `${compactMoney(minTotal)}-${compactMoney(maxTotal)}`
  }

  return compactMoney(row?.latest_total_amount)
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
  return listPrice * (1 - (discount / 100)) * (1 + (tariff / 100))
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
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState(() => loadStoredValue(DASHBOARD_SELECTED_PACKAGE_KEY))
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
  const [expandedVersionId, setExpandedVersionId] = useState(null)
  const [activeLineItemFilesModal, setActiveLineItemFilesModal] = useState(null)
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

  const [dealerName, setDealerName] = useState('')
  const [dealerEmail, setDealerEmail] = useState('')
  const [selectedVendorKey, setSelectedVendorKey] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [showAddBidderForm, setShowAddBidderForm] = useState(false)
  const [showAllBidders, setShowAllBidders] = useState(false)
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

      const preferredId = selectedBidPackageId || loadStoredValue(DASHBOARD_SELECTED_PACKAGE_KEY)

      if (preserveSelectedId) {
        const hasSelected = preferredId && list.some((item) => String(item.id) === String(preferredId))
        if (hasSelected) {
          if (String(selectedBidPackageId) !== String(preferredId)) {
            setSelectedBidPackageId(String(preferredId))
          }
          return
        }
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

  const loadedPackageLabel = useMemo(() => {
    if (!loadedBidPackageId) return ''
    const match = bidPackages.find((item) => String(item.id) === String(loadedBidPackageId))
    if (!match) return `Bid Package ID: ${loadedBidPackageId}`
    const projectName = match.project_name || 'Unknown Project'
    const projectId = match.project_id ?? '—'
    return `${match.name} in ${projectName} (Bid Package ID: ${match.id}, Project ID: ${projectId})`
  }, [bidPackages, loadedBidPackageId])

  const loadDashboard = async ({ closeEdit = true } = {}) => {
    if (!selectedBidPackageId) return

    setLoading(true)
    setStatusMessage('Loading bid package...')
    try {
      const data = await fetchBidPackageDashboard(selectedBidPackageId)
      const viewPrefs = loadLineItemsViewPreferences(String(selectedBidPackageId))
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
      setLoadedBidPackageId(String(selectedBidPackageId))
      storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, String(selectedBidPackageId))
      storeValue(DASHBOARD_LOADED_PACKAGE_KEY, String(selectedBidPackageId))
      setRestoredLoadedBidPackageId(String(selectedBidPackageId))
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
    if (!loadedBidPackageId || !dealerName.trim() || !invitePassword) return

    setLoading(true)
    setStatusMessage('Creating invite...')
    try {
      const created = await createInvite({
        bidPackageId: loadedBidPackageId,
        dealerName: dealerName.trim(),
        dealerEmail: dealerEmail.trim(),
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

    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryData(null)
    setExpandedVersionId(null)
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

  const toggleVersionExpanded = (versionId) => {
    setExpandedVersionId((prev) => (prev === versionId ? null : versionId))
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

  const unapproveRequirement = async (item, requirementKey) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Removing approval...')
    try {
      await unapproveSpecItemRequirement({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        requirementKey
      })
      setStatusMessage('Approval removed.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
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

  const clearAwardForPackage = async () => {
    if (!loadedBidPackageId || !postAwardActive) return
    const confirmed = window.confirm(
      'Remove current award and return this package to bidding mode?'
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Removing award...')
    try {
      await clearBidPackageAward({ bidPackageId: loadedBidPackageId })
      setStatusMessage('Award removed.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
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
  const currentAwardedBidIdStr = loadedPackageSettings?.awarded_bid_id != null
    ? String(loadedPackageSettings.awarded_bid_id)
    : null
  const visibleInviteRows = useMemo(() => {
    if (!postAwardActive || showAllBidders || !currentAwardedBidIdStr) return rows
    return rows.filter((row) => row.bid_id != null && String(row.bid_id) === currentAwardedBidIdStr)
  }, [rows, postAwardActive, showAllBidders, currentAwardedBidIdStr])
  const lineItemsActionColumnCount = postAwardActive ? 0 : 1
  const lineItemsBaseColumnCount = 1 + (showProductColumn ? 1 : 0) + (showBrandColumn ? 1 : 0) + (showQtyColumn ? 1 : 0) + lineItemsActionColumnCount
  const lineItemsExtraColumnCount = postAwardActive ? (requiredApprovalColumns.length + 1) : 0
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

    if (!postAwardActive || lineItemsSort === 'code_tag') {
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
  }, [specItems, postAwardActive, lineItemsSort, lineItemsPendingSnapshot])
  const totalLineItemsPages = Math.max(Math.ceil(sortedSpecItems.length / normalizedLineItemsPerPage), 1)
  const lineItemsRangeStart = sortedSpecItems.length === 0 ? 0 : ((lineItemsPage - 1) * normalizedLineItemsPerPage) + 1
  const lineItemsRangeEnd = Math.min(lineItemsPage * normalizedLineItemsPerPage, sortedSpecItems.length)
  const lineItemsSectionTitle = loadedBidPackageId
    ? `Line Items (${lineItemsRangeStart}-${lineItemsRangeEnd} of ${sortedSpecItems.length})`
    : 'Line Items In Package'
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
    if (!postAwardActive) {
      setShowAllBidders(false)
      if (lineItemsSort !== 'code_tag') setLineItemsSort('code_tag')
      if (Object.keys(lineItemsPendingSnapshot).length > 0) setLineItemsPendingSnapshot({})
      return
    }
    if (showAddBidderForm) setShowAddBidderForm(false)
  }, [postAwardActive, showAddBidderForm, lineItemsSort, lineItemsPendingSnapshot])

  useEffect(() => {
    if (!postAwardActive) return
    if (lineItemsSort === 'code_tag') return
    setLineItemsPendingSnapshot(buildPendingSnapshot(specItems))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedBidPackageId, lineItemsSort])

  return (
    <div className="stack">
      <SectionCard
        title="Bid Package Dashboard"
      >
        <div className="form-grid">
          <label>
            Bid Package
            <select
              value={selectedBidPackageId}
              onChange={(event) => {
                const nextId = event.target.value
                setSelectedBidPackageId(nextId)
                storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, nextId)
              }}
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
          <button className="btn btn-primary" onClick={loadDashboard} disabled={!selectedBidPackageId || loading || loadingPackages}>
            Load Bid Package
          </button>
          {loadedBidPackageId ? (
            <button
              className="btn"
              onClick={() => setEditingBidPackage(true)}
              disabled={loading || loadingPackages}
            >
              Edit Bid Package
            </button>
          ) : null}
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
        </div>

        {loadedPackageSettings && editingBidPackage ? (
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            <div className="form-grid">
              <label>
                Bid Package Name
                <input value={packageNameDraft} onChange={(event) => setPackageNameDraft(event.target.value)} />
              </label>
              <label>
                Visibility
                <select value={visibilityDraft} onChange={(event) => setVisibilityDraft(event.target.value)}>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label>
                Instructions
                <textarea
                  value={instructionsDraft}
                  onChange={(event) => setInstructionsDraft(event.target.value)}
                  rows={3}
                  placeholder="Optional bidder instructions"
                />
              </label>
            </div>
            <div className="checkbox-grid">
              <p className="text-muted" style={{ margin: 0 }}>Include General Pricing Fields</p>
              {GENERAL_PRICING_FIELDS.map((field) => (
                <label key={field.key} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={activeGeneralFieldsDraft.includes(field.key)}
                    onChange={(event) => {
                      setActiveGeneralFieldsDraft((prev) => {
                        if (event.target.checked) return [...prev, field.key]
                        return prev.filter((key) => key !== field.key)
                      })
                    }}
                  />
                  {field.label}
                </label>
              ))}
            </div>
            <div className="action-row">
              <button className="btn" onClick={saveBidPackageSettings} disabled={loading || !loadedBidPackageId || !packageNameDraft.trim()}>
                Save Bid Package
              </button>
              <button className="btn btn-danger" onClick={removeBidPackage} disabled={!selectedBidPackageId || loading || loadingPackages}>
                Delete Bid Package
              </button>
              <button className="btn" onClick={() => setEditingBidPackage(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
      </SectionCard>

      <SectionCard title="Bidders">
        {postAwardActive ? (
          <div className="action-row" style={{ marginBottom: '0.6rem', justifyContent: 'flex-end' }}>
            <button
              className="btn"
              type="button"
              onClick={() => setShowAllBidders((prev) => !prev)}
              disabled={loading || !currentAwardedBidIdStr}
            >
              {showAllBidders ? 'Show Winner Only' : 'Show All'}
            </button>
          </div>
        ) : null}
        <table className="table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Status</th>
              <th>V / Saved-Submitted</th>
              <th>Snapshot</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleInviteRows.map((row) => {
              const awardMeta = awardStatusMeta(row.selection_status)
              const rowStatusMeta = statusMeta(row.status)
              const rowAccessMeta = accessMeta(row.access_state)
              const primaryStatusMeta = postAwardActive
                ? (awardMeta || { label: '—', toneClass: 'state-muted' })
                : rowStatusMeta
              return (
              <tr key={row.invite_id}>
                <td>
                  <div className="stack" style={{ gap: '0.2rem' }}>
                    <span>{vendorDisplayName(row.dealer_name)}</span>
                    <span className="text-muted bidder-password-inline">
                      <span className="bidder-password-row">
                        Password:
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
                          <>
                            <span>{row.invite_password || '—'}</span>
                            <button
                              type="button"
                              className="btn password-inline-edit-btn"
                              onClick={() => {
                                setEditingPasswordInviteId(row.invite_id)
                                setPasswordEditDraft(row.invite_password || '')
                              }}
                              disabled={loading}
                              title="Edit password"
                              aria-label="Edit password"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="btn password-inline-edit-btn"
                              onClick={() => copyInviteLink(row)}
                              disabled={loading}
                              title="Copy invite link"
                              aria-label="Copy invite link"
                            >
                              {copiedInviteId === row.invite_id ? '✓' : '⧉'}
                            </button>
                            <button
                              type="button"
                              className="btn password-inline-edit-btn"
                              onClick={() => emailInvite(row)}
                              disabled={loading}
                              title="Email invite"
                              aria-label="Email invite"
                            >
                              ✉
                            </button>
                          </>
                        )}
                      </span>
                    </span>
                  </div>
                </td>
                <td>
                  <div className="bidder-state-cell">
                    <div className="bidder-state-dots bidder-state-dots-labeled">
                      <span className="state-dot-item" title={primaryStatusMeta.label}>
                        <span className={`table-state-dot ${primaryStatusMeta.toneClass}`} aria-label={primaryStatusMeta.label} />
                        <span className="state-dot-label">{primaryStatusMeta.label}</span>
                        {postAwardActive && row.selection_status === 'awarded' ? (
                          <button
                            type="button"
                            className="btn status-inline-action-btn"
                            onClick={clearAwardForPackage}
                            disabled={loading}
                            title="Remove award"
                            aria-label="Remove award"
                          >
                            ×
                          </button>
                        ) : null}
                        {!postAwardActive && row.status === 'submitted' ? (
                          <button
                            type="button"
                            className="btn status-inline-action-btn"
                            onClick={() => reopenBid(row.invite_id)}
                            disabled={loading}
                            title="Reopen bid"
                            aria-label="Reopen bid"
                          >
                            ↺
                          </button>
                        ) : null}
                        {!postAwardActive && row.status === 'in_progress' && row.can_reclose ? (
                          <button
                            type="button"
                            className="btn status-inline-action-btn"
                            onClick={() => recloseBid(row)}
                            disabled={loading}
                            title={`Reclose to submitted v${row.current_version || '—'}`}
                            aria-label="Reclose bid"
                          >
                            🔒
                          </button>
                        ) : null}
                      </span>
                      <span className="state-dot-item" title={rowAccessMeta.label}>
                        <span className={`table-state-dot ${rowAccessMeta.toneClass}`} aria-label={rowAccessMeta.label} />
                        <span className="state-dot-label">{rowAccessMeta.label}</span>
                        {row.access_state === 'enabled' ? (
                          <button
                            type="button"
                            className="btn status-inline-action-btn"
                            onClick={() => disableBidder(row.invite_id)}
                            disabled={loading}
                            title="Disable bidder access"
                            aria-label="Disable bidder access"
                          >
                            ⛔
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn status-inline-action-btn"
                            onClick={() => enableBidder(row.invite_id)}
                            disabled={loading}
                            title="Enable bidder access"
                            aria-label="Enable bidder access"
                          >
                            ✓
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="version-cell bidder-version-cell">
                    <span className="bidder-version-line">
                      <span>{row.current_version > 0 ? `v${row.current_version}` : '—'}</span>
                      <button
                        type="button"
                        className="btn status-inline-action-btn"
                        onClick={() => openHistory(row.invite_id)}
                        disabled={loading}
                        title="View bid history"
                        aria-label="View bid history"
                      >
                        🕘
                      </button>
                      <span>· {formatTimestamp(row.submitted_at || row.last_saved_at)}</span>
                    </span>
                  </div>
                </td>
                <td>
                  <div className="bidder-state-cell">
                    <div className="bidder-state-quoted">
                      {`${row.quoted_count ?? 0}/${row.total_requested_count ?? 0} quoted (${row.bod_only_count ?? 0} BoD · ${row.mixed_line_count ?? 0} BoD+Sub · ${row.sub_only_count ?? 0} Sub)`}
                    </div>
                    <div className="bidder-state-pills">
                      <span className={`completion-pill ${(row.completion_pct ?? 0) >= 100 ? 'complete' : 'incomplete'}`}>
                        {`${Math.round(row.completion_pct ?? 0)}% complete`}
                      </span>
                      <span className="completion-pill warning">
                        {`${Math.round(row.bod_skipped_pct ?? 0)}% BoD skipped`}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="num bidder-total-cell">
                  <div className="bidder-total-wrap">
                    <span>{totalLabel(row, { postAwardActive })}</span>
                    <button
                      type="button"
                      className="btn bidder-total-delete-btn"
                      onClick={() => deleteBidderRow(row)}
                      disabled={loading}
                      title="Delete bidder and bid"
                      aria-label="Delete bidder and bid"
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
              )
            })}
            {visibleInviteRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted">
                  {postAwardActive && !showAllBidders ? 'No awarded bidder found.' : 'No invite rows loaded yet.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="action-row bidders-footer-actions">
          <button
            className="btn btn-primary dashboard-compare-btn"
            type="button"
            onClick={() => {
              if (!loadedBidPackageId) return
              navigate(`/comparison?bid_package_id=${encodeURIComponent(String(loadedBidPackageId))}`)
            }}
            disabled={!loadedBidPackageId || loading}
          >
            Compare
          </button>
          {!postAwardActive && !showAddBidderForm ? (
            <button
              className="btn"
              onClick={() => setShowAddBidderForm(true)}
              disabled={!loadedBidPackageId || loading}
            >
              + Bidder
            </button>
          ) : null}
        </div>
        {!postAwardActive && showAddBidderForm ? (
          <div className="invite-inline-row" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
            <label>
              Vendor
              <select value={selectedVendorKey} onChange={(event) => onVendorChange(event.target.value)}>
                <option value="">Select vendor contact</option>
                {vendorOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Password
              <input type="text" value={invitePassword} onChange={(event) => setInvitePassword(event.target.value)} placeholder="Set invite password" />
            </label>
            <div className="invite-inline-action">
              <button className="btn btn-primary" onClick={addInvite} disabled={loading || !dealerName.trim() || !invitePassword || !loadedBidPackageId}>
                Add Bidder
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setShowAddBidderForm(false)}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title={lineItemsSectionTitle}
        actions={
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
                checked={showQtyColumn}
                onChange={(event) => setShowQtyColumn(event.target.checked)}
              />
              Qty/UOM
            </label>
            {postAwardActive ? <span className="action-separator" aria-hidden="true">|</span> : null}
            {postAwardActive ? (
              <label>
                Sort
                <select
                  value={lineItemsSort}
                  onChange={(event) => {
                    setLineItemsSort(event.target.value)
                    setLineItemsPage(1)
                  }}
                >
                  <option value="code_tag">Code/Tag</option>
                  <option value="pending_desc">Needs Attention (Most Pending)</option>
                  <option value="pending_asc">Most Approved (Least Pending)</option>
                </select>
              </label>
            ) : null}
            {postAwardActive && lineItemsSort !== 'code_tag' ? (
              <button
                type="button"
                className="btn icon-btn-subtle"
                onClick={refreshLineItemsSort}
                disabled={loading}
                title="Refresh sort order"
                aria-label="Refresh sort order"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 4v6h-6" />
                  <path d="M4 20v-6h6" />
                  <path d="M20 10a8 8 0 0 0-14-4" />
                  <path d="M4 14a8 8 0 0 0 14 4" />
                </svg>
              </button>
            ) : null}
            {postAwardActive ? <span className="action-separator" aria-hidden="true">|</span> : null}
            {postAwardActive ? (
              <button
                type="button"
                className="btn icon-btn-subtle"
                onClick={clearApprovalsForCurrentVendor}
                disabled={loading || !currentAwardedBidId}
                title="Clear current vendor approvals"
                aria-label="Clear current vendor approvals"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 16.5l6.2-6.2a2 2 0 0 1 2.8 0l1.7 1.7a2 2 0 0 1 0 2.8L12 20.5H7v-4z" />
                  <path d="M14.5 9l1.7-1.7a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L18 12.5" />
                  <path d="M4 20.5h16" />
                </svg>
              </button>
            ) : null}
            {postAwardActive ? <span className="action-separator" aria-hidden="true">|</span> : null}
            <label>
              Rows per page
              <select
                value={lineItemsPerPage}
                onChange={(event) => {
                  const nextSize = Number(event.target.value)
                  setLineItemsPerPage(nextSize)
                  setLineItemsPage(1)
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
          </div>
        }
      >
        {!loadedBidPackageId ? (
          <p className="text-muted">Load a bid package to view line items.</p>
        ) : null}
        <table className="table">
          <thead>
            <tr>
              <th>Code/Tag</th>
              {showProductColumn ? <th>Product</th> : null}
              {showBrandColumn ? <th>Brand</th> : null}
              {showQtyColumn ? <th>Qty/UOM</th> : null}
              {!postAwardActive ? <th>Actions</th> : null}
              {postAwardActive ? requiredApprovalColumns.map((column) => (
                <th key={`line-item-approval-head-${column.key}`}>{column.label}</th>
              )) : null}
              {postAwardActive ? <th>Files</th> : null}
            </tr>
          </thead>
          <tbody>
            {paginatedSpecItems.map((item) => {
              const applicableApprovals = (item.required_approvals || []).filter((requirement) => requirement.applies)
              const hasPendingApprovals = applicableApprovals.some((requirement) => !requirement.approved)
              const allApprovalsComplete = applicableApprovals.length > 0 && !hasPendingApprovals
              const codeTagStatusClass = postAwardActive
                ? (allApprovalsComplete ? 'code-tag-approved' : 'code-tag-pending')
                : ''

              return (
              <tr key={item.id} className={!item.active ? 'spec-item-inactive-row' : ''}>
                <td>
                  <span className={`code-tag-status ${codeTagStatusClass}`.trim()}>{item.code_tag || '—'}</span>
                </td>
                {showProductColumn ? <td>{item.product_name || '—'}</td> : null}
                {showBrandColumn ? <td>{item.brand_name || '—'}</td> : null}
                {showQtyColumn ? <td>{item.quantity || '—'} {item.uom || ''}</td> : null}
                {!postAwardActive ? (
                  <td>
                    {item.active ? (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => removeSpecItem(item)}
                        disabled={loading}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => reactivateItem(item)}
                        disabled={loading}
                      >
                        Re-activate
                      </button>
                    )}
                  </td>
                ) : null}
                {postAwardActive ? (item.required_approvals || []).map((requirement) => {
                  if (!requirement.applies) {
                    return (
                      <td key={`${item.id}-${requirement.key}`} className="approval-cell-na">
                        N/A
                      </td>
                    )
                  }

                  if (requirement.approved) {
                    return (
                      <td key={`${item.id}-${requirement.key}`} className="approval-cell-approved">
                        <div>Approved {formatTimestamp(requirement.approved_at)}</div>
                        <button
                          type="button"
                          className="mini-link-btn"
                          onClick={() => unapproveRequirement(item, requirement.key)}
                          disabled={loading}
                        >
                          Unapprove
                        </button>
                      </td>
                    )
                  }

                  return (
                    <td key={`${item.id}-${requirement.key}`} className="approval-cell-pending">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => approveRequirement(item, requirement.key)}
                        disabled={loading}
                      >
                        Approve
                      </button>
                    </td>
                  )
                }) : null}
                {postAwardActive ? (
                  <td>
                    {(item.uploads || []).length > 0 ? (
                      <div className="action-row" style={{ gap: '0.4rem' }}>
                        <span>{(item.uploads || []).length} file(s)</span>
                        <button
                          type="button"
                          className="btn mini-link-btn"
                          style={{ marginTop: 0 }}
                          onClick={() => setActiveLineItemFilesModal({
                            specItemId: item.id,
                            codeTag: item.code_tag || '—',
                            productName: item.product_name || '—',
                            uploads: item.uploads || []
                          })}
                        >
                          View
                        </button>
                      </div>
                    ) : '—'}
                  </td>
                ) : null}
              </tr>
              )
            })}
            {sortedSpecItems.length === 0 ? (
              <tr>
                <td colSpan={lineItemsBaseColumnCount + lineItemsExtraColumnCount} className="text-muted">
                  No line items in this package.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {loadedBidPackageId ? (
          <div className="action-row" style={{ justifyContent: 'center', marginTop: '0.55rem', alignItems: 'center' }}>
            <button
              className="btn"
              type="button"
              onClick={() => setLineItemsPage((prev) => Math.max(prev - 1, 1))}
              disabled={lineItemsPage <= 1}
            >
              Prev
            </button>
            <span className="text-muted">Page {lineItemsPage} / {totalLineItemsPages}</span>
            <button
              className="btn"
              type="button"
              onClick={() => setLineItemsPage((prev) => Math.min(prev + 1, totalLineItemsPages))}
              disabled={lineItemsPage >= totalLineItemsPages}
            >
              Next
            </button>
          </div>
        ) : null}
      </SectionCard>

      {activeLineItemFilesModal ? (
        <div className="modal-backdrop" onClick={() => setActiveLineItemFilesModal(null)}>
          <div className="modal-card award-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <h2>{`Files · ${activeLineItemFilesModal.codeTag}`}</h2>
              <button className="btn" onClick={() => setActiveLineItemFilesModal(null)}>Close</button>
            </div>
            <p className="text-muted" style={{ marginTop: 0 }}>{activeLineItemFilesModal.productName}</p>
            <table className="table dense">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Uploaded By</th>
                  <th>Uploaded At</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {(activeLineItemFilesModal.uploads || []).map((upload) => (
                  <tr key={`line-item-modal-upload-${upload.id}`}>
                    <td>{upload.file_name || '—'}</td>
                    <td>{upload.uploaded_by || upload.uploader_role || '—'}</td>
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
                {(activeLineItemFilesModal.uploads || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted">No files uploaded yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <SectionCard title="Post-Award Workspace (Lite)">
        {!loadedBidPackageId ? (
          <p className="text-muted">Load a bid package to view post-award workspace details.</p>
        ) : null}
        {loadedBidPackageId && !postAwardActive ? (
          <p className="text-muted">Workspace activates automatically after a vendor is awarded.</p>
        ) : null}
        {loadedBidPackageId && postAwardActive ? (
          <div className="stack">
            <div>
              <h3 style={{ marginBottom: '0.35rem' }}>General Files (Vendor Uploads)</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Note</th>
                    <th>Uploaded By</th>
                    <th>Uploaded At</th>
                  </tr>
                </thead>
                <tbody>
                  {generalUploads.map((upload) => (
                    <tr key={`general-upload-${upload.id}`}>
                      <td>{upload.file_name}</td>
                      <td>{upload.note || '—'}</td>
                      <td>{upload.uploaded_by || upload.uploader_role}</td>
                      <td>{formatTimestamp(upload.uploaded_at)}</td>
                    </tr>
                  ))}
                  {generalUploads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted">No general files uploaded yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="text-muted">Required approvals and per-line-item files are shown in the Line Items In Package table above.</p>
          </div>
        ) : null}
      </SectionCard>

      {historyOpen ? (
        <div className="modal-backdrop" onClick={() => setHistoryOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <h2>Bid Version History</h2>
              <button className="btn" onClick={() => setHistoryOpen(false)}>Close</button>
            </div>

            {historyLoading ? <p className="text-muted">Loading history...</p> : null}

            {!historyLoading && historyData ? (
              <div className="stack">
                <p className="text-muted">
                  {historyData.dealer_name} • Current Version: v{historyData.current_version || 0}
                </p>

                <table className="table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Version</th>
                      <th>Submitted</th>
                      <th>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(historyData.versions || []).map((version) => (
                      <tr key={version.id}>
                        <td>
                          <button className="btn" onClick={() => toggleVersionExpanded(version.id)}>
                            {expandedVersionId === version.id ? 'Hide' : 'View'}
                          </button>
                        </td>
                        <td>v{version.version_number}</td>
                        <td>{formatTimestamp(version.submitted_at)}</td>
                        <td>{money(version.total_amount)}</td>
                      </tr>
                    ))}
                    {(historyData.versions || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-muted">No submitted versions yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>

                {(historyData.versions || [])
                  .filter((version) => expandedVersionId === version.id)
                  .map((version) => (
                    <div key={`snapshot-${version.id}`}>
                      <p className="text-muted">Version v{version.version_number} line items</p>
                      <table className="table">
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
                            <th>Extended Price</th>
                            <th>Lead Time</th>
                            <th>Dealer Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(version.line_items || []).map((line, index) => (
                            <tr key={`${version.id}-${line.spec_item_id || index}`}>
                              <td>{line.code_tag || '—'}</td>
                              <td>{line.product_name || '—'}</td>
                              <td>{line.brand_name || '—'}</td>
                              <td>{line.quantity || '—'} {line.uom || ''}</td>
                              <td>{money(line.unit_list_price ?? line.unit_price)}</td>
                              <td>{line.discount_percent ?? '—'}</td>
                              <td>{line.tariff_percent ?? '—'}</td>
                              <td>{money(line.unit_net_price ?? netUnitPrice(line.unit_list_price ?? line.unit_price, line.discount_percent, line.tariff_percent))}</td>
                              <td>{money(line.extended_price ?? extendedAmount(line.unit_net_price ?? netUnitPrice(line.unit_list_price ?? line.unit_price, line.discount_percent, line.tariff_percent), line.quantity))}</td>
                              <td>{line.lead_time_days ?? '—'}</td>
                              <td>{line.dealer_notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  )
}
