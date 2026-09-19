/**
 * Minimal dependency-free canvas chart helpers (site only; no data mutation).
 */
(function () {
  const D = window.Chart2 = {};

  function setup(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
  }

  function extent(seriesList, key) {
    let min = Infinity, max = -Infinity;
    for (const s of seriesList) for (const pt of s.points) {
      const v = pt[key];
      if (v === null || v === undefined) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min)) { min = 0; max = 1; }
    const pad = (max - min) * 0.08 || 0.5;
    return [min - pad, max + pad];
  }

  /**
   * Draw one or more series of {x (date string), y} points.
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{label, color, points: Array<{x,y}>}>} series
   * @param {object} [opts] {yFmt, hLines: [{y,label,color}]}
   */
  D.lines = function (canvas, series, opts = {}) {
    const w = canvas.parentElement ? canvas.parentElement.clientWidth || 800 : 800;
    const h = canvas.clientHeight || 240;
    const ctx = setup(canvas, w, h);
    const padL = 44, padR = 12, padT = 12, padB = 26;
    const ys = series.map((s) => s.points.map((p) => p.y).filter((v) => v !== null));
    let [ymin, ymax] = extent(series, 'y');
    if (opts.yMin !== undefined) ymin = opts.yMin;
    if (opts.yMax !== undefined) ymax = opts.yMax;
    const xs = [];
    for (const s of series) for (const p of s.points) xs.push(p.x);
    const xset = [...new Set(xs)].sort();
    const xIndex = new Map(xset.map((x, i) => [x, i]));
    const X = (x) => padL + (xset.length <= 1 ? 0 : (xIndex.get(x) / (xset.length - 1)) * (w - padL - padR));
    const Y = (y) => padT + (1 - (y - ymin) / (ymax - ymin || 1)) * (h - padT - padB);
    const yFmt = opts.yFmt || ((v) => String(Math.round(v)));

    // grid + y labels
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#5b6b7c';
    ctx.strokeStyle = '#e3e8ee';
    const nGrid = 4;
    for (let i = 0; i <= nGrid; i++) {
      const yv = ymin + ((ymax - ymin) * i) / nGrid;
      const yy = Y(yv);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(yFmt(yv), padL - 6, yy + 3);
    }
    // horizontal reference lines
    for (const hl of opts.hLines || []) {
      const yy = Y(hl.y);
      if (yy < padT || yy > h - padB) continue;
      ctx.strokeStyle = hl.color || '#9aa7b5';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = hl.color || '#9aa7b5';
      ctx.textAlign = 'left';
      ctx.fillText(hl.label, padL + 4, yy - 4);
    }
    // x labels (up to 6)
    ctx.fillStyle = '#5b6b7c';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.ceil(xset.length / 6));
    xset.forEach((x, i) => {
      if (i % step === 0 || i === xset.length - 1) ctx.fillText(x.slice(5), X(x), h - 8);
    });
    // series
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (const p of s.points) {
        if (p.y === null || p.y === undefined) continue;
        const xx = X(p.x), yy = Y(p.y);
        if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
  };

  /** Tiny sparkline for tables. */
  D.spark = function (canvas, values, color) {
    const w = 120, h = 28;
    const ctx = setup(canvas, w, h);
    const finite = values.filter((v) => Number.isFinite(v));
    if (finite.length < 2) return;
    const min = Math.min(...finite), max = Math.max(...finite);
    const X = (i) => (i / (values.length - 1)) * (w - 4) + 2;
    const Y = (v) => (max === min ? h / 2 : (1 - (v - min) / (max - min)) * (h - 6) + 3);
    ctx.strokeStyle = color || '#1f5fbf';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      if (i === 0) ctx.moveTo(X(i), Y(v)); else ctx.lineTo(X(i), Y(v));
    });
    ctx.stroke();
  };
})();
