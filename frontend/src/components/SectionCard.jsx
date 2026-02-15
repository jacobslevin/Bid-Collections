export default function SectionCard({ title, actions, children }) {
  return (
    <section className="section-card">
      <header className="section-head">
        <h2>{title}</h2>
        <div className="section-actions">{actions}</div>
      </header>
      {children}
    </section>
  )
}
