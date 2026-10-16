// Signature intro engine shared by the homepage prototypes.
//
// One continuous pen stroke: a hairline enters from the left edge, curves into
// the first letter, writes the whole name, and leaves from the last letter out to
// the right edge — a single timeline at a steady hand speed. Plays once on load.
// Afterwards, moving the pointer across the name throws off particle bursts.
//
// How the pen knows where to go: the name is rasterized offscreen and thinned to
// a one-pixel skeleton (Zhang–Suen). Each connected piece is walked depth-first
// from its leftmost to its rightmost point, so the pen runs roughly the way a hand
// would. That walk is drawn as a fat stroke inside an SVG mask, which uncovers the
// real font glyphs — so the ink is exactly the typeface, written along its spine.
//
// URL params (for review): ?font=<fontsource slug> swaps the font,
// ?at=<ms> freezes the intro at that moment, ?sweep fakes a pointer pass.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---- skeleton ------------------------------------------------------------
  // Returns the pen's strokes in font units at size F (origin on the baseline),
  // plus the half-width of the thick parts so the mask brush covers them.
  const F = 200, PAD = 8;

  function skeletonize(otf, name) {
    const path = otf.getPath(name, 0, 0, F);
    const bb = path.getBoundingBox();
    const w = Math.ceil(bb.x2 - bb.x1) + PAD * 2, h = Math.ceil(bb.y2 - bb.y1) + PAD * 2;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.translate(PAD - bb.x1, PAD - bb.y1);
    cx.fill(new Path2D(path.toPathData(3)));
    const px = cx.getImageData(0, 0, w, h).data;
    const g = new Uint8Array(w * h);
    for (let i = 0; i < g.length; i++) g[i] = px[i * 4 + 3] > 110 ? 1 : 0;

    const dt = chamfer(g, w, h);
    thin(g, w, h);

    const N8 = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
    const comp = new Int32Array(w * h).fill(-1);
    const comps = [];
    for (let i = 0; i < g.length; i++) {
      if (!g[i] || comp[i] >= 0) continue;
      const list = [i];
      comp[i] = comps.length;
      for (let k = 0; k < list.length; k++)
        for (const o of N8) {
          const n = list[k] + o;
          if (g[n] && comp[n] < 0) { comp[n] = comps.length; list.push(n); }
        }
      comps.push(list);
    }

    const half = [];
    for (const list of comps) for (const i of list) half.push(dt[i] / 3);
    half.sort((a, b) => a - b);
    const halfWidth = half.length ? half[Math.floor(half.length * 0.92)] : 4;

    const X = i => i % w, Y = i => (i / w) | 0;
    const visited = new Uint8Array(w * h), onPath = new Uint8Array(w * h);
    const next = new Int32Array(w * h).fill(-1), pred = new Int32Array(w * h).fill(-1);
    const pieces = [];

    for (const list of comps) {
      // Enter at the left, leave at the right — but favour points near the
      // baseline, so the lines join a letter's foot, not the top of a k's loop.
      const baseRow = PAD - bb.y1;
      const lean = i => 0.7 * Math.abs(Y(i) - baseRow);
      let start = list[0], end = list[0];
      for (const i of list) {
        if (X(i) + lean(i) < X(start) + lean(start)) start = i;
        if (X(i) - lean(i) > X(end) - lean(end)) end = i;
      }
      // Shortest route start→end. The walk keeps to it last at every fork, so
      // the piece finishes at its right end, ready to move on to the next letter.
      const par = new Map([[start, -1]]);
      const q = [start];
      for (let k = 0; k < q.length && !par.has(end); k++)
        for (const o of N8) {
          const n = q[k] + o;
          if (g[n] && !par.has(n)) { par.set(n, q[k]); q.push(n); }
        }
      for (let n = end; n !== -1 && par.has(n); n = par.get(n)) {
        onPath[n] = 1;
        const p = par.get(n);
        if (p !== -1) next[p] = n;
      }

      const strokes = [];
      let cur = [start];
      const stack = [start];
      visited[start] = 1;
      while (stack.length) {
        const p = stack[stack.length - 1];
        // Heading: from a few pixels back, so forks prefer the straightest way on.
        let b = p;
        for (let k = 0; k < 4 && pred[b] >= 0; k++) b = pred[b];
        const hx = X(p) - X(b), hy = Y(p) - Y(b), hl = Math.hypot(hx, hy) || 1;
        let best = -1, bestScore = Infinity;
        for (const o of N8) {
          const n = p + o;
          if (!g[n] || visited[n]) continue;
          if (onPath[n] && !(onPath[p] && next[p] === n)) continue;
          const dx = X(n) - X(p), dy = Y(n) - Y(p);
          const score = -(hx * dx + hy * dy) / (hl * Math.hypot(dx, dy)) + (onPath[n] ? 10 : 0);
          if (score < bestScore) { bestScore = score; best = n; }
        }
        if (best < 0) {
          stack.pop();
          if (cur && cur.length > 1) strokes.push(cur);
          cur = null;
          continue;
        }
        if (!cur) cur = [p];
        visited[best] = 1;
        pred[best] = p;
        cur.push(best);
        stack.push(best);
      }
      if (!strokes.length) strokes.push([start, start]); // a dot

      const toFont = i => [X(i) + 0.5 - PAD + bb.x1, Y(i) + 0.5 - PAD + bb.y1];
      pieces.push({
        startX: X(start),
        endPt: toFont(end),
        endScore: X(end) - lean(end),
        strokes: strokes.map(s => smooth(s.filter((_, k) => k % 2 === 0 || k === s.length - 1).map(toFont))),
      });
    }
    pieces.sort((a, b) => a.startX - b.startX);
    return { pieces, halfWidth };
  }

  function smooth(pts) {
    if (pts.length < 3) return pts;
    return pts.map((p, k) => {
      if (k === 0 || k === pts.length - 1) return p;
      const a = pts[k - 1], c = pts[k + 1];
      return [(a[0] + 2 * p[0] + c[0]) / 4, (a[1] + 2 * p[1] + c[1]) / 4];
    });
  }

  // 3-4 chamfer distance to the nearest background pixel (divide by 3 for px).
  function chamfer(g, w, h) {
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = g[i] ? 1e9 : 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i - 1] + 3, d[i - w] + 3, d[i - w - 1] + 4, d[i - w + 1] + 4);
    }
    for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i + 1] + 3, d[i + w] + 3, d[i + w + 1] + 4, d[i + w - 1] + 4);
    }
    return d;
  }

  // Zhang–Suen thinning, in place.
  function thin(g, w, h) {
    const del = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!g[i]) continue;
          const p2 = g[i - w], p3 = g[i - w + 1], p4 = g[i + 1], p5 = g[i + w + 1],
                p6 = g[i + w], p7 = g[i + w - 1], p8 = g[i - 1], p9 = g[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) +
                    (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
          del.push(i);
        }
        for (const i of del) g[i] = 0;
        if (del.length) changed = true;
      }
    }
  }

  function cubic(p0, c1, c2, p1, n = 24) {
    const out = [];
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
                u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]]);
    }
    return out;
  }

  function heading(pts, fromEnd) {
    const a = fromEnd ? pts[Math.max(0, pts.length - 6)] : pts[0];
    const b = fromEnd ? pts[pts.length - 1] : pts[Math.min(pts.length - 1, 5)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }

  // ---- page ----------------------------------------------------------------
  window.Signature = async function (opts) {
    const o = Object.assign({
      name: 'Kevin Traywick',
      font: 'great-vibes',
      ink: '#111',
      lineWidth: 1.1,
      duration: 6000,         // whole stroke, edge to edge
      particles: 'ink',       // ink | gold | ember
      label: '',
    }, opts);

    const params = new URLSearchParams(location.search);
    const font = sigFontBySlug(params.get('font')) || sigFontBySlug(o.font);
    const freezeAt = params.has('at') ? +params.get('at') : null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = o.duration;

    const h1 = document.createElement('h1');
    h1.className = 'sr-only';
    h1.textContent = o.name;
    document.body.appendChild(h1);

    const svg = el('svg', { class: 'sig-stage', 'aria-hidden': 'true' });
    document.body.appendChild(svg);
    const canvas = document.createElement('canvas');
    canvas.className = 'sig-particles';
    document.body.appendChild(canvas);

    toolbar(o, font);

    let otf, skel;
    try {
      otf = opentype.parse(await (await fetch(sigFontUrl(font))).arrayBuffer());
      skel = skeletonize(otf, o.name);
    } catch (e) {
      // Font CDN down: show the name plainly rather than a blank page.
      console.error(e);
      h1.className = 'sig-fallback';
      return;
    }

    let scene = null;       // geometry + element handles for the current layout
    let ready = false;      // particles only once the name is fully written
    let raf = 0;

    function build() {
      const W = innerWidth, H = innerHeight;
      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

      // Fit the name to a target width (fonts differ wildly in natural width),
      // but never let it get taller than ~30% of the viewport.
      let bb = otf.getPath(o.name, 0, 0, F).getBoundingBox();
      const size = F * Math.min(Math.min(W * (W < 700 ? 0.82 : 0.56), 860) / (bb.x2 - bb.x1), H * 0.3 / (bb.y2 - bb.y1));
      const s = size / F;
      const x0 = W / 2 - (bb.x1 + bb.x2) / 2 * s;
      const y = Math.round(H / 2 - (bb.y1 + bb.y2) / 2 * s) + 0.5; // baseline, crisp hairline
      const at = ([fx, fy]) => [x0 + fx * s, y + fy * s];

      // The pen's route, as segments on one timeline. 'air' = pen lifted between
      // letters (moves on, draws nothing).
      const segs = [];
      const add = (type, pts) => {
        const cum = [0];
        for (let k = 1; k < pts.length; k++)
          cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
        const len = cum[cum.length - 1];
        segs.push({ type, pts, cum, len, cost: len * (type === 'air' ? 0.35 : 1) });
      };

      const strokes = skel.pieces.flatMap(p => p.strokes.map(st => st.map(at)));
      const first = strokes[0];
      const lastPiece = skel.pieces.reduce((a, b) => (b.endScore > a.endScore ? b : a));
      const exit = at(lastPiece.endPt);

      // In: straight along the baseline, then a curve that arrives already
      // heading the way the first stroke sets off.
      const p0 = first[0], h0 = heading(first, false);
      const dIn = clamp(Math.abs(p0[1] - y) * 1.6 + 30, 40, 160);
      const kneeIn = [Math.max(0, p0[0] - dIn), y];
      add('line', [[0, y], kneeIn, ...cubic(kneeIn, [kneeIn[0] + dIn * 0.5, y], [p0[0] - h0[0] * dIn * 0.4, p0[1] - h0[1] * dIn * 0.4], p0)]);

      strokes.forEach((st, k) => {
        if (k > 0) {
          const prev = strokes[k - 1], a = prev[prev.length - 1];
          add('air', [a, st[0]]);
        }
        add('ink', st);
      });

      // Out: from the name's rightmost tip (pen glides there if the last thing
      // written was an i-dot), curving down to the baseline and off the edge.
      const lastStroke = strokes[strokes.length - 1], lastPt = lastStroke[lastStroke.length - 1];
      if (Math.hypot(lastPt[0] - exit[0], lastPt[1] - exit[1]) > 2) add('air', [lastPt, exit]);
      const hN = Math.hypot(lastPt[0] - exit[0], lastPt[1] - exit[1]) > 2 ? [1, 0] : heading(lastStroke, true);
      const dOut = clamp(Math.abs(exit[1] - y) * 1.6 + 30, 40, 160);
      const kneeOut = [Math.min(W, exit[0] + dOut), y];
      add('line', [exit, ...cubic(exit, [exit[0] + hN[0] * dOut * 0.4, exit[1] + hN[1] * dOut * 0.4], [kneeOut[0] - dOut * 0.5, y], kneeOut), [W, y]]);

      let acc = 0;
      for (const sg of segs) { sg.at = acc; acc += sg.cost; }
      const C = acc;

      const defs = el('defs', {}, svg);
      const mask = el('mask', { id: 'inkMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
      const brush = el('g', { fill: 'none', stroke: '#fff', 'stroke-width': 2 * (skel.halfWidth + 1.5) * s,
                              'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mask);
      // Final catch-up: the whole glyph fades fully in as the pen leaves, so
      // nothing the brush grazed is left half-revealed.
      const settleFill = otf.getPath(o.name, x0, y, size).toPathData(2);
      const settle = el('path', { d: settleFill, fill: '#fff', 'fill-opacity': 0 }, mask);
      el('path', { d: settleFill, fill: o.ink, mask: 'url(#inkMask)' }, svg);

      const d = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
      for (const sg of segs) {
        if (sg.type === 'air') continue;
        const parent = sg.type === 'ink' ? brush : svg;
        const attrs = sg.type === 'ink' ? {} : { fill: 'none', stroke: o.ink, 'stroke-width': o.lineWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
        sg.el = el('path', { d: d(sg.pts.length > 1 ? sg.pts : [sg.pts[0], sg.pts[0]]), ...attrs,
                             'stroke-dasharray': `${sg.len + 0.01} ${sg.len + 1}` }, parent);
      }
      const tip = el('circle', { r: Math.max(1.6, o.lineWidth * 1.6), fill: o.ink, opacity: 0 }, svg);
      const nameDone = segs[segs.length - 1].at;

      return { segs, C, settle, tip, nameDone, outCost: segs[segs.length - 1].cost,
               rect: { x1: x0 + bb.x1 * s - 14, x2: x0 + bb.x2 * s + 14, y1: y + bb.y1 * s - 14, y2: y + bb.y2 * s + 14 } };
    }

    function render(t) {
      const sc = scene;
      const p = clamp(t / total);
      const c = sc.C * (0.75 * p + 0.25 * easeInOut(p)); // steady hand, soft start and finish
      let tip = null;
      for (const sg of sc.segs) {
        const local = sg.cost ? clamp((c - sg.at) / sg.cost) : (c >= sg.at ? 1 : 0);
        if (sg.el) sg.el.setAttribute('stroke-dashoffset', (sg.len + 0.01) * (1 - local));
        if (local > 0 && local < 1 && sg.type !== 'air') {
          const L = local * sg.len;
          let k = 1;
          while (k < sg.cum.length - 1 && sg.cum[k] < L) k++;
          const f = (L - sg.cum[k - 1]) / ((sg.cum[k] - sg.cum[k - 1]) || 1);
          tip = [sg.pts[k - 1][0] + (sg.pts[k][0] - sg.pts[k - 1][0]) * f, sg.pts[k - 1][1] + (sg.pts[k][1] - sg.pts[k - 1][1]) * f];
        }
      }
      sc.settle.setAttribute('fill-opacity', clamp((c - sc.nameDone) / (sc.outCost * 0.35)));
      if (tip) { sc.tip.setAttribute('cx', tip[0]); sc.tip.setAttribute('cy', tip[1]); }
      sc.tip.setAttribute('opacity', tip ? 1 : 0);
      ready = c >= sc.nameDone;
    }

    function play() {
      cancelAnimationFrame(raf);
      scene = build();
      if (freezeAt !== null) { render(freezeAt); return; }
      if (reduce) { render(total); return; }
      const start = performance.now();
      (function frame(now) {
        const t = now - start;
        render(t);
        if (t < total) raf = requestAnimationFrame(frame);
      })(start);
    }

    let resizeTimer;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { cancelAnimationFrame(raf); scene = build(); render(total); sizeCanvas(); }, 150);
    });
    document.getElementById('sig-replay')?.addEventListener('click', play);
    addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey) play(); });

    // ---- particles -------------------------------------------------------
    const ctx = canvas.getContext('2d');
    const parts = [];
    let last = null, running = false;
    function sizeCanvas() {
      const dpr = devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();

    const STYLES = {
      ink:   { colors: [o.ink, o.ink, '#444', '#777'], gravity: 0.07, drag: 0.94, life: [26, 54], size: [0.7, 2.2], speed: [0.6, 2.8] },
      gold:  { colors: ['#b8860b', '#d4af37', '#e8c547', '#f3e3a3', '#c9a227'], gravity: -0.004, drag: 0.955, life: [34, 72], size: [0.8, 2.4], speed: [0.4, 2.4], twinkle: true },
      ember: { colors: ['#ff6a3d', '#ff9e3d', '#ffd166', '#ef476f', '#c44dff'], gravity: -0.02, drag: 0.93, life: [20, 44], size: [0.8, 1.6], speed: [1.2, 4.2], streak: true },
    };
    const st = STYLES[o.particles] || STYLES.ink;

    addEventListener('pointermove', ev => {
      if (!ready || reduce || !scene) return;
      const { x1, x2, y1, y2 } = scene.rect;
      const x = ev.clientX, y = ev.clientY;
      if (x < x1 || x > x2 || y < y1 || y > y2) { last = null; return; }
      if (!last) { last = { x, y }; return; }
      const dx = x - last.x, dy = y - last.y, dist = Math.hypot(dx, dy);
      if (dist < 6) return;
      last = { x, y };
      const n = Math.round(clamp(3 + dist / 3, 3, 18));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(...st.speed) * (1 + Math.min(dist, 60) / 50);
        parts.push({ x, y, vx: Math.cos(a) * sp + dx * 0.04, vy: Math.sin(a) * sp + dy * 0.04,
                     age: 0, life: rand(...st.life), size: rand(...st.size), color: pick(st.colors), seed: Math.random() * 6 });
      }
      if (!running) { running = true; requestAnimationFrame(tick); }
    });

    function tick() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age++;
        if (p.age > p.life) { parts.splice(i, 1); continue; }
        p.vx *= st.drag; p.vy = p.vy * st.drag + st.gravity;
        p.x += p.vx; p.y += p.vy;
        let alpha = 1 - p.age / p.life;
        if (st.twinkle) alpha *= 0.55 + 0.45 * Math.sin(p.age * 0.5 + p.seed);
        ctx.globalAlpha = alpha;
        if (st.streak) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * alpha), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (parts.length) requestAnimationFrame(tick);
      else running = false;
    }

    play();

    // ?sweep: synthesize a pointer pass across the name once it is written (for screenshots).
    if (params.has('sweep')) {
      const wait = freezeAt !== null || reduce ? 50 : total + 50;
      setTimeout(() => {
        const { x1, x2, y1, y2 } = scene.rect;
        for (let i = 0; i <= 40; i++)
          dispatchEvent(new PointerEvent('pointermove', { clientX: x1 + (x2 - x1) * i / 40, clientY: (y1 + y2) / 2 + Math.sin(i / 3) * 20 }));
      }, wait);
    }
  };

  // Review-only toolbar: label, font switcher, replay. Not part of the design.
  function toolbar(o, font) {
    const bar = document.createElement('div');
    bar.className = 'sig-toolbar';
    const options = SIG_FONTS.map(f =>
      `<option value="${f.slug}"${f.slug === font.slug ? ' selected' : ''}>${f.name} (${f.kind})</option>`).join('');
    bar.innerHTML = `<a href="./">← prototypes</a> · ${o.label} · <select aria-label="Font">${options}</select>
      · <button id="sig-replay" type="button">replay (r)</button>`;
    bar.querySelector('select').addEventListener('change', e => {
      const u = new URL(location.href);
      u.searchParams.set('font', e.target.value);
      u.searchParams.delete('at');
      location.href = u;
    });
    document.body.appendChild(bar);
  }
})();
