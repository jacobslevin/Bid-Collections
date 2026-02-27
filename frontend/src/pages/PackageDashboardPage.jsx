import { useEffect, useMemo, useState } from 'react'
import SectionCard from '../components/SectionCard'
import {
  bulkDeleteInvites,
  bulkDisableInvites,
  bulkEnableInvites,
  bulkReopenInvites,
  createInvite,
  deactivateSpecItem,
  reactivateSpecItem,
  disableInvite,
  deleteBidPackage,
  deleteInvite,
  enableInvite,
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

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function statusClass(status) {
  if (status === 'submitted') return 'ok'
  if (status === 'in_progress') return 'warn'
  return 'muted'
}

function formatTimestamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
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
  return listPrice * (1 - (discount / 100)) * (1 + (tariff / 100))
}

export default function PackageDashboardPage() {
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState('')
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [rows, setRows] = useState([])
  const [specItems, setSpecItems] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [copiedInviteId, setCopiedInviteId] = useState(null)
  const [openActionMenuInviteId, setOpenActionMenuInviteId] = useState(null)
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyData, setHistoryData] = useState(null)
  const [expandedVersionId, setExpandedVersionId] = useState(null)
  const [passwordDrafts, setPasswordDrafts] = useState({})
  const [savingPasswordByInviteId, setSavingPasswordByInviteId] = useState({})
  const [loadedPackageSettings, setLoadedPackageSettings] = useState(null)
  const [packageNameDraft, setPackageNameDraft] = useState('')
  const [visibilityDraft, setVisibilityDraft] = useState('private')
  const [instructionsDraft, setInstructionsDraft] = useState('')
  const [activeGeneralFieldsDraft, setActiveGeneralFieldsDraft] = useState(GENERAL_PRICING_FIELDS.map((field) => field.key))
  const [editingBidPackage, setEditingBidPackage] = useState(false)

  const [dealerName, setDealerName] = useState('')
  const [dealerEmail, setDealerEmail] = useState('')
  const [selectedVendorKey, setSelectedVendorKey] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [selectedInviteIds, setSelectedInviteIds] = useState([])
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
        setRows([])
        setSpecItems([])
        return
      }

      if (preserveSelectedId) {
        const hasSelected = list.some((item) => String(item.id) === String(selectedBidPackageId))
        if (hasSelected) return
      }

      setSelectedBidPackageId(String(list[0].id))
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
      const invites = data.invites || []
      const activeSpecItems = data.spec_items || []
      const bidPackage = data.bid_package || null
      setRows(invites)
      setSpecItems(activeSpecItems)
      setSelectedInviteIds([])
      setBulkActionsOpen(false)
      setLoadedPackageSettings(bidPackage)
      setPackageNameDraft(bidPackage?.name || '')
      setVisibilityDraft(bidPackage?.visibility || 'private')
      setInstructionsDraft(bidPackage?.instructions || '')
      setActiveGeneralFieldsDraft(bidPackage?.active_general_fields || GENERAL_PRICING_FIELDS.map((field) => field.key))
      if (closeEdit) setEditingBidPackage(false)
      setPasswordDrafts(
        invites.reduce((acc, invite) => {
          acc[invite.invite_id] = invite.invite_password || ''
          return acc
        }, {})
      )
      setLoadedBidPackageId(String(selectedBidPackageId))
      setStatusMessage('')
    } catch (error) {
      setStatusMessage(error.message)
      setRows([])
      setSpecItems([])
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
      setStatusMessage('No password found for this invite. Use Edit Password first.')
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

  const editInvitePassword = async (row) => {
    if (!loadedBidPackageId) return
    const inviteId = row.invite_id
    const newPassword = (passwordDrafts[inviteId] ?? '').trim()
    if (!newPassword) {
      setStatusMessage('Password cannot be blank.')
      return
    }

    setLoading(true)
    setSavingPasswordByInviteId((prev) => ({ ...prev, [inviteId]: true }))
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
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
      setSavingPasswordByInviteId((prev) => ({ ...prev, [inviteId]: false }))
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

  const removeInvite = async (row) => {
    if (!loadedBidPackageId) return

    const confirmed = window.confirm(`Delete invite for ${row.dealer_name}?\n\nThis will remove the invite and any associated bid data.`)
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting invite...')
    try {
      await deleteInvite({ bidPackageId: loadedBidPackageId, inviteId: row.invite_id })
      setStatusMessage('Invite deleted.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const disableBidder = async (row) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Disabling bidder...')
    try {
      await disableInvite({ bidPackageId: loadedBidPackageId, inviteId: row.invite_id })
      setStatusMessage('Bidder disabled.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const enableBidder = async (row) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Enabling bidder...')
    try {
      await enableInvite({ bidPackageId: loadedBidPackageId, inviteId: row.invite_id })
      setStatusMessage('Bidder enabled.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const bulkDisableBidders = async () => {
    if (!loadedBidPackageId || selectedInviteIds.length === 0) return
    setLoading(true)
    setStatusMessage('Disabling bidders...')
    try {
      await bulkDisableInvites({ bidPackageId: loadedBidPackageId, inviteIds: selectedInviteIds })
      setStatusMessage('Bidders disabled.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const bulkEnableBidders = async () => {
    if (!loadedBidPackageId || selectedInviteIds.length === 0) return
    setLoading(true)
    setStatusMessage('Enabling bidders...')
    try {
      await bulkEnableInvites({ bidPackageId: loadedBidPackageId, inviteIds: selectedInviteIds })
      setStatusMessage('Bidders enabled.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const bulkReopenBids = async () => {
    if (!loadedBidPackageId || selectedInviteIds.length === 0) return

    const confirmed = window.confirm(
      `Reopen bids for ${selectedInviteIds.length} selected bidder(s)?\n\nOnly submitted bids will be reopened.`
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Reopening selected bids...')
    try {
      const result = await bulkReopenInvites({ bidPackageId: loadedBidPackageId, inviteIds: selectedInviteIds })
      const reopenedCount = (result.reopened_ids || []).length
      const skippedCount = (result.skipped_ids || []).length
      setStatusMessage(`Reopened ${reopenedCount} bid(s).${skippedCount > 0 ? ` Skipped ${skippedCount} bid(s) that were not submitted.` : ''}`)
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const bulkDeleteBidders = async () => {
    if (!loadedBidPackageId || selectedInviteIds.length === 0) return

    const confirmed = window.confirm(
      `Delete ${selectedInviteIds.length} selected bidder(s) and associated bids?\n\nThis action cannot be undone.`
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting selected bidders...')
    try {
      const result = await bulkDeleteInvites({ bidPackageId: loadedBidPackageId, inviteIds: selectedInviteIds })
      const deletedCount = (result.deleted_ids || []).length
      setStatusMessage(`Deleted ${deletedCount} bidder(s) and associated bids.`)
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handleDocClick = (event) => {
      if (event.target.closest('.invite-actions-menu-wrap')) return
      setOpenActionMenuInviteId(null)
      setBulkActionsOpen(false)
    }
    document.addEventListener('click', handleDocClick)
    return () => document.removeEventListener('click', handleDocClick)
  }, [])

  const allSelected = rows.length > 0 && selectedInviteIds.length === rows.length
  const anySelected = selectedInviteIds.length > 0

  const toggleInviteSelected = (inviteId) => {
    setSelectedInviteIds((prev) => (
      prev.includes(inviteId)
        ? prev.filter((id) => id !== inviteId)
        : [...prev, inviteId]
    ))
  }

  const toggleAllSelected = () => {
    setSelectedInviteIds((prev) => (
      prev.length === rows.length ? [] : rows.map((row) => row.invite_id)
    ))
  }

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

            <SectionCard title="Line Items In Package">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code/Tag</th>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Qty/UOM</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {specItems.map((item) => (
                    <tr key={item.id} className={!item.active ? 'spec-item-inactive-row' : ''}>
                      <td>{item.code_tag || '—'}</td>
                      <td>{item.product_name || '—'}</td>
                      <td>{item.brand_name || '—'}</td>
                      <td>{item.quantity || '—'} {item.uom || ''}</td>
                      <td>{item.active ? 'Active' : 'Removed'}</td>
                      <td>
                        {item.active ? (
                          <button className="btn btn-danger" onClick={() => removeSpecItem(item)} disabled={loading}>
                            Deactivate
                          </button>
                        ) : (
                          <button className="btn" onClick={() => reactivateItem(item)} disabled={loading}>
                            Re-activate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {specItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted">No line items in this package.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </SectionCard>
          </div>
        ) : null}

        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
      </SectionCard>

      <SectionCard title="Invite Bidders">
        {loadedPackageLabel ? (
          <p className="text-muted">Loaded bid package: {loadedPackageLabel}</p>
        ) : (
          <p className="text-muted">Load a bid package first, then add bidders.</p>
        )}

        <div className="invite-inline-row">
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
              Add Bidder Invite
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Invites">
        {anySelected ? (
          <div className="action-row" style={{ marginBottom: '0.6rem' }}>
            <span className="text-muted">{selectedInviteIds.length} selected</span>
            <div className="invite-actions-menu-wrap">
              <button
                className="btn"
                onClick={(event) => {
                  event.stopPropagation()
                  setBulkActionsOpen((prev) => !prev)
                }}
                disabled={loading || !loadedBidPackageId}
              >
                Bulk Actions
              </button>
              {bulkActionsOpen ? (
                <div className="invite-actions-menu">
                  <button className="btn invite-actions-item" onClick={() => { bulkReopenBids(); setBulkActionsOpen(false) }}>
                    Reopen Selected Bids
                  </button>
                  <button className="btn invite-actions-item" onClick={() => { bulkEnableBidders(); setBulkActionsOpen(false) }}>
                    Enable Selected
                  </button>
                  <button className="btn invite-actions-item invite-actions-delete" onClick={() => { bulkDisableBidders(); setBulkActionsOpen(false) }}>
                    Disable Selected
                  </button>
                  <button className="btn invite-actions-item invite-actions-delete" onClick={() => { bulkDeleteBidders(); setBulkActionsOpen(false) }}>
                    Delete Selected Bidders &amp; Bids
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <table className="table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAllSelected}
                  disabled={rows.length === 0}
                  aria-label="Select all invites"
                />
              </th>
              <th>Dealer</th>
              <th>Email</th>
              <th>Status</th>
              <th>Access</th>
              <th>Current Version</th>
              <th>Last Saved</th>
              <th>Submitted</th>
              <th>Password</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.invite_id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedInviteIds.includes(row.invite_id)}
                    onChange={() => toggleInviteSelected(row.invite_id)}
                    aria-label={`Select ${row.dealer_name}`}
                  />
                </td>
                <td>{row.dealer_name}</td>
                <td>{row.dealer_email || '—'}</td>
                <td><span className={`pill ${statusClass(row.status)}`}>{row.status}</span></td>
                <td><span className={`pill ${row.access_state === 'disabled' ? 'muted' : 'ok'}`}>{row.access_state || 'enabled'}</span></td>
                <td>
                  <div className="version-cell">
                    <span>{row.current_version > 0 ? `v${row.current_version}` : '—'}</span>
                    {row.can_reclose ? (
                      <button className="btn version-action-btn" onClick={() => recloseBid(row)} disabled={loading}>
                        Reclose &amp; Lock
                      </button>
                    ) : null}
                  </div>
                </td>
                <td>{formatTimestamp(row.last_saved_at)}</td>
                <td>{formatTimestamp(row.submitted_at)}</td>
                <td>
                  <input
                    type="text"
                    value={passwordDrafts[row.invite_id] ?? ''}
                    onChange={(event) => {
                      const value = event.target.value
                      setPasswordDrafts((prev) => ({ ...prev, [row.invite_id]: value }))
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      editInvitePassword(row)
                    }}
                    placeholder="Set password"
                    disabled={Boolean(savingPasswordByInviteId[row.invite_id])}
                  />
                </td>
                <td>
                  <div className="invite-actions-menu-wrap">
                    <button
                      className="btn invite-actions-menu-trigger"
                      onClick={(event) => {
                        event.stopPropagation()
                        setOpenActionMenuInviteId((prev) => (prev === row.invite_id ? null : row.invite_id))
                      }}
                    >
                      ...
                    </button>
                    {openActionMenuInviteId === row.invite_id ? (
                      <div className="invite-actions-menu">
                        <button className="btn invite-actions-item" onClick={() => { openHistory(row.invite_id); setOpenActionMenuInviteId(null) }}>
                          History
                        </button>
                        {row.status === 'submitted' ? (
                          <button className="btn invite-actions-item" onClick={() => { reopenBid(row.invite_id); setOpenActionMenuInviteId(null) }}>
                            Reopen
                          </button>
                        ) : null}
                        {row.can_reclose ? (
                          <button className="btn invite-actions-item" onClick={() => { recloseBid(row); setOpenActionMenuInviteId(null) }}>
                            Reclose (Use v{row.current_version})
                          </button>
                        ) : null}
                        <button className="btn invite-actions-item" onClick={() => { copyInviteLink(row); setOpenActionMenuInviteId(null) }}>
                          {copiedInviteId === row.invite_id ? 'Copied' : 'Copy Invite Link'}
                        </button>
                        <button className="btn invite-actions-item" onClick={() => { emailInvite(row); setOpenActionMenuInviteId(null) }}>
                          Email
                        </button>
                        {row.access_state === 'disabled' ? (
                          <button className="btn invite-actions-item" onClick={() => { enableBidder(row); setOpenActionMenuInviteId(null) }}>
                            Enable Bidder
                          </button>
                        ) : (
                          <button className="btn invite-actions-item invite-actions-delete" onClick={() => { disableBidder(row); setOpenActionMenuInviteId(null) }}>
                            Disable Bidder
                          </button>
                        )}
                        <button className="btn invite-actions-item invite-actions-delete" onClick={() => { removeInvite(row); setOpenActionMenuInviteId(null) }}>
                          Delete Bidder &amp; Bid
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-muted">No invite rows loaded yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
