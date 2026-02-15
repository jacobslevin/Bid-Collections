import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import { fetchDealerBid, saveDealerBid, submitDealerBid } from '../lib/api'

function formatTimestamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function DealerBidPage() {
  const { token } = useParams()

  const [rows, setRows] = useState([])
  const [bidState, setBidState] = useState('draft')
  const [submittedAt, setSubmittedAt] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [statusMessage, setStatusMessage] = useState('Loading bid...')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function loadBid() {
      setLoading(true)
      try {
        const result = await fetchDealerBid(token)
        if (!active) return

        setRows(result.bid?.line_items || [])
        setBidState(result.bid?.state || 'draft')
        setSubmittedAt(result.bid?.submitted_at || null)
        setStatusMessage('Bid loaded.')
      } catch (error) {
        if (!active) return
        setStatusMessage(error.message)
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    loadBid()
    return () => {
      active = false
    }
  }, [token])

  const updateRow = (index, key, value) => {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const buildLineItemPayload = () => {
    return rows.map((row) => ({
      spec_item_id: row.spec_item_id,
      unit_price: row.unit_price,
      lead_time_days: row.lead_time_days,
      dealer_notes: row.dealer_notes
    }))
  }

  const saveDraftRequest = async () => {
    const result = await saveDealerBid(token, buildLineItemPayload())
    setBidState(result.state || 'draft')
    setLastSavedAt(result.updated_at || null)
    return result
  }

  const handleSaveDraft = async () => {
    if (bidState === 'submitted') return

    setLoading(true)
    setStatusMessage('Saving draft...')

    try {
      await saveDraftRequest()
      setStatusMessage('Draft saved.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (bidState === 'submitted') return

    setLoading(true)
    setStatusMessage('Submitting bid...')

    try {
      await saveDraftRequest()
      const result = await submitDealerBid(token)
      setBidState('submitted')
      setSubmittedAt(result.submitted_at || null)
      setStatusMessage('Bid submitted. This bid is now locked.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stack">
      <SectionCard
        title="Dealer Bid Entry"
        actions={
          bidState === 'submitted' ? null : (
            <div className="action-row">
              <button className="btn" onClick={handleSaveDraft} disabled={loading}>Save Draft</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>Submit Final</button>
            </div>
          )
        }
      >
        <p className="text-muted">State: {bidState}</p>
        <p className="text-muted">Last saved: {formatTimestamp(lastSavedAt)}</p>
        <p className="text-muted">Submitted: {formatTimestamp(submittedAt)}</p>
        <p className="text-muted">{statusMessage}</p>
      </SectionCard>

      <SectionCard title="Line Items">
        <table className="table dense">
          <thead>
            <tr>
              <th>Code/Tag</th>
              <th>Product</th>
              <th>Qty/UOM</th>
              <th>Unit Price</th>
              <th>Lead Time (days)</th>
              <th>Dealer Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.spec_item_id}>
                <td>{row.sku || '—'}</td>
                <td>{row.product_name || '—'}</td>
                <td>{row.quantity || '—'} {row.uom || ''}</td>
                <td>
                  <input
                    value={row.unit_price ?? ''}
                    onChange={(event) => updateRow(index, 'unit_price', event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
                <td>
                  <input
                    value={row.lead_time_days ?? ''}
                    onChange={(event) => updateRow(index, 'lead_time_days', event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
                <td>
                  <input
                    value={row.dealer_notes ?? ''}
                    onChange={(event) => updateRow(index, 'dealer_notes', event.target.value)}
                    disabled={bidState === 'submitted'}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted">No line items loaded.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
