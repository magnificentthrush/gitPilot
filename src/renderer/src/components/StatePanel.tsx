const AREAS = ['Working tree', 'Staging area', 'Commits', 'Remote'] as const;

/** Placeholder until M2 adds the repository inspector. */
export function StatePanel() {
  return (
    <section className="panel state-panel" aria-labelledby="state-heading">
      <h2 id="state-heading">Repository state</h2>
      {AREAS.map((area) => (
        <div className="state-area" key={area}>
          <h3>{area}</h3>
          <p className="muted">Available in M2</p>
        </div>
      ))}
    </section>
  );
}
