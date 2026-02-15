import { useEffect, useMemo, useState } from 'react'
import SectionCard from '../components/SectionCard'
import { createInvite, fetchBidPackageDashboard, fetchBidPackages } from '../lib/api'

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

export default function PackageDashboardPage() {
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState('')
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [rows, setRows] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [copiedInviteId, setCopiedInviteId] = useState(null)

  const [dealerName, setDealerName] = useState('')
  const [dealerEmail, setDealerEmail] = useState('')
  const [invitePassword, setInvitePassword] = useState('')

  useEffect(() => {
    const loadBidPackages = async () => {
      setLoadingPackages(true)
      try {
        const data = await fetchBidPackages()
        const list = data.bid_packages || []
        setBidPackages(list)
        if (list.length > 0) {
          const firstId = String(list[0].id)
          setSelectedBidPackageId(firstId)
        }
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setLoadingPackages(false)
      }
    }

    loadBidPackages()
  }, [])

  const loadedPackageLabel = useMemo(() => {
    if (!loadedBidPackageId) return ''
    const match = bidPackages.find((item) => String(item.id) === String(loadedBidPackageId))
    return match ? `${match.name} (#${match.id})` : `#${loadedBidPackageId}`
  }, [bidPackages, loadedBidPackageId])

  const loadDashboard = async () => {
    if (!selectedBidPackageId) return

    setLoading(true)
    setStatusMessage('Loading bid package...')
    try {
      const data = await fetchBidPackageDashboard(selectedBidPackageId)
      setRows(data.invites || [])
      setLoadedBidPackageId(String(selectedBidPackageId))
      setStatusMessage(`Loaded ${data.invites?.length || 0} invites.`)
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
      await createInvite({
        bidPackageId: loadedBidPackageId,
        dealerName: dealerName.trim(),
        dealerEmail: dealerEmail.trim(),
        password: invitePassword
      })
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
                <option key={pkg.id} value={pkg.id}>{pkg.name} (#{pkg.id})</option>
              ))}
            </select>
          </label>
        </div>

        <div className="action-row">
          <button className="btn btn-primary" onClick={loadDashboard} disabled={!selectedBidPackageId || loading || loadingPackages}>
            Load Bid Package
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
            Bidder Name
            <input value={dealerName} onChange={(event) => setDealerName(event.target.value)} placeholder="Workplace Source" />
          </label>
          <label>
            Bidder Email
            <input value={dealerEmail} onChange={(event) => setDealerEmail(event.target.value)} placeholder="bids@example.com" />
          </label>
          <label>
            Password
            <input type="password" value={invitePassword} onChange={(event) => setInvitePassword(event.target.value)} placeholder="Set invite password" />
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
              <th>Last Saved</th>
              <th>Submitted</th>
              <th>Invite Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.invite_id}>
                <td>{row.dealer_name}</td>
                <td>{row.dealer_email || '—'}</td>
                <td><span className={`pill ${statusClass(row.status)}`}>{row.status}</span></td>
                <td>{formatTimestamp(row.last_saved_at)}</td>
                <td>{formatTimestamp(row.submitted_at)}</td>
                <td>
                  <div className="invite-link-cell">
                    <code>{row.invite_url}</code>
                    <button className="btn" onClick={() => copyInviteLink(row)}>
                      {copiedInviteId === row.invite_id ? 'Copied' : 'Copy Link'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted">No invite rows loaded yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
