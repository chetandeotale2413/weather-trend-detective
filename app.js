const $ = s => document.querySelector(s);
if (typeof REGIONS === 'undefined' || typeof L === 'undefined' || typeof Chart === 'undefined') {
    document.body.insertAdjacentHTML('afterbegin', '<p style="margin:20px 28px;padding:14px;border:1px solid #fbbf24;border-radius:10px">Something did not load. Check that data.js sits in the same folder as index.html with exactly that name, and that you are online for Leaflet and Chart.js.</p>');
    throw new Error('Missing dependency');
}
const st = { A: 'arctic', B: 'eurasia', v: 'temp', slot: 'A', cs: 0 };
const cache = {};

/* ---------- Statistics ---------- */
function lg(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, .1208650973866179e-2, -.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + .5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function betacf(a, b, x) {
    const F = 1e-30; let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < F) d = F; d = 1 / d; let h = d;
    for (let m = 1; m <= 200; m++) {
        const m2 = 2 * m; let aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < F) d = F; c = 1 + aa / c; if (Math.abs(c) < F) c = F; d = 1 / d; h *= d * c;
        aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2));
        d = 1 + aa * d; if (Math.abs(d) < F) d = F; c = 1 + aa / c; if (Math.abs(c) < F) c = F; d = 1 / d;
        const dl = d * c; h *= dl; if (Math.abs(dl - 1) < 1e-10) break;
    }
    return h;
}
function ibeta(x, a, b) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lg(a + b) - lg(a) - lg(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
const pValue = (t, df) => ibeta(df / (df + t * t), df / 2, .5); // two-sided Student t

function deseason(y) { const m = Array(12).fill(0), c = Array(12).fill(0); y.forEach((v, i) => { m[i % 12] += v; c[i % 12]++; }); return y.map((v, i) => v - m[i % 12] / c[i % 12]); }

// OLS in years; p-value uses an effective sample size that discounts month-to-month autocorrelation.
function regress(y) {
    const n = y.length, mx = (n - 1) / 24, my = y.reduce((a, b) => a + b) / n; let sxx = 0, sxy = 0;
    y.forEach((v, i) => { sxx += (i / 12 - mx) ** 2; sxy += (i / 12 - mx) * (v - my); });
    const s = sxy / sxx, ic = my - s * mx, res = y.map((v, i) => v - ic - s * i / 12), sse = res.reduce((a, v) => a + v * v, 0);
    const r1 = Math.max(0, res.slice(1).reduce((a, v, i) => a + v * res[i], 0) / sse), ne = Math.max(4, n * (1 - r1) / (1 + r1));
    const se = Math.sqrt(sse / (n - 2) / sxx * n / ne), sst = y.reduce((a, v) => a + (v - my) ** 2, 0);
    return { s: s * 10, p: pValue(s / se, ne - 2), r2: 1 - sse / sst, line: y.map((_, i) => ic + s * i / 12) };
}

/* ---------- Data ---------- */
const live = () => $('#live').checked;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 5000); }
async function series(rk, v) {
    const k = rk + v + (live() ? 'L' : '');
    if (cache[k]) return cache[k];
    let y;
    if (live()) {
        try { y = await fetchPower(rk, v); if (y.length !== N || y.some(x => x < -900)) throw 0; }
        catch { toast(VARS[v].pw ? 'NASA POWER did not respond, so cached data is shown.' : `${VARS[v].n} is not in NASA POWER, so cached data is shown.`); y = synth(rk, v); }
    } else y = synth(rk, v);
    return cache[k] = y;
}

/* ---------- Charts and Trend-O-Meter ---------- */
const ch = {};
const mkChart = (s, col) => new Chart($(`#c${s} canvas`), {
    type: 'line',
    data: { labels: LABELS, datasets: [{ data: [], borderColor: col, borderWidth: 1.3, pointRadius: 0 }, { data: [], borderColor: '#e6edf7', borderDash: [6, 4], borderWidth: 2, pointRadius: 0 }] },
    options: {
        animation: false, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: '#8fa0bd', maxTicksLimit: 9 }, grid: { display: false } }, y: { ticks: { color: '#8fa0bd' }, grid: { color: '#1b2740' }, title: { display: true, color: '#8fa0bd', text: '' } } }
    }
});

function gauge(sl, sc, col) {
    const a = Math.max(-1, Math.min(1, sl / sc)) * 80;
    return `<svg viewBox="0 0 200 124" role="img" aria-label="Trend-O-Meter"><path d="M20 100A80 80 0 0 1 100 20" fill="none" stroke="#fbbf24" stroke-opacity=".35" stroke-width="14"/><path d="M100 20A80 80 0 0 1 180 100" fill="none" stroke="#22d3ee" stroke-opacity=".35" stroke-width="14"/><g transform="rotate(${a} 100 100)"><path d="M100 26L95 100h10z" fill="${col}"/></g><circle cx="100" cy="100" r="7" fill="#e6edf7"/><text x="20" y="120" fill="#8fa0bd" font-size="12">falling</text><text x="180" y="120" fill="#8fa0bd" font-size="12" text-anchor="end">rising</text></svg>`;
}

async function draw() {
    const ys = await Promise.all([series(st.A, st.v), series(st.B, st.v)]), V = VARS[st.v], ds = $('#ds').checked, R = {};
    ['A', 'B'].forEach((s, i) => {
        const y = ds ? deseason(ys[i]) : ys[i], r = regress(y), c = ch[s], sig = r.p < .05; R[s] = r;
        c.data.datasets[0].data = y; c.data.datasets[1].data = r.line; c.options.scales.y.title.text = V.u + (ds ? ' (anomaly from monthly average)' : ''); c.update();
        $(`#c${s} .gauge`).innerHTML = gauge(r.s, V.sc, s === 'A' ? '#22d3ee' : '#fbbf24');
        $(`#c${s} .nums`).innerHTML = `<div class="big">${r.s > 0 ? '+' : ''}${r.s.toFixed(V.dp)} <small>${V.u} per decade</small></div><div class="badge ${sig ? 'ok' : 'wait'}">${sig ? 'Statistically Significant (p < 0.05)' : 'Emerging Trend — Needs Longer Timeframe'}</div><div class="mut">${r.p < .001 ? 'p < 0.001' : 'p = ' + r.p.toFixed(3)}, R² = ${r.r2.toFixed(2)}</div>`;
    });
    clue(R);
}

/* ---------- Detective clue ---------- */
function clue(R) {
    const a = R.A, b = R.B, V = VARS[st.v], c = CASES[st.cs], cs = c && c.v === st.v && c.A === st.A && c.B === st.B ? c : null;
    const f = r => `${r.s > 0 ? '+' : ''}${r.s.toFixed(V.dp)} ${V.u} per decade`, sg = r => r.p < .05 ? 'statistically significant' : 'not yet significant', opp = a.s * b.s < 0;
    $('#clue').innerHTML = `<h3>Detective clue</h3>
  <p><b>Evidence.</b> ${REGIONS[st.A].name} is trending ${f(a)} (${sg(a)}). ${REGIONS[st.B].name} is trending ${f(b)} (${sg(b)}). ${opp ? 'The two regions move in opposite directions.' : 'Both regions move the same way, at different speeds.'}</p>
  <p><b>Hypothesis.</b> ${cs ? cs.why : opp ? V.opp : V.same}</p>
  <p><b>Check it.</b> ${a.p >= .05 && b.p >= .05 ? 'Neither trend is significant yet, so treat any story here as a question, not an answer. ' : ''}${$('#ds').checked ? 'The seasonal cycle is removed, so the line shows the long-term signal.' : 'Seasonal swings dominate the line. Turn on Deseasonalize to expose the long-term signal.'} Twenty years is short, and natural cycles like El Niño can tilt a trend.</p>`;
}

/* ---------- Map ---------- */
const map = L.map('map', { worldCopyJump: true, minZoom: 1 }).setView([20, 10], 1);
const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri', maxZoom: 6 }).addTo(map);
let swapped = false; // if Esri tiles fail, fall back to OpenStreetMap (darkened via the .inv class)
esri.on('tileerror', () => {
    if (swapped) return; swapped = true; map.removeLayer(esri);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 6, className: 'inv' }).addTo(map);
});
setTimeout(() => map.invalidateSize(), 300);
const mk = {};
Object.entries(REGIONS).forEach(([k, r]) => {
    mk[k] = L.circleMarker([r.lat, r.lon], { radius: 9, weight: 2 }).addTo(map).bindTooltip(r.name).on('click', () => pick(k));
});
function paint() {
    Object.entries(mk).forEach(([k, m]) => m.setStyle(k === st.A ? { color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: .8 } : k === st.B ? { color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: .8 } : { color: '#8fa0bd', fillColor: '#8fa0bd', fillOpacity: .3 }));
    ['A', 'B'].forEach(s => { $(`#c${s} .rs`).value = st[s]; });
    document.querySelectorAll('[data-slot]').forEach(b => b.classList.toggle('on', b.dataset.slot === st.slot));
}
function pick(k) { st[st.slot] = k; st.slot = st.slot === 'A' ? 'B' : 'A'; paint(); draw(); }

/* ---------- Controls ---------- */
['A', 'B'].forEach(s => {
    $('#c' + s).innerHTML = `<div class="hd"><b class="tag${s}">Region ${s}</b><select class="rs" aria-label="Region ${s}">${Object.entries(REGIONS).map(([k, r]) => `<option value="${k}">${r.name}</option>`).join('')}</select></div><div class="row"><div class="gauge"></div><div class="nums"></div></div><div class="cv"><canvas></canvas></div>`;
    $(`#c${s} .rs`).onchange = e => { st[s] = e.target.value; paint(); draw(); };
});
ch.A = mkChart('A', '#22d3ee'); ch.B = mkChart('B', '#fbbf24');
$('#v').innerHTML = Object.entries(VARS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('');
$('#v').onchange = e => { st.v = e.target.value; draw(); };
$('#ds').onchange = $('#live').onchange = draw;
document.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { st.slot = b.dataset.slot; paint(); });

function apply(a, b, v, cs) { Object.assign(st, { A: a, B: b, v, cs, slot: 'A' }); $('#v').value = v; document.querySelectorAll('.cases button').forEach((x, i) => x.classList.toggle('on', i === cs)); paint(); draw(); }
$('.cases').innerHTML = CASES.map((c, i) => `<button>${c.t}</button>`).join('');
document.querySelectorAll('.cases button').forEach((b, i) => b.onclick = () => apply(CASES[i].A, CASES[i].B, CASES[i].v, i));

/* ---------- Detective wizard ---------- */
const wz = $('#wz'), W = {};
function step(n) {
    $('#prog').textContent = `Step ${n} of 3`;
    const opts = (h, items, fn) => { wz.innerHTML = `<h2>${h}</h2><div class="opts">${items.map((o, i) => `<button class="opt" data-i="${i}"><b>${o.t}</b><span>${o.s}</span></button>`).join('')}</div>`; wz.querySelectorAll('.opt').forEach(b => b.onclick = () => fn(items[b.dataset.i])); };
    if (n === 1) opts('Where do you want to investigate?', Object.entries(REGIONS).map(([k, r]) => ({ k, t: r.name, s: r.blurb })), o => { W.r = o.k; step(2); });
    if (n === 2) opts('What is changing there?', PHEN.map(p => ({ k: p.k, t: p.t, s: p.s })), o => { W.v = o.k; step(3); });
    if (n === 3) {
        const V = VARS[W.v], r = REGIONS[W.r], p = REGIONS[r.pair];
        wz.innerHTML = `<h2>Your clue: ${V.n}</h2><p>${V.d}</p><p class="mut">NASA source: ${V.src}</p><button class="cta" id="go">Compare ${r.name} with ${p.name}</button> <button class="ghost" id="back">Back</button>`;
        $('#back').onclick = () => step(2);
        $('#go').onclick = () => { apply(W.r, r.pair, W.v, -1); $('#wizbox').hidden = true; $('#dash').scrollIntoView({ behavior: 'smooth' }); };
    }
}
$('#reopen').onclick = () => { $('#wizbox').hidden = false; step(1); };
step(1); apply(CASES[0].A, CASES[0].B, CASES[0].v, 0);