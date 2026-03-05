export default function SectionCard({ title, actions, children, className = '' }) {
  const classes = ['section-card', className].filter(Boolean).join(' ')
  const showHeader = Boolean(title) || Boolean(actions)
  return (
    <section className={classes}>
      {showHeader ? (
        <header className="section-head">
          <h2>{title}</h2>
          <div className="section-actions">{actions}</div>
        </header>
      ) : null}
      {children}
    </section>
  )
}
