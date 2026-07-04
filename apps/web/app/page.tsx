export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <p style={{ fontSize: '4rem', margin: 0 }} aria-hidden>
        皆伝
      </p>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, letterSpacing: '0.02em' }}>
        Kaiden
      </h1>
      <p style={{ margin: 0, color: '#9aa3ad', maxWidth: '28rem' }}>
        9-kyū → 1-kyū → 1-dan → … → 皆伝. The climb starts here.
      </p>
      <p style={{ margin: 0, color: '#5c6670', fontSize: '0.85rem' }}>M0 skeleton</p>
    </main>
  );
}
