import SectionCard from '../components/SectionCard'
import { projects } from '../data/mockData'

export default function ProjectsPage() {
  return (
    <SectionCard title="Projects" actions={<button className="btn">New Project</button>}>
      <table className="table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Bid Packages</th>
            <th>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td>{project.name}</td>
              <td>{project.packages}</td>
              <td>{project.lastActivity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  )
}
