import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import { fetchPublicBidPackage } from '../lib/api'

export default function PublicBidPackagePage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [statusMessage, setStatusMessage] = useState('Loading bid package...')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const payload = await fetchPublicBidPackage(token)
        if (!active) return
        setData(payload.bid_package)
        setStatusMessage('')
      } catch (error) {
        if (!active) return
        setStatusMessage(error.message)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [token])

  return (
    <div className="stack vendor-bid-page">
      <SectionCard title={data?.project_name ? `${data.project_name}: ${data.name}` : (data?.name || 'Public Bid Package')}>
        {String(data?.instructions || '').trim() ? (
          <p className="public-readonly-banner">{data.instructions}</p>
        ) : null}
      </SectionCard>

      <SectionCard title="Line Items">
        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
        <table className="table dense vendor-line-table">
          <thead>
            <tr>
              <th>Code/Tag</th>
              <th>Product</th>
              <th>Brand Name</th>
              <th>Category</th>
              <th>Qty/UOM</th>
            </tr>
          </thead>
          <tbody>
            {(data?.line_items || []).map((row) => (
              <tr key={row.spec_item_id}>
                <td>{row.code_tag || '—'}</td>
                <td>{row.product_name || '—'}</td>
                <td>{row.brand_name || '—'}</td>
                <td>{row.category || '—'}</td>
                <td>{row.quantity || '—'} {row.uom || ''}</td>
              </tr>
            ))}
            {(data?.line_items || []).length === 0 && !statusMessage ? (
              <tr>
                <td colSpan={5} className="text-muted">No line items available.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
