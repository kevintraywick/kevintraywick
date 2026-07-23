export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 py-2 pr-3 pointer-events-none flex items-center justify-end gap-2 text-xs text-gray-400">
      <a
        href="/cc"
        aria-label="cc"
        className="pointer-events-auto w-5 h-5 rounded-full block"
        style={{ background: '#999', opacity: 0.4 }}
      />
      <span className="pointer-events-auto">
        © 2026 ❤️k{' '}
        <a
          href="https://notermsnoconditions.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600"
        >
          Terms of Use
        </a>
      </span>
      <a
        href="/me"
        aria-label="me"
        className="pointer-events-auto w-5 h-5 rounded-full block"
        style={{ background: '#5af', opacity: 0.4 }}
      />
    </footer>
  )
}
