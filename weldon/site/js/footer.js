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

/* Turns the Maintenance nav link red site-wide when a task is overdue —
   runs on every page so it's visible before you'd ever click into it. */
(async function () {
  const link = document.querySelector('.navlink[href="maintenance.html"]');
  if (!link) return;
  try {
    const r = await fetch('/api/maintenance');
    if (!r.ok) return;
    const tasks = await r.json();
    const today = new Date().toISOString().slice(0, 10);
    const overdue = tasks.some(t => !t.done_at && t.due_date && t.due_date < today);
    if (overdue) link.classList.add('overdue');
  } catch {}
})();
