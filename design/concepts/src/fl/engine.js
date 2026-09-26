/*
 * The Fridge Light engine, shared by every variation: the perspective
 * interior, the spotlight, cooking, and the door. Variations only restyle it.
 */
const FL = (() => {
  const ICON = {
    Cook: '<path d="M5 10h14v6.5A3.5 3.5 0 0 1 15.5 20h-7A3.5 3.5 0 0 1 5 16.5V10Z"/><path d="M2.5 10H5M19 10h2.5M8 7h8M12 4.5V7"/>',
    Pantry: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M6 9.5h12M9 5.5v2M9 12.5v3"/>',
    Shopping: '<path d="M5 8h14l-1.2 11.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    Eaten: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
    Search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>',
    Plus: '<path d="M12 5v14M5 12h14"/>',
  };
  const icon = (name, size = 24) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

  const status = (c) => `<div class="status"><span>6:04</span><svg width="70" height="12" viewBox="0 0 70 12" fill="${c}" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3.5" width="3" height="8.5" rx="1"/><rect x="15" y="1" width="3" height="11" rx="1"/><path d="M31 11.5l2.4-2.6a3.4 3.4 0 0 0-4.8 0zM26.4 6.8a6.5 6.5 0 0 1 9.2 0l-1.6 1.7a4.2 4.2 0 0 0-6 0zM24 4.3a10 10 0 0 1 14 0l-1.6 1.7a7.7 7.7 0 0 0-10.8 0z"/><rect x="44.5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="${c}" stroke-opacity=".45"/><rect x="46.5" y="2.5" width="16" height="7" rx="2"/><rect x="67.5" y="4" width="1.8" height="4" rx=".9" fill-opacity=".45"/></svg></div>`;
  const tabs = (on) => `<nav class="tabs">${['Cook', 'Pantry', 'Shopping', 'Eaten'].map((t) => `<button type="button" class="tab ${t === on ? 'on' : ''}">${icon(t)}<span>${t}</span></button>`).join('')}</nav><div class="home"></div>`;
  const when = (f) => (f.days === 1 ? '<span class="tag">Tomorrow</span>' : f.days <= 3 ? `<span class="soon">· ${f.days} days left</span>` : '');

  /* One item: the drawing, and its label printed below the shelf edge. */
  function col(key, o) {
    const f = FOOD[key];
    const d = o.D[f.draw](f, o.variant);
    return `<div class="col" data-k="${key}" style="width:${o.w}px">
      <div class="obj" style="height:${o.oh}px"><svg width="${d.w * o.s}" height="${d.h * o.s}" viewBox="0 0 ${d.w} ${d.h}">${d.svg}</svg></div>
      ${o.labels ? `<div class="lab" style="top:${o.labelTop}px"><span class="nm">${f.name}</span><span class="meta"><span data-q>${f.q}</span>${o.split ? '' : when(f)}</span>${o.split && when(f) ? `<span class="meta">${when(f).replace('· ', '')}</span>` : ''}</div>` : ''}
    </div>`;
  }

  /*
   * One-point perspective, eye just below the ceiling, so every shelf shows
   * its top surface and the lower ones show more of it, as they do when you
   * stand at an open fridge.
   */
  function fridge(o) {
    const { W, H, vpY, k, s } = o;
    const bx0 = (W / 2) * (1 - k), bx1 = W - bx0, by0 = vpY * (1 - k), by1 = vpY + (H - vpY) * k;
    const back = (y) => vpY + (y - vpY) * k;
    const shelf = (yf) => {
      const yb = back(yf);
      if (o.shelf === 'wire') {
        let rods = '';
        for (let i = 0; i < 5; i++) {
          const t = i / 5, y = yb + (yf - yb) * t, x = bx0 * (1 - t);
          rods += `<path class="rod" d="M${x} ${y}H${W - x}"/>`;
        }
        return `${rods}<rect class="trim" x="0" y="${yf - 2}" width="${W}" height="5" rx="2.5"/><path class="trim-hi" d="M3 ${yf - 1}H${W - 3}"/>`;
      }
      return `<path class="glass" d="M0 ${yf}H${W}L${bx1} ${yb}H${bx0}Z"/><path class="glass-edge" d="M${bx0} ${yb}H${bx1}"/><rect class="under" x="0" y="${yf + 7}" width="${W}" height="12"/><rect class="trim" x="0" y="${yf}" width="${W}" height="7"/><path class="trim-hi" d="M0 ${yf + 1}H${W}"/>`;
    };
    const oh = Math.round(92 * s);
    const pad = Math.round(bx0 * .55) + 6;
    const rows = o.rows.map((r) => {
      const rest = r.yf - (r.yf - back(r.yf)) * .42;
      const top = rest - oh;
      return `<div class="row" style="top:${top}px;left:${pad}px;right:${pad}px">${r.keys.map((key, j) => col(key, { ...o, w: r.widths[j], oh, labelTop: r.yf + 12 - top })).join('')}</div>`;
    }).join('');
    const dr = o.drawer;
    const drawer = `<div class="drawer" style="top:${dr.y0}px;height:${dr.y1 - dr.y0}px;left:${pad - 6}px;right:${pad - 6}px"><div class="row" style="top:${dr.itemTop}px;left:4px;right:4px;justify-content:space-around">${dr.keys.map((key) => col(key, { ...o, s: s * (dr.scale || 1), w: 150, oh: dr.oh || oh, labelTop: dr.labelTop - dr.itemTop })).join('')}</div></div>`;
    return `<div class="fridge" style="width:${W}px;height:${H}px">
      <svg class="walls" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <path class="w-ceil" d="M0 0H${W}L${bx1} ${by0}H${bx0}Z"/>
        <path class="w-left" d="M0 0L${bx0} ${by0}V${by1}L0 ${H}Z"/>
        <path class="w-right" d="M${W} 0V${H}L${bx1} ${by1}V${by0}Z"/>
        <path class="w-floor" d="M0 ${H}L${bx0} ${by1}H${bx1}L${W} ${H}Z"/>
        <rect class="w-back" x="${bx0}" y="${by0}" width="${bx1 - bx0}" height="${by1 - by0}"/>
        <path class="w-seam" d="M0 0L${bx0} ${by0}M${W} 0L${bx1} ${by0}M0 ${H}L${bx0} ${by1}M${W} ${H}L${bx1} ${by1}"/>
        ${o.rows.map((r) => shelf(r.yf)).join('')}
      </svg>
      <div class="light"></div>
      ${o.top || ''}${rows}${drawer}
    </div>`;
  }

  /* Tonight: the fridge light drops, and a beam finds each thing the recipe takes. */
  function spot(root, r) {
    const layer = root.querySelector('.spots');
    layer.innerHTML = '';
    const pb = root.getBoundingClientRect();
    const sc = pb.width / root.offsetWidth || 1;
    root.querySelectorAll('.col').forEach((c) => {
      const key = c.dataset.k;
      const lit = key in r.badge;
      c.classList.toggle('lit', lit);
      if (!lit) return;
      const sb = c.querySelector('svg').getBoundingClientRect();
      const fb = c.closest('.frame, .door-in').getBoundingClientRect();
      const x = (sb.left - pb.left) / sc, y = (sb.top - pb.top) / sc, w = sb.width / sc, h = sb.height / sc;
      const top = (fb.top - pb.top) / sc + 4;
      layer.insertAdjacentHTML('beforeend', `<div class="beam" style="left:${x - 24}px;width:${w + 48}px;top:${top}px;height:${y + h + 8 - top}px"></div>`);
      layer.insertAdjacentHTML('beforeend', `<span class="chip" style="left:${x + w / 2}px;top:${Math.max(top + 2, y - 30)}px">${r.badge[key]}</span>`);
    });
  }

  let current = 0;
  function show(root, i, instant) {
    current = i;
    delete root.dataset.cooked;
    root.querySelector('.toast')?.classList.remove('on');
    const r = RECIPES[i];
    const body = root.querySelector('.sheet .body');
    const paint = () => {
      body.innerHTML = `<h2>${r.name}</h2><p class="why">${r.urgent ? '<i></i>' : ''}${r.why}</p><p class="facts">${r.facts}</p><p class="plus">${r.plus}</p>`;
      const go = root.querySelector('.go');
      go.textContent = 'Cook this';
      go.disabled = false;
      spot(root, r);
      body.classList.remove('out');
    };
    if (instant) return paint();
    body.classList.add('out');
    setTimeout(paint, 260);
  }

  function cook(root) {
    const r = RECIPES[current];
    const go = root.querySelector('.go');
    if (!r.after) return;
    root.dataset.cooked = 1;
    go.disabled = true;
    root.querySelectorAll('.chip').forEach((c) => { c.textContent = `−${c.textContent}`; });
    setTimeout(() => {
      for (const [key, v] of Object.entries(r.after)) {
        document.querySelectorAll(`.col[data-k="${key}"]`).forEach((col) => {
          if (v.n !== undefined) {
            const out = eggsGone(v.n);
            col.querySelectorAll('[data-egg]').forEach((egg, j) => setTimeout(() => egg.classList.toggle('gone', out.has(+egg.dataset.egg)), j * 40));
          }
          if (v.level !== undefined) col.querySelectorAll('.lvl').forEach((g) => { g.style.transform = g.classList.contains('lvlx') ? `scaleX(${v.level})` : `scaleY(${v.level})`; });
          const q = col.querySelector('[data-q]');
          if (q) q.textContent = v.q;
        });
      }
    }, 350);
    setTimeout(() => {
      root.querySelector('.why').textContent = r.done;
      const t = root.querySelector('.toast');
      t.querySelector('span').textContent = `${r.kcal} kcal logged to today`;
      t.classList.add('on');
    }, 1100);
    // the button that cooked never becomes the button that undoes
    setTimeout(() => { go.textContent = 'Next recipe'; go.disabled = false; }, 1800);
    setTimeout(() => root.querySelectorAll('.chip').forEach((c) => c.classList.add('fade')), 2200);
  }

  function wireTonight(root) {
    show(root, 0, true);
    root.querySelector('.alt').addEventListener('click', () => show(root, (current + 1) % RECIPES.length));
    root.querySelector('.go').addEventListener('click', () => (root.dataset.cooked ? show(root, (current + 1) % RECIPES.length) : cook(root)));
  }

  /* The door opens, and the light comes on because the door opened. */
  function open(phones, mode) {
    phones.forEach((p) => {
      p.classList.remove('open', 'mid', 'instant');
      p.classList.add('closed');
      void p.offsetWidth;
      if (mode === 'still' || mode === 'mid') {
        p.classList.add('instant', mode === 'still' ? 'open' : 'mid');
        p.classList.remove('closed');
        return;
      }
      setTimeout(() => { p.classList.remove('closed'); p.classList.add('open'); }, 450);
    });
  }

  /* the stage: ?still renders the settled screens, ?still=moment the door mid-swing and a cooked recipe */
  function boot(tonightEl, pantryEl) {
    const mode = new URLSearchParams(location.search).get('still');
    if (mode === null) open([tonightEl, pantryEl]);
    else if (mode === 'moment') { open([pantryEl], 'mid'); open([tonightEl], 'still'); setTimeout(() => cook(tonightEl), 50); }
    else open([tonightEl, pantryEl], 'still');
    return mode;
  }

  return { icon, status, tabs, col, fridge, spot, wireTonight, cook, open, boot };
})();
