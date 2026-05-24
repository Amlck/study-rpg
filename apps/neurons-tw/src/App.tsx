export default function App() {
  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.25rem', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
        neurons-tw — Long-term Potentiation Edition
      </h1>
      <p style={{ marginTop: 0, color: '#5a3f29' }}>
        <strong>Scaffold stage.</strong> Game logic, content (neuron families on a Linnean
        phylogenetic taxonomy), sprites, gacha, leaderboard, achievements, and cloud sync land in
        follow-up OpenSpec changes. See the umbrella capability spec at{' '}
        <code>openspec/specs/neurons-mode/spec.md</code> for the design contract.
      </p>
      <p style={{ color: '#5a3f29' }}>
        <em>Neurons that fire together, wire together.</em> — Donald Hebb
      </p>
    </main>
  )
}
