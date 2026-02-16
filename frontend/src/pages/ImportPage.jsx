import { useEffect, useMemo, useState } from 'react'
import SectionCard from '../components/SectionCard'
import { createBidPackage, fetchProjects, previewBidPackage } from '../lib/api'

function formatDateStamp() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Unable to read selected file'))
    reader.readAsText(file)
  })
}

export default function ImportPage() {
  const [packageName, setPackageName] = useState(`Spec Import ${formatDateStamp()}`)
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)

  const [selectedFile, setSelectedFile] = useState(null)
  const [csvContent, setCsvContent] = useState('')

  const [previewResult, setPreviewResult] = useState(null)
  const [previewErrors, setPreviewErrors] = useState([])
  const [createResult, setCreateResult] = useState(null)

  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadProjects = async () => {
      setLoadingProjects(true)
      try {
        const data = await fetchProjects()
        const list = data.projects || []
        setProjects(list)
        if (list.length > 0) {
          setSelectedProjectId(String(list[0].id))
        }
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setLoadingProjects(false)
      }
    }

    loadProjects()
  }, [])

  const canPreview = useMemo(() => csvContent && selectedProjectId, [csvContent, selectedProjectId])
  const canCreate = useMemo(
    () => canPreview && previewResult?.valid && packageName && selectedProjectId,
    [canPreview, previewResult, packageName, selectedProjectId]
  )

  const handleFilePick = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setCreateResult(null)
    setPreviewResult(null)
    setPreviewErrors([])
    setStatusMessage('Reading CSV...')

    try {
      const content = await readFileText(file)
      setCsvContent(content)
      setStatusMessage('CSV loaded. Ready to preview.')
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const handlePreview = async () => {
    if (!canPreview) return

    setLoading(true)
    setStatusMessage('Previewing import...')
    setCreateResult(null)

    try {
      const result = await previewBidPackage({
        projectId: selectedProjectId,
        csvContent,
        sourceProfile: 'designer_pages'
      })
      setPreviewResult(result)
      setPreviewErrors([])
      setStatusMessage(`Preview ready: ${result.row_count} rows.`)
    } catch (error) {
      const message = error.message || 'Preview failed'
      setStatusMessage(message)
      setPreviewErrors(error.details?.errors || [message])

      setPreviewResult({ valid: false, row_count: 0, source_profile: 'designer_pages', sample_rows: [] })
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePackage = async () => {
    if (!canCreate || !selectedFile) return

    setLoading(true)
    setStatusMessage('Creating bid package...')

    try {
      const result = await createBidPackage({
        projectId: selectedProjectId,
        name: packageName,
        sourceFilename: selectedFile.name,
        csvContent,
        sourceProfile: 'designer_pages'
      })
      setCreateResult(result)
      setStatusMessage(`Bid package ${result.bid_package.id} created with ${result.imported_items_count} items.`)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stack">
      <SectionCard title="Import Bid Package">
        <div className="form-grid">
          <label>
            Project Name
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              disabled={loadingProjects}
            >
              {projects.length === 0 ? <option value="">No projects yet</option> : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label>
            Bid Package Name
            <input value={packageName} onChange={(event) => setPackageName(event.target.value)} placeholder="Furniture Package A" />
          </label>
        </div>

        <label className="dropzone">
          <input type="file" accept=".csv,text/csv" onChange={handleFilePick} style={{ display: 'none' }} />
          {selectedFile ? `Selected: ${selectedFile.name}` : 'Choose CSV file'}
        </label>

        <div className="action-row" style={{ marginBottom: '0.75rem' }}>
          <button className="btn" onClick={handlePreview} disabled={!canPreview || loading}>Preview CSV</button>
          <button className="btn btn-primary" onClick={handleCreatePackage} disabled={!canCreate || loading}>
            Create Bid Package
          </button>
        </div>

        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
        {createResult ? (
          <p className="text-muted">Created Package #{createResult.bid_package.id}</p>
        ) : null}

        {previewErrors.length > 0 ? (
          <div className="error-box">
            <strong>Validation Errors</strong>
            <ul>
              {previewErrors.slice(0, 25).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Preview Rows">
        <table className="table">
          <thead>
            <tr>
              <th>Code/Tag</th>
              <th>Product</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Qty/UOM</th>
            </tr>
          </thead>
          <tbody>
            {(previewResult?.sample_rows || []).map((row, index) => (
              <tr key={`${row.spec_item_id || row.sku || 'row'}-${index}`}>
                <td>{row.sku || '—'}</td>
                <td>{row.product_name || '—'}</td>
                <td>{row.manufacturer || '—'}</td>
                <td>{row.category || '—'}</td>
                <td>
                  {row.quantity || '—'} {row.uom || ''}
                </td>
              </tr>
            ))}
            {(previewResult?.sample_rows || []).length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted">Run preview to view parsed rows.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
