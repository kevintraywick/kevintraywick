/* Minimal SVG charts for 160 Weldon. No dependencies. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function fmtUSD(v, dp) {
    if (v == null) return '—';
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: dp == null ? 0 : dp, maximumFractionDigits: dp == null ? 0 : dp });
  }

  function axisFmt(gv) {
    if (gv >= 1000) {
      const k = Math.round(gv / 100) / 10;
      return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
    }
    return '$' + Math.round(gv);
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function makeTooltip(container) {
    const t = document.createElement('div');
    t.className = 'tooltip';
    container.appendChild(t);
    return t;
  }

  function legend(container, series) {
    const lg = document.createElement('div');
    lg.className = 'legend';
    const seen = {};
    series.forEach(s => {
      if (seen[s.name]) return; // history + projection pairs share a name — one legend entry
      seen[s.name] = true;
      const item = document.createElement('span');
      item.className = 'lg';
      const swatch = s.dash
        ? 'background:repeating-linear-gradient(90deg,' + s.color + ' 0 5px,transparent 5px 8px)'
        : 'background:' + s.color;
      item.innerHTML = '<i style="' + swatch + '"></i>' + s.name;
      lg.appendChild(item);
    });
    container.appendChild(lg);
  }

  /* Multi-series line chart with crosshair + tooltip.
     opts: { labels:[], series:[{name,color,values:[num|null]}], height } */
  function lineChart(container, opts) {
    container.classList.add('chart');
    const W = 720, H = opts.height || 260;
    const P = { t: 14, r: 14, b: 26, l: 50 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'line chart' }, null);
    container.appendChild(svg);

    const n = opts.labels.length;
    const all = opts.series.flatMap(s => s.values).filter(v => v != null);
    const max = niceMax(Math.max(...all, 1) * 1.08);
    const x = i => P.l + (n === 1 ? 0 : (i * (W - P.l - P.r) / (n - 1)));
    const y = v => H - P.b - (v / max) * (H - P.t - P.b);

    // grid + y labels (recessive)
    for (let g = 0; g <= 3; g++) {
      const gv = max * g / 3;
      el('line', { x1: P.l, x2: W - P.r, y1: y(gv), y2: y(gv), class: 'gridline' }, svg);
      el('text', { x: P.l - 7, y: y(gv) + 4, 'text-anchor': 'end', class: 'axis-label' }, svg)
        .textContent = axisFmt(gv);
    }
    // x labels — sparse by default, or exactly the indices the caller asks for
    if (opts.labelIndices) {
      opts.labelIndices.forEach(i => {
        el('text', { x: x(i), y: H - 7, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = opts.labels[i];
      });
    } else {
      const step = Math.max(1, Math.ceil(n / 8));
      for (let i = 0; i < n; i += step) {
        el('text', { x: x(i), y: H - 7, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = opts.labels[i];
      }
    }

    // lines (2px), gaps where data is null
    opts.series.forEach(s => {
      let d = '', pen = false;
      s.values.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        pen = true;
      });
      if (d) {
        const attrs = { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
        if (s.dash) attrs['stroke-dasharray'] = '7 6'; // dashed = estimate, not a recorded number
        el('path', attrs, svg);
      }
      // lone points (no neighbors) still visible
      s.values.forEach((v, i) => {
        if (v == null) return;
        const lone = (s.values[i - 1] == null) && (s.values[i + 1] == null);
        if (lone) el('circle', { cx: x(i), cy: y(v), r: 3.5, fill: s.color }, svg);
      });
    });

    // hover layer
    const cross = el('line', { y1: P.t, y2: H - P.b, class: 'crosshair', opacity: 0 }, svg);
    const dots = opts.series.map(s => el('circle', { r: 4.5, fill: s.color, stroke: 'var(--card)', 'stroke-width': 2, opacity: 0 }, svg));
    const tt = makeTooltip(container);

    function nearest(evX) {
      const rect = svg.getBoundingClientRect();
      const px = (evX - rect.left) / rect.width * W;
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    function show(i) {
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
      let rows = '';
      const seen = {};
      opts.series.forEach((s, si) => {
        const v = s.values[i];
        if (v == null) { dots[si].setAttribute('opacity', 0); }
        else { dots[si].setAttribute('cx', x(i)); dots[si].setAttribute('cy', y(v)); dots[si].setAttribute('opacity', 1); }
        if (v == null && opts.hideNullRows) return;
        if (seen[s.name]) return; // history/projection pairs: show whichever has a value first
        if (v != null || !opts.series.some(o => o !== s && o.name === s.name && o.values[i] != null)) {
          seen[s.name] = true;
          rows += '<div class="tt-row"><i style="background:' + s.color + '"></i>' + s.name +
            '<span class="v">' + fmtUSD(v, 2) + '</span></div>';
        }
      });
      tt.innerHTML = '<div class="tt-title">' + opts.labels[i] + '</div>' + rows;
      const rect = svg.getBoundingClientRect();
      const leftPx = x(i) / W * rect.width;
      tt.style.left = Math.max(70, Math.min(rect.width - 70, leftPx)) + 'px';
      tt.style.top = '-6px';
      tt.classList.add('on');
    }
    function hide() {
      cross.setAttribute('opacity', 0);
      dots.forEach(d => d.setAttribute('opacity', 0));
      tt.classList.remove('on');
    }
    svg.addEventListener('mousemove', e => show(nearest(e.clientX)));
    svg.addEventListener('mouseleave', hide);
    svg.addEventListener('touchstart', e => { if (e.touches[0]) show(nearest(e.touches[0].clientX)); }, { passive: true });

    if (opts.series.length > 1) legend(container, opts.series);
  }

  /* Vertical bars (single or stacked). Rounded 4px cap on the top segment,
     2px surface gap between segments and bars.
     opts: { labels:[], series:[{name,color,values:[]}], height, fmt } */
  function barChart(container, opts) {
    container.classList.add('chart');
    const W = 720, H = opts.height || 240;
    const P = { t: 14, r: 8, b: 26, l: 50 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'bar chart' }, null);
    container.appendChild(svg);

    const n = opts.labels.length;
    const totals = opts.labels.map((_, i) => opts.series.reduce((a, s) => a + (s.values[i] || 0), 0));
    const max = niceMax(Math.max(...totals, 1) * 1.08);
    const innerW = W - P.l - P.r;
    const slot = innerW / n;
    const bw = Math.min(34, Math.max(6, slot - 2)); // ≥2px gap between bars
    const y = v => H - P.b - (v / max) * (H - P.t - P.b);

    for (let g = 0; g <= 3; g++) {
      const gv = max * g / 3;
      el('line', { x1: P.l, x2: W - P.r, y1: y(gv), y2: y(gv), class: 'gridline' }, svg);
      el('text', { x: P.l - 7, y: y(gv) + 4, 'text-anchor': 'end', class: 'axis-label' }, svg)
        .textContent = axisFmt(gv);
    }
    const step = Math.max(1, Math.ceil(n / 10));
    for (let i = 0; i < n; i += step) {
      el('text', { x: P.l + slot * i + slot / 2, y: H - 7, 'text-anchor': 'middle', class: 'axis-label' }, svg).textContent = opts.labels[i];
    }

    function roundedTopPath(cx, yTop, yBot, w, r) {
      const x0 = cx - w / 2, x1 = cx + w / 2;
      r = Math.min(r, (yBot - yTop), w / 2);
      if (yBot - yTop < 1) return '';
      return `M${x0} ${yBot} L${x0} ${yTop + r} Q${x0} ${yTop} ${x0 + r} ${yTop} L${x1 - r} ${yTop} Q${x1} ${yTop} ${x1} ${yTop + r} L${x1} ${yBot} Z`;
    }

    const hitcols = [];
    for (let i = 0; i < n; i++) {
      const cx = P.l + slot * i + slot / 2;
      let acc = 0;
      opts.series.forEach((s, si) => {
        const v = s.values[i] || 0;
        if (v <= 0) return;
        const isTop = opts.series.slice(si + 1).every(s2 => !(s2.values[i] > 0));
        const yb = y(acc) - (si > 0 && acc > 0 ? 2 : 0); // 2px gap between stacked segments
        const yt = y(acc + v);
        if (isTop) {
          const d = roundedTopPath(cx, yt, yb, bw, 4);
          if (d) el('path', { d, fill: s.color }, svg);
        } else {
          if (yb - yt > 0.5) el('rect', { x: cx - bw / 2, y: yt, width: bw, height: Math.max(0.5, yb - yt), fill: s.color }, svg);
        }
        acc += v;
      });
      hitcols.push({ i, x: P.l + slot * i, w: slot });
    }

    const tt = makeTooltip(container);
    const hl = el('rect', { y: P.t, height: H - P.t - P.b, fill: 'rgba(38,36,31,.05)', opacity: 0, 'pointer-events': 'none' }, svg);
    function show(i) {
      hl.setAttribute('x', P.l + slot * i); hl.setAttribute('width', slot); hl.setAttribute('opacity', 1);
      let rows = '';
      if (opts.series.length > 1) {
        opts.series.forEach(s => {
          rows += '<div class="tt-row"><i style="background:' + s.color + '"></i>' + s.name +
            '<span class="v">' + fmtUSD(s.values[i] || 0, 0) + '</span></div>';
        });
        rows += '<div class="tt-row">Total<span class="v">' + fmtUSD(totals[i], 0) + '</span></div>';
      } else {
        rows = '<div class="tt-row"><i style="background:' + opts.series[0].color + '"></i>' +
          (opts.series[0].name || '') + '<span class="v">' + fmtUSD(totals[i], 2) + '</span></div>';
      }
      tt.innerHTML = '<div class="tt-title">' + opts.labels[i] + '</div>' + rows;
      const rect = svg.getBoundingClientRect();
      const leftPx = (P.l + slot * i + slot / 2) / W * rect.width;
      tt.style.left = Math.max(70, Math.min(rect.width - 70, leftPx)) + 'px';
      tt.style.top = '-6px';
      tt.classList.add('on');
    }
    function hide() { hl.setAttribute('opacity', 0); tt.classList.remove('on'); }
    svg.addEventListener('mousemove', e => {
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width * W;
      const i = Math.max(0, Math.min(n - 1, Math.floor((px - P.l) / slot)));
      show(i);
    });
    svg.addEventListener('mouseleave', hide);

    if (opts.series.length > 1) legend(container, opts.series);
  }

  /* Horizontal category bars, direct-labeled. items: [{label, value, color}] */
  function hBars(container, items, opts) {
    opts = opts || {};
    const max = Math.max(...items.map(i => i.value), 1);
    const wrap = document.createElement('div');
    wrap.className = 'hbars';
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'hbar';
      row.innerHTML =
        '<span class="hb-label">' + it.label + '</span>' +
        '<span class="hb-track"><span class="hb-fill" style="width:' + (it.value / max * 100).toFixed(1) + '%;background:' + it.color + '"></span></span>' +
        '<span class="hb-val">' + fmtUSD(it.value, opts.dp == null ? 0 : opts.dp) + '</span>';
      wrap.appendChild(row);
    });
    container.appendChild(wrap);
  }

  window.WCharts = { lineChart, barChart, hBars, fmtUSD };
})();
