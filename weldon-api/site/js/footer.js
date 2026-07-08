/* Shows the current gate combination bottom-right in the footer.
   The endpoint is behind the gate, so only people already inside see it,
   and it always reflects the live GATE_CODE. */
(async function () {
  const el = document.querySelector('[data-gate-hint]');
  if (!el) return;
  try {
    const r = await fetch('/api/gate-hint');
    if (r.ok) el.textContent = (await r.json()).code;
  } catch {}
})();
