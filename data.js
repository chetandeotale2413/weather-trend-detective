// Cached demo data: seasonal cosine + linear trend (per decade) + AR(1) noise, seeded so results are repeatable.
const START = 2005, YEARS = 20, N = YEARS * 12;
const LABELS = Array.from({ length: N }, (_, i) => `${START + (i / 12 | 0)}-${String(i % 12 + 1).padStart(2, '0')}`);

const VARS = {
  temp:   { n: 'Surface air temperature', u: '°C', dp: 2, sc: 1,    pw: 'T2M',        src: 'MERRA-2 variable T2M (2-meter air temperature)',
    d: 'How warm the air is about 2 meters above the ground, averaged each month. A rising line means the place is warming.',
    opp: 'One global process, a warming planet, does not warm every place equally. Melting ice or snow can darken the surface and amplify warming in one region, while shifted wind patterns or cloud changes can leave another region flat or cooler.',
    same: 'Both regions respond to the same global driver, but local factors such as ice, clouds and ocean heat set how fast each one changes.' },
  precip: { n: 'Precipitation', u: 'mm/day', dp: 3, sc: .4,        pw: 'PRECTOTCORR', src: 'GPM IMERG variable precipitationCal',
    d: 'Rain and snow reaching the ground, estimated by the Global Precipitation Measurement satellites, in millimeters per day.',
    opp: 'A warmer atmosphere holds more moisture, but circulation decides where it falls. Shifts in the tropical rain belt can wet one region while drying another.',
    same: 'Both regions are moving together, which points to a shared large-scale driver such as a warmer atmosphere holding more water.' },
  soil:   { n: 'Soil moisture', u: 'm³/m³', dp: 4, sc: .03,         pw: null,         src: 'GLDAS Noah variable SoilMoi0_10cm_inst',
    d: 'How much water sits in the top 10 cm of soil, from NASA\'s Global Land Data Assimilation System. It shows drought better than rainfall alone.',
    opp: 'Soil moisture balances rain against evaporation. Warming raises evaporation everywhere, so a region only stays wet if rainfall rises faster.',
    same: 'Both regions share a rain-versus-evaporation balance tilting the same way.' },
  ozone:  { n: 'Total column ozone', u: 'DU', dp: 1, sc: 5,         pw: null,         src: 'Aura OMI variable ColumnAmountO3',
    d: 'The thickness of the ozone layer above a spot, in Dobson Units. It blocks harmful ultraviolet light.',
    opp: 'Ozone depends on both chemistry and air circulation. Falling chlorine can let ozone recover in one place while changing circulation thins it in another.',
    same: 'Both regions respond to the same chemistry and circulation changes.' }
};

const PHEN = [
  { k: 'temp',   t: 'Warming & heat',        s: 'Is this place getting hotter?' },
  { k: 'precip', t: 'Water cycle & drought', s: 'Is rain arriving more or less?' },
  { k: 'ozone',  t: 'Atmospheric chemistry', s: 'Is the ozone shield thickening or thinning?' }
];

// p[var] = [baseline, seasonal amplitude, peak month (0 = Jan), trend per decade, noise SD]
const REGIONS = {
  amazon:    { name: 'Amazon Rainforest',      lat: -4, lon: -62, pair: 'monsoon', blurb: 'The largest tropical forest on Earth.',
    p: { temp: [26.5, .8, 10, .25, .3], precip: [6.5, 2.5, 2, -.15, .8], soil: [.32, .04, 4, -.012, .008], ozone: [255, 6, 9, -.2, 3] } },
  sahara:    { name: 'Sahara Desert',          lat: 23, lon: 12,  pair: 'pacific', blurb: 'The world\'s largest hot desert.',
    p: { temp: [28, 9, 6, .35, .5], precip: [.15, .1, 7, .02, .06], soil: [.04, .005, 7, .001, .003], ozone: [265, 12, 3, -.3, 4] } },
  arctic:    { name: 'Arctic Circle',          lat: 75, lon: 40,  pair: 'eurasia', blurb: 'Sea ice and permafrost at the top of the world.',
    p: { temp: [-10, 15, 6, .75, 1.2], precip: [.9, .3, 8, .06, .2], soil: [.3, .06, 6, .01, .015], ozone: [360, 40, 2, -1.5, 10] } },
  monsoon:   { name: 'South Asian Monsoon',    lat: 23, lon: 80,  pair: 'amazon',  blurb: 'Seasonal rains that feed over a billion people.',
    p: { temp: [26, 6, 4, .2, .5], precip: [3.2, 4.5, 6, .12, .7], soil: [.25, .08, 7, .005, .015], ozone: [265, 10, 5, -.1, 4] } },
  eurasia:   { name: 'Central Eurasia',        lat: 50, lon: 70,  pair: 'arctic',  blurb: 'Continental steppe with harsh, variable winters.',
    p: { temp: [3, 17, 6, -.15, 1.4], precip: [1, .4, 5, -.01, .25], soil: [.22, .06, 4, -.004, .015], ozone: [330, 30, 2, -.5, 8] } },
  antarctic: { name: 'Antarctic Ozone Hole',   lat: -75, lon: 0,  pair: 'pacific', blurb: 'Home of the springtime ozone hole.',
    p: { temp: [-30, 14, 0, .1, 1.2], precip: [.3, .05, 5, 0, .08], soil: [.05, .01, 0, 0, .003], ozone: [270, 55, 3, 2.5, 12] } },
  pacific:   { name: 'Tropical Pacific',       lat: 0,  lon: -150, pair: 'antarctic', blurb: 'Warm open ocean where El Niño begins.',
    p: { temp: [27, .6, 3, .15, .35], precip: [5.5, 1, 3, .05, 1.2], soil: [.35, .02, 3, 0, .01], ozone: [255, 7, 9, -.3, 3] } }
};

const CASES = [
  { t: 'Arctic amplification vs. mid-latitude cooling', A: 'arctic', B: 'eurasia', v: 'temp',
    why: 'Melting sea ice replaces bright reflective ice with dark ocean that soaks up sunlight (the ice-albedo feedback), so the Arctic warms several times faster than the global average. Some scientists propose that this weakens the jet stream, letting cold Arctic air spill south into Eurasian winters and holding those regions flat or cooler. This link is still debated.' },
  { t: 'Amazon drying vs. monsoon intensification', A: 'amazon', B: 'monsoon', v: 'precip',
    why: 'Deforestation, a warmer tropical Atlantic and longer dry seasons reduce the moisture the Amazon recycles into its own rain. Meanwhile warmer air over South Asia holds roughly 7% more water per degree Celsius, and a warmer Indian Ocean feeds more moisture into monsoon systems, which fits a recent rebound in rainfall.' },
  { t: 'Ozone recovery vs. tropical decline', A: 'antarctic', B: 'pacific', v: 'ozone',
    why: 'The Montreal Protocol cut ozone-destroying chlorine, so the Antarctic ozone hole is slowly healing. In the tropics, greenhouse warming may speed up the stratospheric circulation that carries ozone toward the poles, which can thin the tropical column even as polar ozone recovers.' }
];

// Seeded generator for the cached series.
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
function synth(rk, v) {
  const [b, a, pk, tr, sd] = REGIONS[rk].p[v];
  const r = mulberry([...(rk + v)].reduce((s, c) => s * 31 + c.charCodeAt(0) | 0, 7));
  let e = 0;
  return Array.from({ length: N }, (_, i) => {
    e = .4 * e + sd * gauss(r);
    const x = b + a * Math.cos(2 * Math.PI * (i % 12 - pk) / 12) + tr * i / 120 + e;
    return +(v === 'temp' ? x : Math.max(0, x)).toFixed(4); // only temperature may go below zero
  });
}

// Live hook: NASA POWER monthly point API (T2M and PRECTOTCORR). Returns N monthly values.
async function fetchPower(rk, v) {
  const pw = VARS[v].pw, { lat, lon } = REGIONS[rk];
  if (!pw) throw new Error('No live source for this variable');
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=${pw}&community=AG&longitude=${lon}&latitude=${lat}&start=${START}&end=${START + YEARS - 1}&format=JSON`;
  const o = (await (await fetch(url)).json()).properties.parameter[pw];
  return Object.keys(o).filter(k => !k.endsWith('13')).sort().map(k => o[k]); // key "YYYY13" is the annual mean
}