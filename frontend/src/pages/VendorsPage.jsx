import { useMemo } from 'react'
import SectionCard from '../components/SectionCard'
import { buildVendorDirectory, loadCustomVendorRecords } from '../lib/vendorDirectory'

export default function VendorsPage() {
  const vendorRecords = useMemo(() => buildVendorDirectory(loadCustomVendorRecords()), [])

  return (
    <div className="stack">
      <SectionCard title="Vendors">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Contact</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {vendorRecords.map((vendor) => (
              <tr key={vendor.id}>
                <td>{vendor.companyName || '—'}</td>
                <td>{vendor.contactName || (vendor.source === 'custom' ? vendor.email || '—' : '—')}</td>
                <td>{vendor.email || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
