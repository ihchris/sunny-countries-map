// Configuration
const regions = ['All', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const weatherBands = [
  { min: 26, className: 'band-tropical', color: '#f97316' }, 
  { min: 18, className: 'band-warm', color: '#f59e0b' },     
  { min: 10, className: 'band-mild', color: '#10b981' },     
  { min: 2, className: 'band-cool', color: '#0ea5e9' },      
  { min: -Infinity, className: 'band-polar', color: '#8b5cf6' } 
];

const weatherCodes = { 0: { icon: '☀️', text: 'Clear sky' } };

// Application State
const state = { mode: 'sunshine', unit: 'C', query: '', region: 'All', selectedName: 'Portugal' };
const weatherByName = new Map();
const markerByName = new Map();
let map, markerLayer, baseTileLayer;
let isNocturne = false;

// DOM Elements
const els = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  leftSidebar: document.getElementById('leftSidebar'),
  rightSidebar: document.getElementById('rightSidebar'),
  closeLeftBtn: document.getElementById('closeLeftBtn'),
  closeRightBtn: document.getElementById('closeRightBtn'),
  toggleLeftBtn: document.getElementById('toggleLeftBtn'),
  modeSunshine: document.getElementById('modeSunshine'), 
  modeTemperature: document.getElementById('modeTemperature'),
  unitC: document.getElementById('unitC'), 
  unitF: document.getElementById('unitF'),
  searchInput: document.getElementById('searchInput'), 
  regionFilters: document.getElementById('regionFilters'),
  cardsGrid: document.getElementById('cardsGrid'), 
  visibleCount: document.getElementById('visibleCount'),
  selectedName: document.getElementById('selectedName'), 
  selectedMeta: document.getElementById('selectedMeta'), 
  selectedFlag: document.getElementById('selectedFlag'), 
  selectedCurrentTemp: document.getElementById('selectedCurrentTemp'), 
  selectedFeelsLike: document.getElementById('selectedFeelsLike'), 
  selectedHumidity: document.getElementById('selectedHumidity'), 
  selectedWind: document.getElementById('selectedWind'), 
  selectedWeatherText: document.getElementById('selectedWeatherText')
};

function formatTemp(t) { return (t == null) ? '--' : (state.unit === 'C' ? `${t.toFixed(1)}°C` : `${((t * 9/5) + 32).toFixed(1)}°F`); }
function bandForTemp(t) { return weatherBands.find(b => t >= b.min) || weatherBands[weatherBands.length - 1]; }

function getVisibleCountries() {
  if(typeof countries === 'undefined') return []; 
  const q = state.query.trim().toLowerCase();
  return countries.filter(c => {
    const matchQ = !q || [c.name, c.city, c.region].some(v => v.toLowerCase().includes(q));
    const matchR = state.region === 'All' || c.region === state.region;
    return matchQ && matchR;
  }).sort((a, b) => state.mode === 'sunshine' ? b.sunshineHours - a.sunshineHours : b.avgTempC - a.avgTempC);
}

function renderRegionFilters() {
  els.regionFilters.innerHTML = regions.map(r => {
    const activeClass = state.region === r 
      ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm' 
      : 'bg-white/60 text-slate-500 border-slate-200 hover:bg-white hover:text-slate-700';
    return `<button data-region="${r}" class="region-toggle whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[11px] font-bold border transition-all ${activeClass}">${r}</button>`;
  }).join('');
}

function toggleActiveBtn(btn1, btn2, condition, activeColorClass) {
  if (condition) {
    btn1.className = `metric-toggle flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all bg-white shadow-sm ${activeColorClass}`;
    btn2.className = `metric-toggle flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all text-slate-500 hover:text-slate-700`;
  } else {
    btn2.className = `metric-toggle flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all bg-white shadow-sm ${activeColorClass}`;
    btn1.className = `metric-toggle flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all text-slate-500 hover:text-slate-700`;
  }
}

function setSelectedCountry(name, panTo = true) {
  if(typeof countries === 'undefined') return;
  const c = countries.find(i => i.name === name) || countries[0];
  state.selectedName = c.name;
  const w = weatherByName.get(c.name) || {};
  
  els.selectedName.textContent = c.name;
  els.selectedFlag.textContent = c.flag;
  els.selectedMeta.textContent = `${c.city} · ${c.climate}`;
  els.selectedCurrentTemp.textContent = formatTemp(w.currentTempC);
  els.selectedFeelsLike.textContent = formatTemp(w.feelsLikeC);
  els.selectedHumidity.textContent = w.humidity ? `${w.humidity}%` : '--';
  els.selectedWind.textContent = w.windKph ? `${Math.round(w.windKph)} km/h` : '--';
  els.selectedWeatherText.innerHTML = w.label 
    ? `<strong>${w.icon || ''} ${w.label}.</strong> Expect a typical annual swing from ${formatTemp(c.lowC)} to ${formatTemp(c.highC)} in this region.` 
    : 'Weather data currently loading...';

  document.querySelectorAll('.climate-card').forEach(card => card.classList.toggle('active', card.dataset.name === c.name));
  
  if (panTo && map) {
    map.flyTo([c.lat, c.lon], Math.max(map.getZoom(), 4), { duration: 1.2, easeLinearity: 0.1 });
  }
  
  updateMapMarkers(getVisibleCountries());
  els.rightSidebar.classList.remove('hidden', 'panel-hidden-right');
}

function updateMapMarkers(visible) {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  markerByName.clear();
  
  visible.forEach(c => {
    const t = (weatherByName.get(c.name) || {}).currentTempC ?? c.avgTempC;
    const color = bandForTemp(t).color;
    const isActive = state.selectedName === c.name;
    
    const m = L.circleMarker([c.lat, c.lon], { 
      radius: isActive ? 12 : 8, 
      color: '#ffffff', 
      weight: isActive ? 3 : 2, 
      fillColor: color, 
      fillOpacity: 1,
      className: isActive ? 'shadow-xl drop-shadow-md' : 'drop-shadow-sm'
    });
    
    m.bindTooltip(`
      <div class="text-center">
        <div class="text-sm">${c.flag} ${c.name}</div>
        <div class="text-[11px] text-slate-500 mt-0.5">${formatTemp(t)}</div>
      </div>
    `, { direction: 'top', offset: [0, -10], opacity: 0.95 });
    
    m.on('click', () => setSelected