const $=id=>document.getElementById(id);
let events=[], trendRows=[], trendMeta=null, map, markers, markerLayer;
function fmt(n,d=1){return Number(n).toFixed(d)}
function setStatus(s){$('globalStatus').textContent=s}
let baseLayer, labelLayer, satelliteLayer, layerControl;
const gibsLayers={
 VIIRS_SNPP_CorrectedReflectance_TrueColor:{name:'VIIRS true colour',ext:'jpg',max:9},
 MODIS_Terra_CorrectedReflectance_TrueColor:{name:'MODIS true colour',ext:'jpg',max:9},
 MODIS_Terra_NDVI_8Day:{name:'Vegetation NDVI',ext:'png',max:9},
 MODIS_Terra_Land_Surface_Temp_Day:{name:'Land surface temperature',ext:'png',max:9},
 MODIS_Terra_Thermal_Anomalies_All:{name:'Thermal anomalies',ext:'png',max:9}
};
function recentGibsDate(){const d=new Date();d.setUTCDate(d.getUTCDate()-3);return d.toISOString().slice(0,10)}
function buildSatelliteLayer(){
 const layerName=$('satLayer').value,meta=gibsLayers[layerName]||gibsLayers.VIIRS_SNPP_CorrectedReflectance_TrueColor;
 const date=$('satDate').value||recentGibsDate();
 const opacity=Number($('satOpacity').value)/100;
 return L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerName}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${meta.ext}`,{maxZoom:meta.max,maxNativeZoom:meta.max,opacity,pane:'satPane',attribution:'NASA GIBS · '+meta.name});
}
function applySatelliteLayer(){
 if(satelliteLayer)map.removeLayer(satelliteLayer);
 satelliteLayer=buildSatelliteLayer();satelliteLayer.addTo(map);
 $('satLayer').title='NASA GIBS: '+(gibsLayers[$('satLayer').value]?.name||'Satellite imagery');
 $('satDate').title='Requested NASA imagery date: '+($('satDate').value||recentGibsDate());
}
function initMap(){
 map=L.map('map',{worldCopyJump:true}).setView([20,0],2);
 map.createPane('satPane').style.zIndex=250;
 map.createPane('labelPane').style.zIndex=350;map.getPane('labelPane').style.pointerEvents='none';
 baseLayer=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,maxNativeZoom:16,attribution:'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors'}).addTo(map);
 labelLayer=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,maxNativeZoom:16,pane:'labelPane'}).addTo(map);
 let baseErrors=0;
 baseLayer.on('tileerror',()=>{ if(++baseErrors===6){ map.removeLayer(baseLayer); baseLayer=L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',{maxZoom:19,maxNativeZoom:8,attribution:'NASA GIBS · Blue Marble'}).addTo(map); baseLayer.bringToBack(); } });
 const d=new Date();d.setUTCDate(d.getUTCDate()-3);$('satDate').value=d.toISOString().slice(0,10);
 applySatelliteLayer();
 L.control.layers({'Base map':baseLayer},{'NASA satellite imagery':satelliteLayer,'Place labels':labelLayer},{collapsed:true}).addTo(map);
 markerLayer=L.layerGroup().addTo(map);
 map.on('click',e=>{ $('lat').value=e.latlng.lat.toFixed(4);$('lon').value=e.latlng.lng.toFixed(4);$('locName').value='Map selection';$('kRegion').textContent='Map selection';if(window.placeMarker)map.removeLayer(window.placeMarker);window.placeMarker=L.marker(e.latlng).addTo(map).bindPopup('Study point · '+e.latlng.lat.toFixed(4)+', '+e.latlng.lng.toFixed(4)).openPopup();$('trendStatus').textContent='Map coordinates selected. Choose an indicator and click Analyse region.';});
}
function eventCategory(e){return (e.categories||[]).map(c=>c.title).join(', ')||'Natural event'}
function eventCoords(e){let g=e.geometry?.[e.geometry.length-1];if(!g)return null;let c=g.coordinates;if(g.type==='Point')return [c[1],c[0]];if(g.type==='Polygon')return [c[0][0][1],c[0][0][0]];return null}
async function loadEvents(){
 $('eventList').innerHTML='<div class="status">Fetching NASA EONET events…</div>';
 try{
  const r=await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100'); if(!r.ok)throw Error('EONET HTTP '+r.status);
  const j=await r.json(); events=j.events||[]; populateEventFilters(); $('kEvents').textContent=events.length.toLocaleString(); $('kConnection').textContent='Online'; $('eventCount').textContent=events.length+' events'; setStatus('NASA event feed connected');
  renderEvents(); $('updatedAt').textContent=' · Updated '+new Date().toLocaleTimeString();
 }catch(err){$('eventList').innerHTML='<div class="status">NASA EONET could not be reached. Check internet access and retry.</div>'; $('kEvents').textContent='Unavailable';$('kConnection').textContent='Offline';setStatus('Some NASA sources unavailable');console.warn(err)}
}
function populateEventFilters(){
 const select=$('eventFilter'),chosen=select.value;
 const cats=[...new Set(events.flatMap(e=>(e.categories||[]).map(c=>c.title)))].sort();
 select.innerHTML='<option value="all">All event types</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
 if(cats.includes(chosen))select.value=chosen;
}
function renderEvents(){
 markerLayer.clearLayers(); let f=$('eventFilter').value;
 let filtered=events.filter(e=>f==='all'||(e.categories||[]).some(c=>c.title===f));
 filtered.forEach(e=>{let p=eventCoords(e);if(!p)return;let m=L.circleMarker(p,{radius:6,color:'#58d5e8',weight:1,fillColor:'#3d9bd4',fillOpacity:.85}).bindPopup(`<b>${esc(e.title)}</b><br>${esc(eventCategory(e))}<br>${esc(e.geometry?.at(-1)?.date||'Date not supplied')}<br><a href="${esc(e.sources?.[0]?.url||'https://eonet.gsfc.nasa.gov/')}" target="_blank" rel="noopener">Source details ↗</a>`);markerLayer.addLayer(m)});
 $('eventList').innerHTML=filtered.slice(0,35).map(e=>`<div class="event"><strong>${esc(e.title)}</strong><small>${esc(eventCategory(e))} · ${esc((e.geometry?.at(-1)?.date||'Date unavailable').slice(0,10))}</small><br><span class="tag">${(e.geometry||[]).length} observation(s)</span></div>`).join('')||'<div class="status">No events match this filter in the current feed.</div>';
 $('eventCount').textContent=filtered.length+' shown';
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('eventFilter').addEventListener('change',renderEvents);

async function findPlace(){
 const input=$('placeSearch'),q=input.value.trim(),status=$('placeStatus');
 if(!q){status.textContent='Enter a city, region or country name.';input.focus();return}
 status.textContent='Searching worldwide place database…';
 $('searchPlace').disabled=true;
 try{
  let places=[];
  const url='https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(q)+'&count=8&language=en&format=json';
  const response=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!response.ok)throw Error('Geocoder returned HTTP '+response.status);
  const data=await response.json();
  places=(data.results||[]).map(x=>({name:[x.name,x.admin1,x.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', '),lat:Number(x.latitude),lon:Number(x.longitude),label:[x.name,x.admin1,x.country].filter(Boolean).join(', ')}));
  if(!places.length){
   const alt=await fetch('https://photon.komoot.io/api/?limit=6&q='+encodeURIComponent(q));
   if(alt.ok){const j=await alt.json();places=(j.features||[]).map(f=>{const p=f.properties||{},c=f.geometry?.coordinates||[];return {name:[p.name,p.city,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', '),lat:Number(c[1]),lon:Number(c[0]),label:[p.name,p.city,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}}).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon))}
  }
  places=places.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&Math.abs(x.lat)<=90&&Math.abs(x.lon)<=180);
  if(!places.length){status.textContent='No match. Try a larger town, city or country.';return}
  if(places.length===1){selectPlace(places[0]);status.textContent='Located: '+places[0].label;return}
  status.textContent='Choose a match below:';
  const menu=document.createElement('div');menu.className='place-results';
  menu.style.cssText='position:absolute;z-index:1200;right:14px;top:100%;min-width:260px;max-width:min(92vw,420px);max-height:260px;overflow:auto;background:#0b1d2d;border:1px solid #3c6786;border-radius:10px;box-shadow:0 12px 35px #0009;padding:6px';
  places.forEach(place=>{const b=document.createElement('button');b.type='button';b.textContent=place.label;b.style.cssText='display:block;width:100%;text-align:left;padding:10px;background:transparent;color:#d9efff;border:0;border-bottom:1px solid #28435a;cursor:pointer';b.onclick=()=>{selectPlace(place);status.textContent='Located: '+place.label;menu.remove()};menu.appendChild(b)});
  const old=document.querySelector('.place-results');if(old)old.remove();
  const host=input.parentElement;host.style.position='relative';host.appendChild(menu);
 }catch(err){status.textContent='Place search failed: '+(err.message||'network error')+'. Check internet or use map click / coordinates.'}
 finally{$('searchPlace').disabled=false}
}
function selectPlace(place){
 $('locName').value=place.name||place.label;
 $('lat').value=Number(place.lat).toFixed(4);$('lon').value=Number(place.lon).toFixed(4);
 $('kRegion').textContent=(place.name||place.label).slice(0,18);
 if(map){map.setView([place.lat,place.lon],7);if(window.placeMarker)map.removeLayer(window.placeMarker);window.placeMarker=L.marker([place.lat,place.lon]).addTo(map).bindPopup(esc(place.label||place.name)).openPopup()}
 $('trendStatus').textContent='Location set to '+(place.label||place.name)+'. Select an indicator and choose Analyse region.';
}
$('searchPlace').onclick=findPlace;
$('placeSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findPlace()}});
$('placeSearch').addEventListener('input',()=>{const m=document.querySelector('.place-results');if(m)m.remove()});
$('refreshBtn').onclick=()=>{loadEvents();if(trendRows.length)loadTrend()};
function drawChart(rows,param){
 const c=$('trendChart'),ctx=c.getContext('2d'),w=c.clientWidth,h=c.clientHeight,dpr=window.devicePixelRatio||1;c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
 const vals=rows.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),pad={l:48,r:14,t:18,b:32},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
 ctx.strokeStyle='#1e3b53';ctx.fillStyle='#91a9bf';ctx.font='10px system-ui';ctx.lineWidth=1;
 for(let i=0;i<5;i++){let y=pad.t+ch*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();let v=max-(max-min)*i/4;ctx.fillText(fmt(v,1),4,y+3)}
 const x=i=>pad.l+cw*i/Math.max(1,vals.length-1),y=v=>pad.t+ch-(v-min)/(max-min||1)*ch;
 ctx.beginPath();vals.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.strokeStyle='#5bd6e8';ctx.lineWidth=2;ctx.stroke();
 ctx.lineTo(x(vals.length-1),pad.t+ch);ctx.lineTo(x(0),pad.t+ch);ctx.closePath();ctx.fillStyle='rgba(91,214,232,.10)';ctx.fill();
 ctx.fillStyle='#91a9bf';ctx.fillText(rows[0].date,pad.l,h-8);ctx.fillText(rows.at(-1).date,Math.max(pad.l,w-85),h-8);
}
async function loadTrend(){
 const lat=Number($('lat').value),lon=Number($('lon').value),param=$('parameter').value;
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){alert('Enter valid latitude (-90 to 90) and longitude (-180 to 180).');return}
 $('trendStatus').textContent='Requesting historical data from NASA POWER…';$('loadTrend').disabled=true;
 const end=new Date();end.setDate(end.getDate()-5);const start=new Date(end);start.setFullYear(start.getFullYear()-Number($('historyYears').value));
 const ymd=d=>d.toISOString().slice(0,10).replaceAll('-','');
 const url=`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${param}&community=RE&longitude=${lon}&latitude=${lat}&start=${ymd(start)}&end=${ymd(end)}&format=JSON`;
 try{
  const res=await fetch(url);if(!res.ok)throw Error('NASA POWER HTTP '+res.status);const data=await res.json();const obj=data.properties.parameter[param];const rows=Object.entries(obj).filter(([k,v])=>Number.isFinite(v)&&v>-900).map(([k,v])=>({date:k.slice(0,4)+'-'+k.slice(4,6)+'-'+k.slice(6,8),value:v}));
  if(rows.length<5)throw Error('Not enough valid observations returned for this request.');
  trendRows=rows;trendMeta={location:$('locName').value,lat,lon,param,unit:data.parameters?.[param]?.units||unitFor(param),generated:new Date().toISOString()};
  drawChart(rows,param);const n=Math.max(3,Math.floor(rows.length*.2)),old=rows.slice(0,n),recent=rows.slice(-n),avg=a=>a.reduce((s,x)=>s+x.value,0)/a.length,oa=avg(old),na=avg(recent),delta=na-oa,unit=unitFor(param);
  $('oldAvg').textContent=fmt(oa,2)+' '+unit;$('newAvg').textContent=fmt(na,2)+' '+unit;$('oldDate').textContent=old[0].date+' to '+old.at(-1).date;$('newDate').textContent=recent[0].date+' to '+recent.at(-1).date;
  $('comparisonText').textContent=`Recent-period average is ${Math.abs(delta).toFixed(2)} ${unit} ${delta>=0?'higher':'lower'} than the earlier-period average. This is a simple comparison, not proof of a long-term climate trend.`;
  $('trendStatus').textContent=`Loaded ${rows.length} valid daily observations for ${trendMeta.location||'selected coordinates'}.`;
  $('kRegion').textContent=(trendMeta.location||'Selected area').slice(0,15);
  makeInsights(rows,trendMeta,oa,na,delta);
 }catch(err){$('trendStatus').textContent='Could not load NASA POWER data: '+err.message+'. Check connection or try another location/date.';console.error(err)}
 finally{$('loadTrend').disabled=false}
}
function unitFor(p){return ({T2M:'°C',T2M_MAX:'°C',T2M_MIN:'°C',T2MDEW:'°C',TS:'°C',PRECTOTCORR:'mm/day',RH2M:'%',QV2M:'g/kg',GWETROOT:'fraction',GWETTOP:'fraction',WS2M:'m/s',PS:'kPa',ALLSKY_SFC_SW_DWN:'kWh/m²/day'})[p]||''}
function makeInsights(rows,meta,old,now,delta){
 const unit=unitFor(meta.param),name=meta.location||'selected region',direction=delta>0?'increased':'decreased',pct=old!==0?Math.abs(delta/old*100):null;
 let title,detail,level='';if(meta.param==='T2M'){title=`Temperature ${direction} in the recent comparison window`;detail=`The recent-period mean is ${Math.abs(delta).toFixed(2)} ${unit} ${delta>=0?'above':'below'} the earlier-period mean. Check seasonal timing and longer records before interpreting this as climate change.`;level=delta>1?'warn':''}
 else if(meta.param==='PRECTOTCORR'){title=`Precipitation ${direction} in the recent comparison window`;detail=`The average daily precipitation changed by ${Math.abs(delta).toFixed(2)} ${unit}. Rainfall is highly seasonal; compare matching months across multiple years for stronger conclusions.`;level='warn'}
 else if(meta.param==='RH2M'){title=`Relative humidity ${direction} in the recent comparison window`;detail=`The recent-period mean changed by ${Math.abs(delta).toFixed(2)} percentage points. Humidity varies with season, temperature and local weather.`}
 else if(['T2M_MAX','T2M_MIN','T2MDEW','TS'].includes(meta.param)){title=`Temperature signal ${direction}`;detail=`The selected temperature indicator changed by ${Math.abs(delta).toFixed(2)} ${unit}. Compare matching seasons and several years before interpreting it as a climate trend.`}
 else if(['GWETROOT','GWETTOP'].includes(meta.param)){title=`Soil wetness signal ${direction}`;detail=`The modelled soil-wetness fraction changed by ${Math.abs(delta).toFixed(3)}. Soil moisture responds to rainfall, evaporation, vegetation and soil properties.`}
 else if(meta.param==='QV2M'){title=`Atmospheric moisture ${direction}`;detail=`Specific humidity changed by ${Math.abs(delta).toFixed(2)} ${unit}. Interpret alongside temperature, rainfall and circulation patterns.`}
 else if(meta.param==='PS'){title=`Surface pressure ${direction}`;detail=`Surface pressure changed by ${Math.abs(delta).toFixed(2)} ${unit}. Pressure patterns are most useful when compared with wind and weather observations.`}
 else{title=`Wind / energy signal ${direction}`;detail=`The selected indicator changed by ${Math.abs(delta).toFixed(2)} ${unit}. Use additional environmental variables to understand the pattern.`}
 const min=Math.min(...rows.map(r=>r.value)),max=Math.max(...rows.map(r=>r.value)),avg=rows.reduce((s,r)=>s+r.value,0)/rows.length;
 $('insights').innerHTML=`<div class="insight ${level}"><strong>🔎 ${esc(title)}</strong><p>${esc(detail)}</p></div><div class="insight"><strong>📍 Study area: ${esc(name)}</strong><p>Coordinates ${meta.lat.toFixed(3)}, ${meta.lon.toFixed(3)}. Parameter: ${esc(meta.param)}.</p></div><div class="insight"><strong>📊 Dataset summary</strong><p>${rows.length} valid daily observations · mean ${avg.toFixed(2)} ${unit} · observed range ${min.toFixed(2)} to ${max.toFixed(2)} ${unit}.</p></div><div class="insight warn"><strong>🧭 Detective's next step</strong><p>Compare the same months across several years and corroborate this signal with satellite imagery or another independent dataset before making a causal claim.</p></div>`;
}

function updateMoonWidget(){
 const now=new Date(),synodic=29.530588853,knownNew=Date.UTC(2000,0,6,18,14);
 const age=((now.getTime()-knownNew)/86400000%synodic+synodic)%synodic;
 const illumination=(1-Math.cos(2*Math.PI*age/synodic))/2;
 const phases=['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
 const index=Math.round(age/synodic*8)%8;
 $('moonPhase').textContent=phases[index];
 $('moonIllum').textContent='Illumination · '+Math.round(illumination*100)+'%';
 $('moonDate').textContent=now.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'short',day:'numeric'});
 const disc=$('moonDisc'),waxing=age<synodic/2;
 const phaseFraction=age/synodic;
 const shadow=illumination<.5?(waxing?'inset 24px 0 25px #111a2b':'inset -24px 0 25px #111a2b'):(waxing?'inset -18px 0 22px #111a2b':'inset 18px 0 22px #111a2b');
 disc.style.boxShadow=shadow+', inset -17px -8px 24px #0a1224, 0 0 26px #d9e6ff44';
}
function updateMissionClock(){ $('missionClock').textContent=new Date().toISOString().slice(11,19); }
updateMoonWidget();updateMissionClock();setInterval(updateMissionClock,1000);setInterval(updateMoonWidget,60000);
document.querySelectorAll('.mini-link').forEach(b=>b.addEventListener('click',()=>{
 $('parameter').value=b.dataset.param;
 document.querySelector('#trends').scrollIntoView({behavior:'smooth'});
 $('trendStatus').textContent='Indicator selected. Choose Analyse region to load the climate record.';
}));

$('loadTrend').onclick=loadTrend;
$('parameter').onchange=()=>{if(trendRows.length)loadTrend()};
$('applySatellite').onclick=applySatelliteLayer;
$('satLayer').onchange=applySatelliteLayer;
$('satOpacity').oninput=()=>{if(satelliteLayer)satelliteLayer.setOpacity(Number($('satOpacity').value)/100)};

const detectiveRegions={
 arctic:{name:'Arctic Circle',lat:70,lon:-40},
 eurasia:{name:'Central Eurasia',lat:50,lon:70},
 amazon:{name:'Amazon Rainforest',lat:-3,lon:-60},
 monsoon:{name:'South Asian Monsoon',lat:20,lon:78},
 antarctic:{name:'Antarctic interior',lat:-80,lon:0},
 pacific:{name:'Tropical Pacific',lat:0,lon:-150}
};

const pairSets={arctic:['arctic','eurasia'],amazon:['amazon','monsoon'],antarctic:['antarctic','pacific']};
document.querySelectorAll('.preset-pair').forEach(b=>b.addEventListener('click',()=>{
 const pair=pairSets[b.dataset.pair];$('compareA').value=pair[0];$('compareB').value=pair[1];
}));
function regressionPerDecade(points){
 const n=points.length;if(n<3)return null;
 const mx=points.reduce((s,p)=>s+p.year,0)/n,my=points.reduce((s,p)=>s+p.value,0)/n;
 let num=0,den=0;for(const p of points){num+=(p.year-mx)*(p.value-my);den+=(p.year-mx)**2}
 return den?num/den*10:0;
}
function drawCompareChart(id,points,color){
 const c=$(id),ctx=c.getContext('2d'),w=c.clientWidth||420,h=180,dpr=window.devicePixelRatio||1;
 c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const vals=points.map(p=>p.value),min=Math.min(...vals),max=Math.max(...vals),pad={l:40,r:10,t:14,b:25},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
 ctx.font='10px system-ui';ctx.lineWidth=1;ctx.strokeStyle='#29445a';ctx.fillStyle='#91a9bf';
 for(let i=0;i<4;i++){const y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText((max-(max-min)*i/3).toFixed(1),3,y+3)}
 const x=i=>pad.l+cw*i/Math.max(1,vals.length-1),y=v=>pad.t+ch-(v-min)/(max-min||1)*ch;
 ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(i),y(p.value)):ctx.moveTo(x(i),y(p.value)));
 ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle='#9bb3c7';ctx.fillText(points[0].year,pad.l,h-6);ctx.fillText(points.at(-1).year,w-43,h-6);
}
async function fetchAnnualClimate(region,param,years){
 const endYear=new Date().getUTCFullYear()-1,startYear=endYear-years+1;
 const url=`https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=${param}&community=RE&longitude=${region.lon}&latitude=${region.lat}&start=${startYear}01&end=${endYear}12&format=JSON`;
 const res=await fetch(url);if(!res.ok)throw Error('NASA POWER monthly request failed ('+res.status+')');
 const json=await res.json(),series=json.properties?.parameter?.[param];if(!series)throw Error('No monthly data returned for '+region.name);
 const buckets={};
 for(const [ym,v] of Object.entries(series)){if(!Number.isFinite(v)||v<=-900)continue;const yr=Number(ym.slice(0,4));(buckets[yr]??=[]).push(v)}
 return Object.entries(buckets).map(([year,values])=>({year:Number(year),value:values.reduce((a,b)=>a+b,0)/values.length})).sort((a,b)=>a.year-b.year);
}
$('runCompare').onclick=async()=>{
 const a=detectiveRegions[$('compareA').value],b=detectiveRegions[$('compareB').value],param=$('compareParam').value,years=Number($('compareYears').value);
 if(!a||!b)return;
 $('runCompare').disabled=true;$('compareStatus').textContent='Retrieving monthly NASA POWER records for both regions…';
 $('compareNameA').textContent=a.name;$('compareNameB').textContent=b.name;
 try{
  const [pa,pb]=await Promise.all([fetchAnnualClimate(a,param,years),fetchAnnualClimate(b,param,years)]);
  if(pa.length<3||pb.length<3)throw Error('Not enough annual records for a reliable comparison. Try another indicator or longer period.');
  const sa=regressionPerDecade(pa),sb=regressionPerDecade(pb),unit=unitFor(param);
  $('compareSlopeA').textContent=(sa>=0?'+':'')+sa.toFixed(2)+' '+unit+'/decade';
  $('compareSlopeB').textContent=(sb>=0?'+':'')+sb.toFixed(2)+' '+unit+'/decade';
  $('compareDetailA').textContent=`Annual means · ${pa[0].year}–${pa.at(-1).year} · ${pa.length} years`;
  $('compareDetailB').textContent=`Annual means · ${pb[0].year}–${pb.at(-1).year} · ${pb.length} years`;
  drawCompareChart('compareChartA',pa,'#5bd6e8');drawCompareChart('compareChartB',pb,'#e9bd54');
  const gap=Math.abs(sa-sb);
  $('compareClue').innerHTML='<b>Detective clue</b><p>'+esc(a.name)+' trend: <b>'+sa.toFixed(2)+' '+unit+'/decade</b>. '+esc(b.name)+' trend: <b>'+sb.toFixed(2)+' '+unit+'/decade</b>. The estimated trend-rate difference is '+gap.toFixed(2)+' '+unit+'/decade. These are linear trends in annual means, not a significance test or proof of causation. Check data coverage, seasonality and other drivers before drawing conclusions.</p>';
  $('compareStatus').textContent='Comparison complete using NASA POWER monthly data. Annual means reduce the seasonal cycle; trend estimates remain sensitive to the selected time window.';
 }catch(err){$('compareStatus').textContent='Comparison unavailable: '+err.message+'. Try again later or choose a different indicator.'}
 finally{$('runCompare').disabled=false}
};

document.querySelectorAll('.region-btn').forEach(b=>b.addEventListener('click',()=>{if(!map||!window.L)return;const lat=Number(b.dataset.lat),lon=Number(b.dataset.lon),zoom=Number(b.dataset.zoom);map.setView([lat,lon],zoom);$('lat').value=lat;$('lon').value=lon;$('locName').value=b.textContent.trim();$('kRegion').textContent=b.textContent.trim();if(window.placeMarker)map.removeLayer(window.placeMarker);window.placeMarker=L.marker([lat,lon]).addTo(map).bindPopup(esc(b.textContent.trim())).openPopup();$('trendStatus').textContent='Region selected. Click Analyse region to load NASA POWER data.';}));
document.querySelectorAll('.topic-card').forEach(card=>{const btn=card.querySelector('.topic-go');if(btn)btn.addEventListener('click',()=>{const layer=card.dataset.layer;if(layer){$('satLayer').value=layer;applySatelliteLayer();document.querySelector('#monitor').scrollIntoView({behavior:'smooth'});}})});
$('downloadReport').onclick=()=>{
 if(!trendRows.length){alert('Load a regional analysis first.');return}
 const report={project:'ECO EYE',notice:'Independent student prototype; not an official NASA product.',source:'NASA POWER daily point API',metadata:trendMeta,observations:trendRows,analysis:$('insights').innerText,comparison:$('comparisonText').innerText};
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ecoeye-investigation-report.json';a.click();URL.revokeObjectURL(a.href);
};
window.addEventListener('resize',()=>{if(trendRows.length)drawChart(trendRows,trendMeta?.param)});
try{
 if(window.L){
  initMap();
  setTimeout(()=>map && map.invalidateSize(),250);
  window.addEventListener('load',()=>setTimeout(()=>map && map.invalidateSize(),300));
 }else{
  $('map').innerHTML='<div style="padding:24px;color:#e8f3ff">The interactive map library could not load. Check your internet connection or open this page in a browser that allows external scripts. You can still use NASA Worldview: <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener" style="color:#5bd6e8">Open NASA Worldview ↗</a></div>';
  $('placeStatus').textContent='Map library unavailable — check connection';
 }
}catch(mapError){
 console.error('Map initialization failed:',mapError);
 $('map').innerHTML='<div style="padding:24px;color:#e8f3ff">Map initialization failed: '+esc(mapError.message)+'. Reload the page or open NASA Worldview.</div>';
 $('placeStatus').textContent='Map initialization failed';
}
loadEvents();$('footerTime').textContent=' · Session '+new Date().toLocaleString();
setInterval(loadEvents,15*60*1000); // refresh event observations every 15 minutes while this page remains open
