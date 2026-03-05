import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import { deleteBidPackage, fetchBidPackages, updateBidPackage } from '../lib/api'

const GENERAL_PRICING_FIELDS = [
  { key: 'delivery_amount', label: 'Shipping' },
  { key: 'install_amount', label: 'Install' },
  { key: 'escalation_amount', label: 'Escalation' },
  { key: 'contingency_amount', label: 'Contingency' },
  { key: 'sales_tax_amount', label: 'Sales Tax' }
]

function formatCreatedDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function packageStatusLabel(pkg) {
  if (pkg?.awarded_bid_id) return 'Approvals'
  return 'Bidding'
}

function packageDisplayName(pkg) {
  const packageName = String(pkg?.name || '').trim()
  return packageName || 'Untitled Bid Package'
}

export default function PackageListPage() {
  const navigate = useNavigate()
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({
    name: '',
    visibility: 'private',
    instructions: '',
    activeGeneralFields: GENERAL_PRICING_FIELDS.map((f) => f.key)
  })

  const loadPackages = async () => {
    setLoading(true)
    try {
      const payload = await fetchBidPackages()
      setPackages(payload.bid_packages || [])
      setStatusMessage('')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPackages()
  }, [])

  const startEdit = (pkg) => {
    setEditingId(pkg.id)
    setDraft({
      name: pkg.name || '',
      visibility: pkg.visibility || 'private',
      instructions: pkg.instructions || '',
      activeGeneralFields: pkg.active_general_fields || GENERAL_PRICING_FIELDS.map((f) => f.key)
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setLoading(true)
    setStatusMessage('Saving package...')
    try {
      await updateBidPackage({
        bidPackageId: editingId,
        name: draft.name.trim(),
        visibility: draft.visibility,
        instructions: draft.instructions,
        activeGeneralFields: draft.activeGeneralFields
      })
      setEditingId(null)
      await loadPackages()
    } catch (error) {
      setStatusMessage(error.message)
      setLoading(false)
    }
  }

  const removePackage = async (pkg) => {
    const confirmed = window.confirm(`Delete bid package "${pkg.name}"?`)
    if (!confirmed) return
    setLoading(true)
    setStatusMessage('Deleting package...')
    try {
      await deleteBidPackage(pkg.id)
      if (editingId === pkg.id) setEditingId(null)
      await loadPackages()
    } catch (error) {
      setStatusMessage(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="stack">
      <SectionCard className="section-card-flat bidders-flat">
        <div className="package-list-header">
          <h2>Bid Packages</h2>
          <p className="text-muted">These are the bid packages for your project.</p>
        </div>

        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}

        <div className="package-list-grid">
          {packages.map((pkg) => (
            <div key={pkg.id} className="package-list-card package-list-card-compact">
              <div className="package-list-card-row">
                <div className="package-list-left">
                  <div className="package-list-card-meta">
                    <span className={`package-status-dot ${pkg.awarded_bid_id ? 'is-awarded' : 'is-progress'}`} />
                    <span>{packageStatusLabel(pkg)}</span>
                  </div>
                  <div className="package-list-title-wrap">
                    <span className="package-list-title-icon" aria-hidden="true">◌</span>
                    <div className="package-list-card-title">{packageDisplayName(pkg)}</div>
                  </div>
                </div>
                <div className="package-list-right">
                  <div className="package-list-card-subline">
                    {`Created on ${formatCreatedDate(pkg.created_at || pkg.imported_at)} • ${pkg.spec_item_count ?? 0} Specs • ${pkg.invite_count ?? 0} Bidders`}
                  </div>
                  <div className="package-list-card-actions">
                    <button className="btn package-list-edit-btn" onClick={() => startEdit(pkg)} disabled={loading} title="Edit package">✎</button>
                    <button className="btn btn-primary package-list-view-btn" onClick={() => navigate(`/package/${pkg.id}`)} disabled={loading}>View</button>
                  </div>
                </div>
              </div>

              {editingId === pkg.id ? (
                <div className="package-list-edit-grid">
                  <label>
                    Package Name
                    <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
                  </label>
                  <label>
                    Visibility
                    <select value={draft.visibility} onChange={(event) => setDraft((prev) => ({ ...prev, visibility: event.target.value }))}>
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                  <label className="package-list-edit-span">
                    Instructions
                    <input value={draft.instructions} onChange={(event) => setDraft((prev) => ({ ...prev, instructions: event.target.value }))} />
                  </label>
                  <div className="package-list-general-fields package-list-edit-span">
                    <p>General Pricing Fields</p>
                    <div className="package-list-general-fields-row">
                      {GENERAL_PRICING_FIELDS.map((field) => (
                        <label key={field.key} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={draft.activeGeneralFields.includes(field.key)}
                            onChange={(event) => {
                              setDraft((prev) => {
                                if (event.target.checked) {
                                  if (prev.activeGeneralFields.includes(field.key)) return prev
                                  return { ...prev, activeGeneralFields: [...prev.activeGeneralFields, field.key] }
                                }
                                return {
                                  ...prev,
                                  activeGeneralFields: prev.activeGeneralFields.filter((key) => key !== field.key)
                                }
                              })
                            }}
                          />
                          {field.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="action-row package-list-edit-actions">
                    <button className="btn btn-primary" onClick={saveEdit} disabled={loading || !draft.name.trim()}>Save</button>
                    <button className="btn" onClick={() => setEditingId(null)} disabled={loading}>Cancel</button>
                    <button className="btn btn-danger" onClick={() => removePackage(pkg)} disabled={loading}>Delete</button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {packages.length === 0 ? <p className="text-muted">No bid packages yet.</p> : null}
        </div>
      </SectionCard>
    </div>
  )
}
