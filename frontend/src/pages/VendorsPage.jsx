import SectionCard from '../components/SectionCard'
import vendors from '../data/vendors.json'

export default function VendorsPage() {
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
            {vendors.map((vendor, index) => (
              <tr key={`${vendor['Email Address'] || vendor['Contact Name'] || 'vendor'}-${index}`}>
                <td>{vendor['Company Name'] || '—'}</td>
                <td>{vendor['Contact Name'] || '—'}</td>
                <td>{vendor['Email Address'] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}

