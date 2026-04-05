const VEHICLE_DB = {
  BMW: {
    models: {
      "118d": ["2.0 Diesel 143 PS", "2.0 Diesel 150 PS"],
      "320d Touring": ["2.0 Diesel 163 PS", "2.0 Diesel 190 PS"],
      "435d": ["3.0 Diesel 313 PS"]
    }
  },
  Audi: {
    models: {
      "A3 2.0 TDI": ["2.0 Diesel 150 PS", "2.0 Diesel 184 PS"],
      "A4 Avant": ["2.0 Diesel 190 PS", "2.0 Benzin 252 PS"]
    }
  },
  Mercedes: {
    models: {
      "C220 CDI": ["2.2 Diesel 170 PS"],
      "E220 CDI": ["2.0 Diesel 194 PS"]
    }
  },
  Volkswagen: {
    models: {
      "Golf 7": ["1.6 TDI 110 PS", "2.0 TDI 150 PS", "1.4 TSI 125 PS"],
      "Passat Variant": ["2.0 TDI 150 PS", "2.0 TDI 190 PS"]
    }
  },
  Opel: {
    models: {
      "Corsa C": ["1.2 Benzin 75 PS"],
      "Astra J": ["1.7 Diesel 110 PS", "1.4 Turbo 140 PS"]
    }
  }
};

let model = null;
let latestDetections = [];
let imageLoaded = false;

const vehicleClasses = ['car','truck','bus','motorcycle'];
const q = id => document.getElementById(id);
const previewImage = q('previewImage');
const overlayCanvas = q('overlayCanvas');
const statusBox = q('statusBox');
const emptyPreview = q('emptyPreview');

function setStatus(text, type='neutral'){
  statusBox.className = `status ${type}`;
  statusBox.textContent = text;
}
function euro(value){
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);
}
function titleize(value){ return value ? value.charAt(0).toUpperCase()+value.slice(1) : '–'; }
function damages(){ return Array.from(document.querySelectorAll('.damageCheck:checked')).map(x=>x.value); }
function features(){ return Array.from(document.querySelectorAll('.featureCheck:checked')).map(x=>x.value); }

function fillBrandSuggestions(){
  q('brandSuggestions').innerHTML = Object.keys(VEHICLE_DB).map(b=>`<option value="${b}">`).join('');
}
function updateModelSuggestions(){
  const brand = q('brandInput').value.trim();
  const models = VEHICLE_DB[brand]?.models || {};
  q('modelSuggestions').innerHTML = Object.keys(models).map(m=>`<option value="${m}">`).join('');
}
function updateEngineSuggestions(){
  const brand = q('brandInput').value.trim();
  const model = q('modelInput').value.trim();
  const engines = VEHICLE_DB[brand]?.models?.[model] || [];
  q('engineSuggestions').innerHTML = engines.map(e=>`<option value="${e}">`).join('');
}
function autoFillFromDb(){
  const brand = q('brandInput').value.trim();
  const model = q('modelInput').value.trim();
  const engines = VEHICLE_DB[brand]?.models?.[model] || [];
  if (engines.length && !q('engineInput').value.trim()) q('engineInput').value = engines[0];
  const text = `${brand} ${model} ${q('engineInput').value}`.toLowerCase();
  if (!q('fuelInput').value){
    if (text.includes('diesel') || text.includes('tdi') || text.includes('cdi')) q('fuelInput').value = 'Diesel';
    else if (text.includes('elektro')) q('fuelInput').value = 'Elektro';
    else if (text.includes('hybrid')) q('fuelInput').value = 'Hybrid';
    else if (text.includes('benzin') || text.includes('tsi') || text.includes('turbo')) q('fuelInput').value = 'Benzin';
  }
}

function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function handleImage(file){
  if(!file) return;
  const src = await readFileAsDataURL(file);
  previewImage.onload = () => {
    imageLoaded = true;
    previewImage.style.display = 'block';
    emptyPreview.style.display = 'none';
    syncCanvasSize();
    clearCanvas();
    setStatus('Bild geladen. KI-Analyse starten.', 'success');
  };
  previewImage.src = src;
}
function syncCanvasSize(){
  overlayCanvas.width = previewImage.clientWidth || previewImage.naturalWidth || 1;
  overlayCanvas.height = previewImage.clientHeight || previewImage.naturalHeight || 1;
}
function clearCanvas(){
  overlayCanvas.getContext('2d').clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
}
function drawDetections(dets){
  syncCanvasSize();
  const ctx = overlayCanvas.getContext('2d');
  clearCanvas();
  if(!dets.length || !previewImage.naturalWidth) return;
  const sx = overlayCanvas.width / previewImage.naturalWidth;
  const sy = overlayCanvas.height / previewImage.naturalHeight;
  ctx.lineWidth = 3;
  ctx.font = '14px Arial';
  dets.forEach(det=>{
    const [x,y,w,h] = det.bbox;
    const dx=x*sx, dy=y*sy, dw=w*sx, dh=h*sy;
    ctx.strokeStyle='#2dd4bf';
    ctx.fillStyle='rgba(45,212,191,.15)';
    ctx.strokeRect(dx,dy,dw,dh);
    ctx.fillRect(dx,dy,dw,dh);
    const text = `${det.class} ${(det.score*100).toFixed(1)}%`;
    const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle='#2dd4bf';
    ctx.fillRect(dx, Math.max(0,dy-24), tw, 22);
    ctx.fillStyle='#04131a';
    ctx.fillText(text, dx+6, Math.max(14,dy-8));
  });
}
async function loadModel(){
  if(model) return model;
  setStatus('KI-Modell lädt ...','loading');
  model = await cocoSsd.load();
  setStatus('KI-Modell geladen.','success');
  return model;
}
function bestVehicleDetection(dets){
  return dets.filter(d=>vehicleClasses.includes(d.class)).sort((a,b)=>b.score-a.score)[0] || null;
}
function createBrandHint(){
  const brand = q('brandInput').value.trim();
  const all = `${brand} ${q('modelInput').value} ${q('engineInput').value} ${q('notesInput').value}`.toLowerCase();
  if(brand) return `${brand} bestätigt`;
  if(/320d|118d|435d|xdrive|bmw/.test(all)) return 'BMW möglich';
  if(/tdi|quattro|a3|a4|a6|audi/.test(all)) return 'Audi möglich';
  if(/cdi|amg|sprinter|mercedes/.test(all)) return 'Mercedes möglich';
  if(/golf|passat|tiguan|vw|volkswagen|tsi/.test(all)) return 'VW möglich';
  if(/opel|astra|corsa/.test(all)) return 'Opel möglich';
  return 'Kein sicherer Hinweis';
}
function fillDetectionUi(dets){
  latestDetections = dets;
  const list = q('detectionsList');
  list.innerHTML = dets.length ? dets.map(d=>`<span class="chip">${titleize(d.class)} · ${(d.score*100).toFixed(1)}%</span>`).join('') : '<span class="chip">Keine Objekte erkannt</span>';
  const best = bestVehicleDetection(dets);
  q('detectedClass').textContent = best ? titleize(best.class) : 'Kein Fahrzeug sicher erkannt';
  q('detectedScore').textContent = best ? `${(best.score*100).toFixed(1)}%` : '–';
  q('brandHint').textContent = createBrandHint();
}
function guessBasePrice(vehicleType, year, fuel, transmission){
  const currentYear = new Date().getFullYear();
  const age = year ? Math.max(0,currentYear-year) : 10;
  const baseMap = {car:12800, truck:22000, bus:17500, motorcycle:6800, unknown:9500};
  const fuelFactor = {'Diesel':1.02,'Benzin':0.98,'Hybrid':1.10,'Elektro':1.14,'LPG / CNG':0.90,'':1};
  const transmissionFactor = {'Automatik':1.05,'Schaltgetriebe':0.98,'':1};
  return (baseMap[vehicleType] || baseMap.unknown) * Math.max(0.18,1-age*0.06) * (fuelFactor[fuel]||1) * (transmissionFactor[transmission]||1);
}
function calculateConditionScore(condition, damageList, notes){
  let score = 85;
  if(condition==='gebraucht') score -= 10;
  if(condition==='beschädigt') score -= 30;
  if(condition==='export') score -= 38;
  const penalty = {'Kratzer':4,'Beule':8,'Unfall':20,'Motorschaden':30,'Getriebeschaden':26,'Nicht fahrbereit':18,'Rost':12,'Airbag offen':18};
  damageList.forEach(d=>score -= penalty[d] || 0);
  if(/läuft gut|scheckheft|gepflegt|top/i.test(notes)) score += 6;
  if(/motorschaden|getriebeschaden|unfall/i.test(notes)) score -= 10;
  return Math.max(0,Math.min(100,score));
}
function buildComparables(brand, model, vehicleType, year, mileage, condition){
  const currentYear = new Date().getFullYear();
  const age = year ? currentYear-year : 10;
  let low = ({car:13000,truck:23000,bus:18000,motorcycle:6500,unknown:9500}[vehicleType] || 9500) * Math.max(0.2,1-age*0.07);
  let high = low * 1.35;
  if(mileage > 200000){ low*=0.72; high*=0.78; }
  else if(mileage > 150000){ low*=0.84; high*=0.88; }
  if(condition==='beschädigt'){ low*=0.55; high*=0.68; }
  if(condition==='export'){ low*=0.40; high*=0.52; }
  return {label:[brand || 'Unbekannte Marke', model || titleize(vehicleType)].join(' ').trim(), low:Math.max(500,Math.round(low/50)*50), high:Math.max(800,Math.round(high/50)*50)};
}
function computeValuation(){
  autoFillFromDb();
  const brand = q('brandInput').value.trim();
  const modelName = q('modelInput').value.trim();
  const year = Number(q('yearInput').value || 0);
  const mileage = Number(q('mileageInput').value || 0);
  const fuel = q('fuelInput').value;
  const transmission = q('transmissionInput').value;
  const engine = q('engineInput').value.trim();
  const radius = Number(q('radiusInput').value || 100);
  const condition = q('conditionInput').value;
  const owners = Number(q('ownersInput').value || 0);
  const tuv = q('tuvInput').value;
  const color = q('colorInput').value.trim();
  const notes = q('notesInput').value.trim();
  const damageList = damages();
  const featureList = features();
  const best = bestVehicleDetection(latestDetections);
  const vehicleType = best ? best.class : 'unknown';

  let price = guessBasePrice(vehicleType, year, fuel, transmission);
  price -= mileage * 0.035;
  price -= owners * 150;

  if(damageList.includes('Kratzer')) price *= 0.97;
  if(damageList.includes('Beule')) price *= 0.94;
  if(damageList.includes('Rost')) price *= 0.90;
  if(damageList.includes('Unfall')) price *= 0.78;
  if(damageList.includes('Motorschaden')) price *= 0.55;
  if(damageList.includes('Getriebeschaden')) price *= 0.60;
  if(damageList.includes('Nicht fahrbereit')) price *= 0.72;
  if(damageList.includes('Airbag offen')) price *= 0.76;

  if(featureList.includes('Navi')) price *= 1.01;
  if(featureList.includes('Leder')) price *= 1.02;
  if(featureList.includes('Panorama')) price *= 1.02;
  if(featureList.includes('Xenon / LED')) price *= 1.01;

  if(/m paket|amg|s line|vollleder|panorama|head up|xdrive|quattro/i.test(notes)) price *= 1.08;
  if(/scheckheft|1 hand|erste hand|gepflegt/i.test(notes)) price *= 1.04;

  if(condition==='gebraucht') price *= 0.92;
  if(condition==='beschädigt') price *= 0.72;
  if(condition==='export') price *= 0.55;

  price = Math.max(500, Math.round(price/50)*50);

  let exportPoints = 48;
  if(fuel==='Diesel') exportPoints += 8;
  if(condition==='beschädigt') exportPoints += 12;
  if(condition==='export') exportPoints += 18;
  if(mileage > 180000) exportPoints += 8;
  if(year && year < 2016) exportPoints += 6;
  if(damageList.includes('Motorschaden') || damageList.includes('Getriebeschaden')) exportPoints += 6;
  if(/export|läuft/i.test(notes)) exportPoints += 5;
  exportPoints = Math.max(0, Math.min(100, exportPoints));

  const condScore = calculateConditionScore(condition, damageList, notes);
  const comps = buildComparables(brand, modelName, vehicleType, year, mileage, condition);

  q('detectedClass').textContent = best ? titleize(best.class) : 'Kein Fahrzeug sicher erkannt';
  q('detectedScore').textContent = best ? `${(best.score*100).toFixed(1)}%` : '–';
  q('brandHint').textContent = createBrandHint();
  q('priceEstimate').textContent = euro(price);
  q('exportScore').textContent = `${exportPoints}/100`;
  q('conditionScore').textContent = `${condScore}/100`;

  q('compareBox').textContent =
`Vergleichsrahmen:
${comps.label}
Geschätzter Marktbereich: ${euro(comps.low)} bis ${euro(comps.high)}

Dein kalkulierter Händlerwert:
${euro(price)}

Interpretation:
- Untere Range = schneller Verkauf / Export / beschädigt
- Obere Range = besserer Zustand / gepflegt / gute Ausstattung`;

  q('listingOutput').value =
`${[brand, modelName].filter(Boolean).join(' ').trim() || 'Fahrzeug'}${year ? `, Baujahr ${year}` : ''}
Fahrzeugart laut KI: ${best ? titleize(best.class) : 'nicht sicher erkannt'}
Markenhinweis: ${createBrandHint()}
Motorisierung: ${engine || 'nicht angegeben'}
Kraftstoff: ${fuel || 'nicht angegeben'}
Getriebe: ${transmission || 'nicht angegeben'}
Kilometerstand: ${mileage ? `${mileage.toLocaleString('de-DE')} km` : 'nicht angegeben'}
Farbe: ${color || 'nicht angegeben'}
Zustand: ${titleize(condition)}
Vorbesitzer: ${owners || 'nicht angegeben'}
TÜV / HU: ${tuv || 'nicht angegeben'}
Ausstattung: ${featureList.length ? featureList.join(', ') : 'nicht angegeben'}
Schäden: ${damageList.length ? damageList.join(', ') : 'keine markiert'}

Preisbewertung (grob): ${euro(price)}
Export-Score: ${exportPoints}/100
Zustands-Score: ${condScore}/100

Freitext:
${notes || 'Keine zusätzlichen Hinweise.'}`;

  return {brand, model:modelName, engine, year, mileage, fuel, transmission, radius, owners, tuv, color, condition, damageList, featureList, notes, vehicleType, price, exportPoints, condScore, comps, detections: latestDetections, listing:q('listingOutput').value};
}
function downloadJson(data){
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'auto-dealer-app-v3.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function saveLocal(){
  const data = computeValuation();
  localStorage.setItem('autoDealerAppV3', JSON.stringify(data));
  setStatus('Lokal gespeichert.','success');
}
function loadLocal(){
  const raw = localStorage.getItem('autoDealerAppV3');
  if(!raw){ setStatus('Kein lokaler Stand gefunden.','error'); return; }
  const d = JSON.parse(raw);
  q('brandInput').value = d.brand || '';
  updateModelSuggestions();
  q('modelInput').value = d.model || '';
  updateEngineSuggestions();
  q('engineInput').value = d.engine || '';
  q('yearInput').value = d.year || '';
  q('mileageInput').value = d.mileage || '';
  q('fuelInput').value = d.fuel || '';
  q('transmissionInput').value = d.transmission || '';
  q('radiusInput').value = d.radius || 100;
  q('ownersInput').value = d.owners || '';
  q('tuvInput').value = d.tuv || '';
  q('colorInput').value = d.color || '';
  q('conditionInput').value = d.condition || 'gut';
  q('notesInput').value = d.notes || '';
  document.querySelectorAll('.damageCheck').forEach(el => el.checked = (d.damageList || []).includes(el.value));
  document.querySelectorAll('.featureCheck').forEach(el => el.checked = (d.featureList || []).includes(el.value));
  q('listingOutput').value = d.listing || '';
  setStatus('Lokale Daten geladen.','success');
}
function validateVin(vin){
  const cleaned = vin.replace(/[^A-Z0-9]/gi,'').toUpperCase();
  if(cleaned.length !== 17) return {ok:false, msg:'VIN ungültig: muss 17 Zeichen haben.'};
  if(/[IOQ]/.test(cleaned)) return {ok:false, msg:'VIN ungültig: I, O und Q sind nicht erlaubt.'};
  return {ok:true, msg:`VIN formal okay: ${cleaned}\n\nNächster Schritt für echte Historie:\n- carVertical oder anderer VIN-Dienst anbinden\n- Report zu Unfällen, Laufleistung, Diebstahl, Haltern, Schäden laden`};
}
function fillDemo(){
  q('brandInput').value = 'BMW';
  updateModelSuggestions();
  q('modelInput').value = '320d Touring';
  updateEngineSuggestions();
  q('engineInput').value = '2.0 Diesel 190 PS';
  q('fuelInput').value = 'Diesel';
  q('transmissionInput').value = 'Automatik';
  q('yearInput').value = '2017';
  q('mileageInput').value = '189000';
  q('colorInput').value = 'Schwarz';
  q('conditionInput').value = 'gebraucht';
  q('radiusInput').value = '150';
  q('ownersInput').value = '2';
  q('notesInput').value = 'Läuft gut, M Paket, kleine Kratzer hinten links, exportfähig.';
  document.querySelectorAll('.damageCheck').forEach(el => el.checked = ['Kratzer'].includes(el.value));
  document.querySelectorAll('.featureCheck').forEach(el => el.checked = ['Navi','Leder'].includes(el.value));
  setStatus('Demo geladen.','success');
}
function resetApp(){ location.reload(); }

q('fileInput').addEventListener('change', e => handleImage(e.target.files?.[0]));
q('cameraInput').addEventListener('change', e => handleImage(e.target.files?.[0]));
q('brandInput').addEventListener('input', () => { updateModelSuggestions(); updateEngineSuggestions(); });
q('modelInput').addEventListener('input', () => { updateEngineSuggestions(); autoFillFromDb(); });
q('engineInput').addEventListener('input', autoFillFromDb);

q('analyzeBtn').addEventListener('click', async () => {
  if(!imageLoaded){ setStatus('Bitte zuerst ein Bild laden.','error'); return; }
  try{
    await loadModel();
    setStatus('Analyse läuft ...','loading');
    const preds = await model.detect(previewImage);
    fillDetectionUi(preds);
    drawDetections(preds);
    setStatus('Analyse abgeschlossen.','success');
  }catch(err){
    console.error(err);
    setStatus('Analyse fehlgeschlagen. Prüfe Internet und Browser.','error');
  }
});
q('calculateBtn').addEventListener('click', () => { computeValuation(); setStatus('Berechnung fertig.','success'); });
q('saveLocalBtn').addEventListener('click', saveLocal);
q('loadLocalBtn').addEventListener('click', loadLocal);
q('jsonBtn').addEventListener('click', () => downloadJson(computeValuation()));
q('copyBtn').addEventListener('click', async () => {
  const text = q('listingOutput').value.trim();
  if(!text){ setStatus('Noch kein Text vorhanden.','error'); return; }
  try{ await navigator.clipboard.writeText(text); setStatus('Text kopiert.','success'); }
  catch{ setStatus('Kopieren nicht möglich.','error'); }
});
q('vinBtn').addEventListener('click', () => {
  const res = validateVin(q('vinInput').value);
  q('vinBox').textContent = res.msg;
  setStatus(res.ok ? 'VIN geprüft.' : 'VIN ungültig.', res.ok ? 'success' : 'error');
});
q('demoBtn').addEventListener('click', fillDemo);
q('resetBtn').addEventListener('click', resetApp);
window.addEventListener('resize', () => { if(previewImage.src){ syncCanvasSize(); drawDetections(latestDetections); } });

fillBrandSuggestions();
loadModel().catch(()=>setStatus('KI-Modell konnte nicht vorgeladen werden.','neutral'));
