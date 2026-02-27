import { useEffect, useMemo, useState } from 'react'
import SectionCard from '../components/SectionCard'
import { createBidPackage, fetchBidPackages, fetchProjects, importRowsToBidPackage, previewBidPackage } from '../lib/api'

const GENERAL_PRICING_FIELDS = [
  { key: 'delivery_amount', label: 'Shipping' },
  { key: 'install_amount', label: 'Install' },
  { key: 'escalation_amount', label: 'Escalation' },
  { key: 'contingency_amount', label: 'Contingency' },
  { key: 'sales_tax_amount', label: 'Sales Tax' }
]

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
  const [importMode, setImportMode] = useState('create_new')

  const [packageName, setPackageName] = useState(`Spec Import ${formatDateStamp()}`)
  const [projects, setProjects] = useState([])
  const [bidPackages, setBidPackages] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedExistingPackageId, setSelectedExistingPackageId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)

  const [selectedFile, setSelectedFile] = useState(null)
  const [csvContent, setCsvContent] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [instructions, setInstructions] = useState('')
  const [activeGeneralFields, setActiveGeneralFields] = useState(GENERAL_PRICING_FIELDS.map((field) => field.key))

  const [previewResult, setPreviewResult] = useState(null)
  const [previewErrors, setPreviewErrors] = useState([])
  const [createResult, setCreateResult] = useState(null)

  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      setLoadingProjects(true)
      try {
        const [projectData, packageData] = await Promise.all([fetchProjects(), fetchBidPackages()])
        const projectList = projectData.projects || []
        const packageList = packageData.bid_packages || []

        setProjects(projectList)
        setBidPackages(packageList)

        if (projectList.length > 0) {
          setSelectedProjectId(String(projectList[0].id))
        }
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setLoadingProjects(false)
      }
    }

    loadData()
  }, [])

  const filteredExistingPackages = useMemo(
    () => bidPackages.filter((pkg) => String(pkg.project_id) === String(selectedProjectId)),
    [bidPackages, selectedProjectId]
  )

  useEffect(() => {
    if (importMode !== 'add_existing') return

    if (!filteredExistingPackages.length) {
      setSelectedExistingPackageId('')
      return
    }

    if (!filteredExistingPackages.some((pkg) => String(pkg.id) === String(selectedExistingPackageId))) {
      setSelectedExistingPackageId(String(filteredExistingPackages[0].id))
    }
  }, [filteredExistingPackages, importMode, selectedExistingPackageId])

  const canPreview = useMemo(() => csvContent && selectedProjectId, [csvContent, selectedProjectId])
  const canCreate = useMemo(
    () => importMode === 'create_new' && canPreview && previewResult?.valid && packageName && selectedProjectId,
    [canPreview, importMode, previewResult, packageName, selectedProjectId]
  )
  const canAddToExisting = useMemo(
    () => importMode === 'add_existing' && canPreview && previewResult?.valid && selectedExistingPackageId,
    [canPreview, importMode, previewResult, selectedExistingPackageId]
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

  const handleModeChange = (mode) => {
    setImportMode(mode)
    setPreviewResult(null)
    setPreviewErrors([])
    setCreateResult(null)
    setStatusMessage('')
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
        sourceProfile: 'designer_pages',
        visibility,
        activeGeneralFields,
        instructions
      })
      setCreateResult(result)
      setStatusMessage(`Bid package ${result.bid_package.id} created with ${result.imported_items_count} items.`)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToExistingPackage = async () => {
    if (!canAddToExisting || !selectedFile) return

    setLoading(true)
    setStatusMessage('Adding rows to existing bid package...')

    try {
      const result = await importRowsToBidPackage({
        bidPackageId: selectedExistingPackageId,
        sourceFilename: selectedFile.name,
        csvContent,
        sourceProfile: 'designer_pages'
      })
      setCreateResult(result)
      setStatusMessage(`Added ${result.imported_items_count} items to package #${result.bid_package.id}.`)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stack">
      <SectionCard title="Import Bid Package">
        <div className="import-mode-tabs" role="tablist" aria-label="Import mode">
          <button
            className={`import-mode-tab ${importMode === 'create_new' ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={importMode === 'create_new'}
            onClick={() => handleModeChange('create_new')}
          >
            Create New Bid Package
          </button>
          <button
            className={`import-mode-tab ${importMode === 'add_existing' ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={importMode === 'add_existing'}
            onClick={() => handleModeChange('add_existing')}
          >
            Add to Existing Bid Package
          </button>
        </div>

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
          {importMode === 'create_new' ? (
            <>
              <label>
                Bid Package Name
                <input value={packageName} onChange={(event) => setPackageName(event.target.value)} placeholder="Furniture Package A" />
              </label>
              <label>
                Visibility
                <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label>
                Instructions
                <textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  rows={3}
                  placeholder="Optional bidder instructions"
                />
              </label>
            </>
          ) : (
            <label>
              Existing Bid Package
              <select
                value={selectedExistingPackageId}
                onChange={(event) => setSelectedExistingPackageId(event.target.value)}
                disabled={!selectedProjectId || filteredExistingPackages.length === 0}
              >
                {filteredExistingPackages.length === 0 ? <option value="">No bid packages for this project</option> : null}
                {filteredExistingPackages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {importMode === 'create_new' ? (
          <div className="checkbox-grid">
            <p className="text-muted" style={{ margin: 0 }}>Include General Pricing Fields</p>
            {GENERAL_PRICING_FIELDS.map((field) => (
              <label key={field.key} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={activeGeneralFields.includes(field.key)}
                  onChange={(event) => {
                    setActiveGeneralFields((prev) => {
                      if (event.target.checked) return [...prev, field.key]
                      return prev.filter((key) => key !== field.key)
                    })
                  }}
                />
                {field.label}
              </label>
            ))}
          </div>
        ) : null}

        <label className="dropzone">
          <input type="file" accept=".csv,text/csv" onChange={handleFilePick} style={{ display: 'none' }} />
          {selectedFile ? `Selected: ${selectedFile.name}` : 'Choose CSV file'}
        </label>

        <div className="action-row" style={{ marginBottom: '0.75rem' }}>
          <button className="btn" onClick={handlePreview} disabled={!canPreview || loading}>Preview CSV</button>
          {importMode === 'create_new' ? (
            <button className="btn btn-primary" onClick={handleCreatePackage} disabled={!canCreate || loading}>
              Create Bid Package
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleAddToExistingPackage} disabled={!canAddToExisting || loading}>
              Add to Existing Package
            </button>
          )}
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
