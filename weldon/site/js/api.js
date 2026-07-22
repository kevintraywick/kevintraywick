/* Backend client for 160 Weldon. Degrades gracefully when no API is running
   (e.g. the site served statically) — pages check WAPI.ok before enabling forms. */
(function () {
  const BASE = '/api';
  let ok = null;

  async function health() {
    if (ok !== null) return ok;
    try {
      const r = await fetch(BASE + '/health', { signal: AbortSignal.timeout(3000) });
      ok = r.ok;
    } catch { ok = false; }
    return ok;
  }

  async function get(path) {
    const r = await fetch(BASE + path);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function post(path, body) {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  }

  async function patch(path, body) {
    const r = await fetch(BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  }

  async function del(path) {
    const r = await fetch(BASE + path, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  }

  async function upload(path, file, extra) {
    const fd = new FormData();
    fd.append('file', file);
    for (const k in (extra || {})) fd.append(k, extra[k]);
    const r = await fetch(BASE + path, { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  }

  /* Wire a drop zone: element with class .dz containing an <input type=file>.
     onFiles(files) is called for drops and picker selections. The file input
     itself is display:none (can't be tabbed to), so the wrapper needs its own
     keyboard path — role=button + tabindex + Enter/Space open the same picker. */
  function wireDropZone(el, onFiles) {
    const input = el.querySelector('input[type="file"]');
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    el.addEventListener('click', () => input && input.click());
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input && input.click(); }
    });
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('drag');
      if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
    });
    if (input) input.addEventListener('change', () => {
      if (input.files.length) onFiles([...input.files]);
      input.value = '';
    });
  }

  window.WAPI = { health, get, post, patch, del, upload, wireDropZone };
})();
