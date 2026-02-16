import { useEffect, useState } from 'react'
import SectionCard from '../components/SectionCard'
import { createProject, deleteProject, fetchProjects } from '../lib/api'

export default function ProjectsPage() {
  const [projectName, setProjectName] = useState('')
  const [projects, setProjects] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const loadProjects = async () => {
    try {
      const data = await fetchProjects()
      setProjects(data.projects || [])
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const handleCreateProject = async () => {
    if (!projectName.trim()) return

    setLoading(true)
    setStatusMessage('Creating project...')
    try {
      await createProject({ name: projectName.trim() })
      setProjectName('')
      setStatusMessage('Project created.')
      await loadProjects()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProject = async (project) => {
    const confirmed = window.confirm(
      `Delete project "${project.name}"?\n\nThis will also delete all bid packages and invites under this project.`
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting project...')
    try {
      await deleteProject(project.id)
      setStatusMessage('Project deleted.')
      await loadProjects()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stack">
      <SectionCard title="Projects">
        <div className="form-grid">
          <label>
            Project
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Hospital Renovation - East Wing" />
          </label>
        </div>
        <div className="action-row">
          <button className="btn btn-primary" onClick={handleCreateProject} disabled={loading || !projectName.trim()}>
            Create Project
          </button>
        </div>
        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
      </SectionCard>

      <SectionCard title="Existing Projects">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Project</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>{project.id}</td>
                <td>{project.name}</td>
                <td>
                  <button className="btn btn-danger" onClick={() => handleDeleteProject(project)} disabled={loading}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {projects.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-muted">No projects yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
