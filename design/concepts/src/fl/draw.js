/*
 * The food, drawn two ways from the same shapes.
 *
 *   soft: lit objects. Gradient shading, a highlight, a soft contact shadow.
 *   flat: refined illustration. Solid tones, one flat shade plane, a crisp outline.
 *
 * Packaging is drawn cut-away wherever a level is worth seeing, and anything
 * countable is drawn one by one, so how much is left reads without a number.
 */
function makeDraw(style) {
  const soft = style === 'soft';
  const INK = '#1f2b38';
  const E = soft ? 'stroke="#a9b4ba" stroke-width=".8" stroke-linejoin="round"' : `stroke="${INK}" stroke-opacity=".7" stroke-width="1.25" stroke-linejoin="round"`;
  const S = (stops) => stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');

  function kit() {
    const d = [];
    return {
      /* a gradient when lit, its flat tone when drawn */
      F(flat, stops, dir = 'v') {
        if (!soft) return flat;
        const g = uid('g');
        if (dir === 'r') d.push(`<radialGradient id="${g}" cx=".4" cy=".32" r=".75">${S(stops)}</radialGradient>`);
        else {
          const [x2, y2] = dir === 'h' ? [1, 0] : dir === 'd' ? [1, 1] : [0, 1];
          d.push(`<linearGradient id="${g}" x1="0" y1="0" x2="${x2}" y2="${y2}">${S(stops)}</linearGradient>`);
        }
        return `url(#${g})`;
      },
      clip(shape) {
        const c = uid('c');
        d.push(`<clipPath id="${c}">${shape}</clipPath>`);
        return `url(#${c})`;
      },
      shadow(cx, cy, rx, ry) {
        if (!soft) return `<ellipse cx="${cx}" cy="${cy}" rx="${rx * .92}" ry="${ry * .6}" fill="${INK}" opacity=".1"/>`;
        const g = uid('g');
        d.push(`<radialGradient id="${g}">${S([[0, '#000', .32], [1, '#000', 0]])}</radialGradient>`);
        return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${g})"/>`;
      },
      /* highlights exist only under light */
      hl: (svg) => (soft ? svg : ''),
      /* flat shade planes exist only in the drawn style */
      fl: (svg) => (soft ? '' : svg),
      done: (w, h, body) => ({ w, h, svg: `<defs>${d.join('')}</defs>${body}` }),
    };
  }

  return {
    jug(it) {
      const k = kit();
      const body = 'M17 10H29V16H41Q53 16 56 26L58 33V84Q58 92 50 92H12Q4 92 4 84V33Q4 23 12 19L17 16Z';
      const hole = 'M37 22H48Q52 22 52 26V31Q52 35 48 35H37Q34 35 34 31V25Q34 22 37 22Z';
      const cp = k.clip(`<path d="${body}"/>`);
      return k.done(62, 98, `${k.shadow(31, 94, 29, 4)}
        <path d="${body} ${hole}" fill-rule="evenodd" fill="${k.F('#e4ebee', [[0, '#d9e1e5'], [.2, '#fff'], [.6, '#edf1f3'], [1, '#c3cdd3']], 'h')}" opacity="${soft ? .85 : 1}"/>
        <g clip-path="${cp}"><g class="lvl" style="transform:scaleY(${it.level})"><rect x="0" y="32" width="62" height="62" fill="${k.F('#ffffff', [[0, '#eef2f4'], [.25, '#fff'], [.65, '#f7f9fa'], [1, '#dbe2e5']], 'h')}"/><rect x="0" y="32" width="62" height="1.5" fill="#cbd5da"/>${k.fl('<rect x="44" y="34" width="14" height="60" fill="#1f2b38" opacity=".06"/>')}</g></g>
        <path d="${body} ${hole}" fill="none" ${E}/>
        ${k.hl('<rect x="8" y="30" width="5" height="54" rx="2.5" fill="#fff" opacity=".8"/>')}
        <rect x="15" y="3" width="16" height="9" rx="2.5" fill="${k.F('#cf3b2c', [[0, '#ea5b4c'], [1, '#a3261d']])}" ${E}/>
        ${k.hl('<rect x="17" y="4.5" width="6" height="2" rx="1" fill="#fff" opacity=".55"/>')}`);
    },
    tub() {
      const k = kit();
      const body = 'M6 13H58L54 50Q53.6 53 50.6 53H13.4Q10.4 53 10 50Z';
      const cp = k.clip(`<path d="${body}"/>`);
      return k.done(64, 58, `${k.shadow(32, 55, 25, 3.5)}
        <path d="${body}" fill="${k.F('#f7f9fa', [[0, '#dce3e6'], [.25, '#fff'], [.7, '#f0f3f5'], [1, '#c6cfd5']], 'h')}"/>
        <g clip-path="${cp}"><rect x="0" y="27" width="64" height="12" fill="${k.F('#3569ae', [[0, '#2b5794'], [.3, '#4679c0'], [1, '#22477c']], 'h')}"/>${k.fl('<rect x="44" y="13" width="20" height="42" fill="#1f2b38" opacity=".07"/>')}</g>
        <path d="${body}" fill="none" ${E}/>
        <rect x="3" y="5" width="58" height="10" rx="4" fill="${k.F('#3d72ba', [[0, '#5b8bd0'], [1, '#2b5791']])}" ${E}/>
        ${k.hl('<rect x="8" y="6.5" width="30" height="2" rx="1" fill="#fff" opacity=".5"/><rect x="13" y="16" width="4" height="32" rx="2" fill="#fff" opacity=".65"/>')}`);
    },
    butter(it) {
      const k = kit();
      const top = k.F('#fbf0c6', [[0, '#fff7d6'], [1, '#f5e5a2']]);
      const front = k.F('#f1db88', [[0, '#f4e094'], [1, '#e0c15c']]);
      const end = k.F('#d9bb5c', [[0, '#dcbf62'], [1, '#c3a246']]);
      let s = k.shadow(38, 46, 34, 3);
      for (let i = 0; i < 2; i++) {
        const y = 30 - i * 14;
        s += `<g class="gone-able ${i >= it.n ? 'gone' : ''}"><path d="M4 ${y}L10 ${y - 5}H72L66 ${y}Z" fill="${top}" ${E}/><rect x="4" y="${y}" width="62" height="12" rx="1" fill="${front}" ${E}/><path d="M66 ${y}L72 ${y - 5}V${y + 7}L66 ${y + 12}Z" fill="${end}" ${E}/><path d="M4 ${y + 5}H66" stroke="#fff" stroke-opacity=".55" stroke-width="1"/>${k.fl(`<path d="M20 ${y}V${y + 12}M46 ${y}V${y + 12}" stroke="#1f2b38" stroke-opacity=".18"/>`)}</g>`;
      }
      return k.done(76, 48, s);
    },
    eggs(it, tray = 'carton') {
      const k = kit();
      const out = eggsGone(it.n);
      const front = k.F('#f6ead7', [[0, '#fffaf2'], [.55, '#f1e1c8'], [1, '#d6bd9a']], 'r');
      const back = k.F('#eadcc4', [[0, '#f5ecdd'], [.6, '#e1cdb0'], [1, '#c6aa85']], 'r');
      const base = tray === 'door'
        ? k.F('#ffffff', [[0, '#ffffff'], [1, '#dfe5e8']])
        : k.F('#bcc6c9', [[0, '#d3dadc'], [1, '#a9b3b7']]);
      let b = '', f = '';
      for (let i = 0; i < 6; i++) b += `<ellipse class="gone-able ${out.has(6 + i) ? 'gone' : ''}" data-egg="${6 + i}" cx="${17 + i * 18}" cy="21" rx="8" ry="10.5" fill="${back}" ${soft ? '' : E}/>`;
      for (let i = 0; i < 6; i++) f += `<ellipse class="gone-able ${out.has(i) ? 'gone' : ''}" data-egg="${i}" cx="${11 + i * 19}" cy="28" rx="8.6" ry="11" fill="${front}" ${soft ? '' : E}/>`;
      return k.done(124, 56, `${k.shadow(62, 52, 58, 4)}${b}${f}
        <path d="M2 31H122L117 52H7Z" fill="${base}" ${E}/>
        <path d="M2 31Q7.5 37 13 31T24 31T35 31T46 31T57 31T68 31T79 31T90 31T101 31T112 31T122 31" fill="none" ${E}/>
        ${k.hl('<path d="M9 40H115" stroke="#fff" stroke-opacity=".4"/>')}`);
    },
    cheddar(it) {
      const k = kit();
      return k.done(76, 46, `${k.shadow(38, 43, 34, 3)}<g class="lvl lvlx" style="transform:scaleX(${it.level})">
        <path d="M3 15L12 6H73L64 15Z" fill="${k.F('#f7c867', [[0, '#fcd57f'], [1, '#f1b94c']])}" ${E}/>
        <rect x="3" y="15" width="61" height="27" fill="${k.F('#eba43a', [[0, '#f1ae3d'], [1, '#da9029']])}" ${E}/>
        <path d="M64 15L73 6V33L64 42Z" fill="${k.F('#c9852a', [[0, '#cf8a2a'], [1, '#b57321']])}" ${E}/>
        ${k.hl('<path d="M5 17H62" stroke="#fff" stroke-opacity=".4"/>')}</g>`);
    },
    wedge(it) {
      const k = kit();
      const dots = [[16, 24], [30, 30], [44, 32], [22, 34], [52, 35]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#c2a86d"/>`).join('');
      return k.done(66, 44, `${k.shadow(33, 41, 30, 3)}<g class="lvl lvlx" style="transform:scaleX(${it.level})">
        <path d="M3 40H63V24Q39 8 7 4Q3 4 3 9Z" fill="${k.F('#f1e4bf', [[0, '#f7ecd3'], [1, '#e0cc98']])}" ${E}/>
        <path d="M3 9Q3 4 7 4Q39 8 63 24V30Q39 14 6 10Q3 10 3 13Z" fill="${k.F('#cfa965', [[0, '#dcb772'], [1, '#b58b47']], 'd')}"/>${dots}</g>`);
    },
    tray(it) {
      const k = kit();
      const meat = k.F('#f1c2b3', [[0, '#fbe3da'], [.6, '#efbcab'], [1, '#d48f7d']], 'r');
      let p = '';
      for (let i = 0; i < 3; i++) {
        const x = 7 + i * 38;
        p += `<path class="gone-able ${i >= it.n ? 'gone' : ''}" d="M${x} 22Q${x} 12 ${x + 15} 11Q${x + 33} 10 ${x + 35} 17Q${x + 33} 27 ${x + 16} 28Q${x} 29 ${x} 22Z" fill="${meat}" ${soft ? '' : E}/>`;
      }
      return k.done(126, 44, `${k.shadow(63, 41, 58, 3.5)}${p}
        <path d="M2 21H124L118 40H8Z" fill="${k.F('#e9eef0', [[0, '#f6f8f9'], [1, '#c5ced2']])}" ${E}/>
        <path d="M5 21.6H121" stroke="#fff" stroke-width="1.4"/>
        ${k.hl('<path d="M8 13Q60 6 118 14" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.2"/>')}`);
    },
    bacon(it) {
      const k = kit();
      let r = '';
      for (let i = 0; i < 8; i++) {
        const y = 20 + i * 4;
        r += `<g class="gone-able ${i >= it.n ? 'gone' : ''}"><path d="M10 ${y}q10 -2.2 20 0t20 0t20 0t18 0" fill="none" stroke="#c8574c" stroke-width="3.2"/>${k.hl(`<path d="M10 ${y - .9}q10 -2.2 20 0t20 0t20 0t18 0" fill="none" stroke="#e57f71" stroke-width=".9" opacity=".8"/>`)}<path d="M10 ${y + 1.7}q10 -2.2 20 0t20 0t20 0t18 0" fill="none" stroke="#fbe4d9" stroke-width="1.1"/></g>`;
      }
      return k.done(98, 62, `${k.shadow(49, 59, 44, 3.5)}
        <rect x="3" y="3" width="92" height="55" rx="5" fill="${k.F('#fbfbfb', [[0, '#fff'], [1, '#dce3e6']])}" ${E}/>
        <rect x="3" y="3" width="92" height="11" rx="5" fill="${k.F('#3f5f82', [[0, '#4b6d91'], [1, '#2f4c6c']])}"/>
        <rect x="8" y="16" width="82" height="38" rx="3" fill="#f8e6dd"/>${r}
        <rect x="8" y="16" width="82" height="38" rx="3" fill="none" ${soft ? 'stroke="#fff" stroke-opacity=".6"' : E}/>
        ${k.hl('<rect x="11" y="18" width="30" height="3" rx="1.5" fill="#fff" opacity=".6"/>')}`);
    },
    box(it) {
      const k = kit();
      const cp = k.clip('<rect x="4" y="14" width="58" height="32" rx="6"/>');
      const beans = [[14, 34], [24, 38], [36, 33], [46, 39], [52, 31], [20, 29], [42, 29]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="1.8" fill="#c77b55"/>`).join('');
      return k.done(66, 50, `${k.shadow(33, 47, 30, 3)}
        <g clip-path="${cp}"><g class="lvl" style="transform:scaleY(${it.level})"><rect x="0" y="18" width="66" height="30" fill="${k.F('#8e3d24', [[0, '#a54a2b'], [1, '#6c2915']])}"/>${beans}</g></g>
        <rect x="4" y="14" width="58" height="32" rx="6" fill="${soft ? 'rgba(255,255,255,.35)' : 'none'}" ${E}/>
        <rect x="2" y="7" width="62" height="9" rx="3.5" fill="${k.F('#dce5e9', [[0, '#eef3f5'], [1, '#c1cbd0']])}" ${E}/>
        <g transform="rotate(-4 33 27)"><rect x="15" y="22" width="36" height="10" rx="1" fill="#f1e5b9"/><path d="M19 27.5q3-2.4 6 0t6 0M34 27h11" stroke="#2a2f33" stroke-width="1.1" fill="none" stroke-linecap="round"/></g>
        ${k.hl('<rect x="8" y="17" width="3.5" height="26" rx="1.7" fill="#fff" opacity=".6"/>')}`);
    },
    bag(it) {
      const k = kit();
      const shape = 'M7 11Q45 5 83 11L87 67Q45 75 3 67Z';
      const cp = k.clip(`<path d="${shape}"/>`);
      const leaf = k.F('#5d9a50', [[0, '#80bf69'], [1, '#3a7336']], 'd');
      const leaf2 = k.F('#4a8544', [[0, '#6aa85a'], [1, '#2f6230']], 'd');
      const leaves = [[20, 60, -30, 0], [40, 62, 20, 1], [60, 60, -15, 0], [74, 57, 35, 1], [27, 46, 40, 1], [47, 48, -40, 0], [67, 44, 10, 1], [35, 32, -20, 0], [55, 30, 30, 1], [20, 30, 15, 1], [72, 30, -30, 0]];
      return k.done(90, 78, `${k.shadow(45, 74, 40, 3.5)}
        <g clip-path="${cp}"><g class="lvl" style="transform:scaleY(${it.level})">${leaves.map(([x, y, a, t]) => `<g transform="rotate(${a} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="14" ry="8.5" fill="${t ? leaf : leaf2}" ${soft ? '' : 'stroke="#1f2b38" stroke-opacity=".35" stroke-width="1"'}/><path d="M${x - 11} ${y}H${x + 11}" stroke="#b5dca6" stroke-width=".9" opacity=".7"/></g>`).join('')}</g></g>
        <path d="${shape}" fill="#fff" fill-opacity="${soft ? .14 : .08}" ${E}/>
        ${k.hl('<path d="M14 18Q16 44 12 62" stroke="#fff" stroke-opacity=".75" stroke-width="3" fill="none" stroke-linecap="round"/>')}
        <path d="M7 11Q45 5 83 11" fill="none" stroke="${soft ? '#9aa6ab' : INK}" stroke-opacity="${soft ? 1 : .55}" stroke-width="4" stroke-dasharray="1.5 2.5"/>`);
    },
    punnet(it) {
      const k = kit();
      const cap = k.F('#c79f76', [[0, '#e6c7a2'], [.55, '#c29a70'], [1, '#8b6041']], 'r');
      const stem = k.F('#f3ece1', [[0, '#fbf6ee'], [1, '#ddd1bf']], 'h');
      const pos = [[58, 14], [16, 22], [36, 18], [56, 21], [76, 18], [26, 27], [46, 26], [66, 27], [86, 25], [10, 26]];
      let caps = '';
      pos.forEach(([x, y], i) => {
        caps += `<g class="gone-able ${i >= it.n ? 'gone' : ''}"><rect x="${x - 3}" y="${y - 1}" width="6" height="9" rx="2.5" fill="${stem}" ${soft ? '' : E}/><path d="M${x - 11} ${y + 1}Q${x - 11} ${y - 10} ${x} ${y - 10}Q${x + 11} ${y - 10} ${x + 11} ${y + 1}Z" fill="${cap}" ${soft ? '' : E}/><path d="M${x - 9} ${y + 1}H${x + 9}" stroke="#7a573c" stroke-width="1.1" opacity=".7"/></g>`;
      });
      return k.done(98, 54, `${k.shadow(49, 51, 44, 3.5)}${caps}
        <path d="M3 28H95L89 50H9Z" fill="${k.F('#4677b6', [[0, '#5a8bca'], [1, '#2d5890']])}" ${E}/>
        <path d="M4 28.6H94" stroke="#fff" stroke-opacity=".5"/>`);
    },
  };
}
