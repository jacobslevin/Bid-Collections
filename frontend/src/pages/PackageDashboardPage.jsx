import { useEffect, useMemo, useState } from 'react'
import SectionCard from '../components/SectionCard'
import {
  createInvite,
  deleteBidPackage,
  deleteInvite,
  fetchBidPackageDashboard,
  fetchBidPackages,
  fetchInviteHistory,
  reopenInviteBid,
  updateInvitePassword
} from '../lib/api'
import vendors from '../data/vendors.json'

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
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [copiedInviteId, setCopiedInviteId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyData, setHistoryData] = useState(null)
  const [expandedVersionId, setExpandedVersionId] = useState(null)
  const [passwordDrafts, setPasswordDrafts] = useState({})
  const [savingPasswordByInviteId, setSavingPasswordByInviteId] = useState({})

  const [dealerName, setDealerName] = useState('')
  const [dealerEmail, setDealerEmail] = useState('')
  const [selectedVendorKey, setSelectedVendorKey] = useState('')
  const [invitePassword, setInvitePassword] = useState('')

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

  const loadDashboard = async () => {
    if (!selectedBidPackageId) return

    setLoading(true)
    setStatusMessage('Loading bid package...')
    try {
      const data = await fetchBidPackageDashboard(selectedBidPackageId)
      const invites = data.invites || []
      setRows(invites)
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
      }
      await loadBidPackages(false)
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
          <button className="btn btn-danger" onClick={removeBidPackage} disabled={!selectedBidPackageId || loading || loadingPackages}>
            Delete Bid Package
          </button>
        </div>

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
        <table className="table">
          <thead>
            <tr>
              <th>Dealer</th>
              <th>Email</th>
              <th>Status</th>
              <th>Current Version</th>
              <th>Last Saved</th>
              <th>Submitted</th>
              <th>Password</th>
              <th>Actions</th>
              <th>Invite Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.invite_id}>
                <td>{row.dealer_name}</td>
                <td>{row.dealer_email || '—'}</td>
                <td><span className={`pill ${statusClass(row.status)}`}>{row.status}</span></td>
                <td>{row.current_version > 0 ? `v${row.current_version}` : '—'}</td>
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
                  <div className="action-row">
                    <button className="btn" onClick={() => openHistory(row.invite_id)}>
                      History
                    </button>
                    {row.status === 'submitted' ? (
                      <button className="btn" onClick={() => reopenBid(row.invite_id)}>
                        Reopen
                      </button>
                    ) : null}
                    <button className="btn btn-danger" onClick={() => removeInvite(row)}>
                      Delete
                    </button>
                  </div>
                </td>
                <td>
                  <div className="invite-link-cell">
                    <code>{row.invite_url}</code>
                    <button className="btn" onClick={() => copyInviteLink(row)}>
                      {copiedInviteId === row.invite_id ? 'Copied' : 'Copy Link'}
                    </button>
                    <button className="btn" onClick={() => emailInvite(row)}>
                      Email
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-muted">No invite rows loaded yet.</td>
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
