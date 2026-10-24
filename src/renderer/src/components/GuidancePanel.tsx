/** Placeholder until M3 adds event detection and next-step rules. */
export function GuidancePanel() {
  return (
    <section className="panel guidance-panel" aria-labelledby="guidance-heading">
      <h2 id="guidance-heading">Guidance</h2>
      <p className="muted">
        After each command, GitPilot will explain what happened and suggest next steps (M3).
      </p>
    </section>
  );
}
