/* Verifica FWA: raccoglie posizione, piano, tetto ed esposizione dei balconi e li consegna in un file JSON
   che lo strumento "Linea di vista FWA" importa (Ordini nuovi > Importa ordini dall'app). */
(function () {
  'use strict';
  var C = window.CONFIG, $ = function (id) { return document.getElementById(id); };
  var Cap = window.Capacitor, nativo = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform()), P = (Cap && Cap.Plugins) || {};
  var stato = carica() || { codice: '', pos: null, piano: 0, pianiEd: null, tetto: null, balconi: [] };
  var schermo = 0;

  // ---------- memoria della bozza (resta sul telefono) ----------
  function salvaBozza() {
    try { localStorage.setItem('verifica_fwa', JSON.stringify(stato)); }
    catch (e) {                                             // memoria piena per le foto: la bozza si tiene senza foto
      try { localStorage.setItem('verifica_fwa', JSON.stringify(stato, function (k, v) { return k === 'foto' || k === 'tettoFoto' ? null : v; })); } catch (e2) { /* memoria non disponibile */ }
    }
  }

  // ---------- foto dal tetto e dai balconi: ridotte a 1280 px in JPEG, entrano nel file della verifica ----------
  var FOTO_LATO = 1280, FOTO_QUALITA = 0.72;
  function riduciFoto(file) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, FOTO_LATO / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
        cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        ok(cv.toDataURL('image/jpeg', FOTO_QUALITA));
      };
      im.onerror = function () { URL.revokeObjectURL(url); ko(new Error('formato della foto non leggibile')); };
      im.src = url;
    });
  }
  function kB(d) { return Math.round(d.length * 0.75 / 1024); }
  function bloccoFoto(id, prendi, metti) {
    var box = $(id), img = box.querySelector('.foto-img'), st = box.querySelector('.foto-stato');
    function mostra() {
      var d = prendi(); img.hidden = !d; if (d) img.src = d; else img.removeAttribute('src');
      box.querySelector('.foto-t').textContent = d ? 'Rifai la foto' : 'Scatta una foto';
      box.querySelector('.foto-via').hidden = !d; st.textContent = d ? 'Foto pronta (' + kB(d) + ' kB): verrà inviata con la verifica.' : '';
    }
    box.querySelectorAll('input[type=file]').forEach(function (inp) { inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      st.textContent = 'Preparo la foto…';
      riduciFoto(f).then(function (d) { metti(d); mostra(); }).catch(function (e) { st.textContent = 'Foto non usata: ' + e.message + '.'; });
    }); });
    box.querySelector('.foto-via').addEventListener('click', function () { metti(null); mostra(); });
    box.querySelector('.foto-bt').addEventListener('click', function (ev) {   // nel simulatore dello strumento la "fotocamera" e' il modello 3D
      var S = window.__sim; if (!S || typeof S.foto !== 'function') return;
      ev.preventDefault(); var d = S.foto(id === 'tetto-foto' ? 'tetto' : 'balcone');
      if (d) { metti(d); mostra(); } else st.textContent = 'Il simulatore non ha ancora una casa scelta.';
    });
    return { mostra: mostra, box: box };
  }
  function carica() { try { return JSON.parse(localStorage.getItem('verifica_fwa') || 'null'); } catch (e) { return null; } }

  // ---------- navigazione ----------
  var PASSO = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 5 };
  function vai(n) {
    if (schermo === 1 && n !== 1) fermaGps();
    if (schermo === 5 && n !== 5) { fermaBussola(); fermaGps(); }
    schermo = n;
    document.querySelectorAll('.schermo').forEach(function (s) { s.hidden = +s.dataset.s !== n; });
    $('passo-n').textContent = n === 0 ? 'Prima di iniziare' : 'Passo ' + PASSO[n] + ' di 5';
    $('barra').style.width = (PASSO[n] / 5 * 100) + '%';
    if (n === 1) { destGps = 'casa'; avviaGps(); } if (n === 2) mostraPiano(); if (n === 4) mostraBalconi(); if (n === 6) riepilogo();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-vai]').forEach(function (b) { b.addEventListener('click', function () { vai(+b.dataset.vai); }); });
  $('codice').value = stato.codice || '';
  $('codice').addEventListener('input', function () { stato.codice = this.value.trim(); salvaBozza(); });

  // ---------- 1. posizione ----------
  var idGps = null, idCap = null, destGps = 'casa', posBal = null, letture = [], soloApprossimata = false;
  // con il telefono fermo si fa la media delle letture degli ultimi 20 secondi: si scartano quelle molto meno precise
  // della migliore e quelle lontane dalle altre; la precisione mostrata resta quella della lettura migliore (gli errori
  // del GPS di letture vicine nel tempo sono legati fra loro: la media toglie il tremolio, non promette di piu')
  var FINESTRA_MS = 20000;
  function mediaLetture() {
    var ora = Date.now(); letture = letture.filter(function (p) { return ora - p.t <= FINESTRA_MS; });
    if (!letture.length) return null;
    var best = Math.min.apply(null, letture.map(function (p) { return p.acc; }));
    var buone = letture.filter(function (p) { return p.acc <= Math.max(best * 1.5, best + 3); });
    var num = function (a, b) { return a - b; }, lat0 = buone.map(function (p) { return p.lat; }).sort(num)[buone.length >> 1], lon0 = buone.map(function (p) { return p.lon; }).sort(num)[buone.length >> 1];
    var mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
    buone = buone.filter(function (p) { return Math.hypot((p.lat - lat0) * mLat, (p.lon - lon0) * mLon) <= Math.max(2 * p.acc, 3); });
    if (!buone.length) buone = [letture.reduce(function (a, b) { return b.acc < a.acc ? b : a; })];
    var sw = 0, la = 0, lo = 0, q = 0, nq = 0;
    buone.forEach(function (p) { var w = 1 / (p.acc * p.acc); sw += w; la += w * p.lat; lo += w * p.lon; if (p.quota != null) { q += p.quota; nq++; } });
    return { lat: la / sw, lon: lo / sw, acc: best, quota: nq ? q / nq : null, n: buone.length, t: ora };
  }
  function suPosizione(c) {
    if (!c || !isFinite(c.latitude) || !isFinite(c.longitude)) return;
    letture.push({ lat: c.latitude, lon: c.longitude, acc: c.accuracy || 99, quota: c.altitude, t: Date.now() });
    var m = mediaLetture(); if (!m) return;
    if (destGps === 'balcone') {                              // posizione del balcone: sul balcone il GPS vede il cielo
      posBal = m;
      $('mis-gps').textContent = 'Posizione del balcone: ± ' + Math.round(m.acc) + ' m' + (m.n > 1 ? ' (media di ' + m.n + ' letture)' : '') + (m.acc <= 10 ? ' ✓' : ' (resta qualche secondo all\'aperto)');
      return;
    }
    stato.pos = m;
    mostraGps();
  }
  function errGps(e) {
    $('gps-stato').textContent = 'Posizione non disponibile';
    $('gps-nota').textContent = (e && e.code === 1) ? 'Hai negato il permesso alla posizione: abilitalo nelle impostazioni del telefono.' : 'Controlla che il GPS sia acceso e riprova all\'aperto o vicino a una finestra.';
  }
  function avviaGps() {
    letture = []; mostraGps();
    if (nativo && P.Geolocation) {
      // Android: nel plugin "timeout" e' anche l'intervallo fra due posizioni; con 1 s il GPS resta acceso come in Google Maps
      P.Geolocation.requestPermissions().catch(function () { return null; }).then(function (perm) {
        soloApprossimata = !!(perm && perm.location !== 'granted' && perm.coarseLocation === 'granted');
        avvisoApprossimata();
        return P.Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 1000, minimumUpdateInterval: 500, maximumAge: 0 }, function (pos, err) { if (err) errGps(err); else if (pos) suPosizione(pos.coords); });
      }).then(function (id) { idCap = id; });
      return;
    }
    if (!navigator.geolocation) { errGps(); return; }
    idGps = navigator.geolocation.watchPosition(function (p) { suPosizione(p.coords); }, errGps, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  function avvisoApprossimata() {
    if (!soloApprossimata) return;
    var t = 'Il telefono dà all\'app solo la posizione approssimativa. Apri Impostazioni → App → Verifica FWA → Autorizzazioni → Posizione e attiva «Usa posizione esatta».';
    $('gps-nota').textContent = t; $('mis-gps').textContent = t;
  }
  function fermaGps() {
    if (idGps != null) navigator.geolocation.clearWatch(idGps); idGps = null;
    if (idCap != null && P.Geolocation) P.Geolocation.clearWatch({ id: idCap }); idCap = null;
  }
  function mostraGps() {
    var p = stato.pos;
    if (!p) { $('gps-ok').disabled = true; return; }
    var buona = p.acc <= C.precisioneBuona, ok = p.acc <= C.precisioneMassima;
    $('gps-stato').textContent = buona ? 'Posizione precisa' : ok ? 'Posizione accettabile' : 'Posizione ancora imprecisa';
    $('gps-num').textContent = p.lat.toFixed(6) + ', ' + p.lon.toFixed(6);
    $('gps-acc').textContent = 'precisione ± ' + Math.round(p.acc) + ' m' + (p.n > 1 ? ' · media di ' + p.n + ' letture: tieni il telefono fermo' : '');
    if (p.acc > 500 && !soloApprossimata) $('gps-nota').textContent = 'Precisione molto bassa: controlla che al browser o all\'app sia concessa la posizione esatta e che il GPS sia acceso.';
    else if (!soloApprossimata) $('gps-nota').textContent = 'Aspetta che la precisione scenda sotto i ' + C.precisioneBuona + ' m (al massimo ' + C.precisioneMassima + ' m), con il telefono fermo.';
    var b = $('gps-barra'); b.style.width = Math.max(8, Math.min(100, 100 * C.precisioneBuona / Math.max(p.acc, 1))) + '%';
    b.style.background = buona ? 'var(--ok)' : ok ? 'var(--warn)' : 'var(--bad)';
    $('gps-ok').disabled = !ok;
  }
  $('gps-avvia').addEventListener('click', function () { stato.pos = null; fermaGps(); avviaGps(); $('gps-stato').textContent = 'Ricerca in corso…'; });
  $('gps-ok').addEventListener('click', function () { salvaBozza(); vai(2); });

  // ---------- 2. piano ----------
  function nomePiano(p) { return p === 0 ? 'piano terra' : p + '° piano'; }
  function mostraPiano() { $('piano').textContent = stato.piano; $('piano-nome').textContent = nomePiano(stato.piano); $('piani-ed').value = stato.pianiEd || ''; }
  $('piano-meno').addEventListener('click', function () { stato.piano = Math.max(0, stato.piano - 1); mostraPiano(); salvaBozza(); });
  $('piano-piu').addEventListener('click', function () { stato.piano = Math.min(40, stato.piano + 1); mostraPiano(); salvaBozza(); });
  $('piani-ed').addEventListener('input', function () { var v = parseInt(this.value, 10); stato.pianiEd = v > 0 ? v : null; salvaBozza(); });

  // ---------- 3. tetto ----------
  function mostraTetto() {
    document.querySelectorAll('#tetto button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.v === stato.tetto)); });
    $('tetto-ok').disabled = !stato.tetto;
    fotoTetto.box.hidden = stato.tetto !== 'si'; fotoTetto.mostra();
  }
  var fotoTetto = bloccoFoto('tetto-foto', function () { return stato.tettoFoto || null; }, function (d) { stato.tettoFoto = d; salvaBozza(); });
  document.querySelectorAll('#tetto button').forEach(function (b) { b.addEventListener('click', function () { stato.tetto = b.dataset.v; mostraTetto(); salvaBozza(); }); });
  $('tetto-ok').addEventListener('click', function () { vai(4); });
  mostraTetto();

  // ---------- 4. balconi ----------
  var DIR = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  var NOMI_DIR = { N: 'nord', NE: 'nord-est', E: 'est', SE: 'sud-est', S: 'sud', SO: 'sud-ovest', O: 'ovest', NO: 'nord-ovest' };
  function dirDi(a) { return DIR[Math.round(norm(a) / 45) % 8]; }
  function norm(a) { return ((a % 360) + 360) % 360; }
  function frecciaSvg(a) { return '<svg class="freccia" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-opacity=".25"/><path transform="rotate(' + a + ' 20 20)" d="M20 5 L26 22 L20 18 L14 22 Z" fill="var(--accent)"/></svg>'; }
  function mostraBalconi() {
    $('balconi').innerHTML = stato.balconi.map(function (b, i) {
      return '<li>' + (b.foto ? '<img class="mini" src="' + b.foto + '" alt="Foto di ' + esc(b.nome) + '">' : '') + frecciaSvg(b.azimut) + '<span class="t"><b>' + esc(b.nome) + '</b><small>guarda a ' + NOMI_DIR[dirDi(b.azimut)] + ' · ' + Math.round(b.azimut) + '°' + (b.manuale ? ' (scelta a mano)' : '') + (b.foto ? ' · con foto' : '') + '</small></span><button class="via" data-i="' + i + '" aria-label="Elimina ' + esc(b.nome) + '">✕</button></li>';
    }).join('');
    $('balconi').querySelectorAll('.via').forEach(function (b) { b.addEventListener('click', function () { stato.balconi.splice(+b.dataset.i, 1); salvaBozza(); mostraBalconi(); }); });
    $('bal-fine').disabled = !stato.balconi.length; $('bal-nessuno').hidden = !!stato.balconi.length;
  }
  $('bal-nuovo').addEventListener('click', function () { apriMisura(); });
  $('bal-fine').addEventListener('click', function () { vai(6); });
  $('bal-nessuno').addEventListener('click', function () { stato.balconi = []; salvaBozza(); vai(6); });
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- 4b. bussola ----------
  var campioni = [], ultimo = null, ascolto = false, timerAssente = null, magnetica = null;
  (function tacche() {
    var g = $('tacche'), h = '';
    for (var a = 0; a < 360; a += 10) { var r1 = a % 90 === 0 ? 74 : a % 30 === 0 ? 78 : 82, rad = a * Math.PI / 180; h += '<line class="' + (a % 30 === 0 ? 'l' : '') + '" x1="' + (100 + Math.sin(rad) * r1) + '" y1="' + (100 - Math.cos(rad) * r1) + '" x2="' + (100 + Math.sin(rad) * 88) + '" y2="' + (100 - Math.cos(rad) * 88) + '"/>'; }
    g.innerHTML = h;
  })();
  function apriMisura() {
    campioni = []; ultimo = null; magnetica = null;
    $('mis-tit').textContent = 'Balcone ' + (stato.balconi.length + 1);
    $('mis-nome').value = ''; $('mis-salva').disabled = true; $('mis-gradi').textContent = '—'; $('mis-dir').textContent = '';
    $('mis-otto').hidden = true; $('mis-nota').textContent = 'In attesa della bussola…'; $('mis-stab').style.width = '0';
    posBal = null; letture = []; affaccio = null; fotoBal = null; fotoBalcone.mostra(); $('mis-gps').textContent = 'Posizione del balcone: in attesa del GPS…';
    document.querySelectorAll('#mis-aff button').forEach(function (b) { b.setAttribute('aria-checked', 'false'); });
    vai(5); destGps = 'balcone'; fermaGps(); avviaGps();
    var D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {          // iPhone: il permesso si chiede dentro il tocco
      D.requestPermission().then(function (r) { if (r === 'granted') avviaBussola(); else senzaBussola('Permesso ai sensori negato.'); }).catch(function () { senzaBussola('Permesso ai sensori non disponibile.'); });
    } else avviaBussola();
  }
  function avviaBussola() {
    if (ascolto) return; ascolto = true;
    window.addEventListener('deviceorientationabsolute', suOrientamento, true);
    window.addEventListener('deviceorientation', suOrientamento, true);
    clearTimeout(timerAssente); timerAssente = setTimeout(function () { if (!ultimo) senzaBussola('Questo telefono non fornisce la bussola.'); }, 4000);
  }
  function fermaBussola() {
    ascolto = false; clearTimeout(timerAssente);
    window.removeEventListener('deviceorientationabsolute', suOrientamento, true);
    window.removeEventListener('deviceorientation', suOrientamento, true);
  }
  function suOrientamento(e) {
    var h = null;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) h = e.webkitCompassHeading;   // iPhone: gia' rispetto al nord
    else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) {                         // Android: alpha da nord, verso antiorario
      var ang = (screen.orientation && screen.orientation.angle) || 0;                                           // schermo ruotato: conta il lato alto dello schermo
      h = 360 - e.alpha - ang;
    } else return;
    h = norm(h);
    var inPiano = Math.abs(e.beta || 0) < 35 && Math.abs(e.gamma || 0) < 35;
    ultimo = Date.now();
    campioni.push({ t: ultimo, h: h, piano: inPiano });
    var lim = ultimo - C.stabilitaSecondi * 1000; while (campioni.length && campioni[0].t < lim) campioni.shift();
    var s = 0, c = 0; campioni.forEach(function (q) { s += Math.sin(q.h * Math.PI / 180); c += Math.cos(q.h * Math.PI / 180); });
    var n = campioni.length, R = Math.sqrt(s * s + c * c) / n, media = norm(Math.atan2(s, c) * 180 / Math.PI);
    var disp = Math.sqrt(-2 * Math.log(Math.max(R, 1e-9))) * 180 / Math.PI, tuttiPiano = campioni.every(function (q) { return q.piano; });
    var vero = norm(media + C.declinazione);
    $('rosa').style.transform = 'rotate(' + (-media) + 'deg)';
    $('mis-gradi').textContent = Math.round(vero) + '°'; $('mis-dir').textContent = NOMI_DIR[dirDi(vero)];
    var pronto = n >= 5 && campioni[n - 1].t - campioni[0].t >= C.stabilitaSecondi * 800 && disp < C.stabilitaGradi && tuttiPiano;
    $('mis-stab').style.width = Math.max(5, Math.min(100, 100 * C.stabilitaGradi / Math.max(disp, 0.5))) + '%';
    $('mis-stab').style.background = pronto ? 'var(--ok)' : 'var(--warn)';
    $('mis-nota').textContent = !tuttiPiano ? 'Tieni il telefono più in piano, a schermo in su.' : pronto ? 'Direzione stabile: puoi salvarla.' : 'Resta fermo… (oscillazione ' + Math.round(disp) + '°). Se non si ferma, muovi il telefono disegnando un 8 per calibrare la bussola.';
    $('mis-salva').disabled = !pronto;
    magnetica = { media: media, vero: vero, disp: disp };
  }
  function senzaBussola(msg) { $('mis-nota').textContent = msg + ' Scegli la direzione a mano.'; mostraOtto(); }
  function mostraOtto() {
    var box = $('mis-otto'); box.hidden = false;
    box.innerHTML = DIR.map(function (d, i) { return '<button role="radio" aria-checked="false" data-a="' + (i * 45) + '">' + d + '</button>'; }).join('');
    box.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { salvaBalcone(+b.dataset.a, null, 22.5, true); }); });
  }
  $('mis-manuale').addEventListener('click', mostraOtto);
  $('mis-salva').addEventListener('click', function () { if (magnetica) salvaBalcone(magnetica.vero, magnetica.media, magnetica.disp, false); });
  $('mis-annulla').addEventListener('click', function () { vai(4); });
  var affaccio = null, fotoBal = null, fotoBalcone = bloccoFoto('mis-foto', function () { return fotoBal; }, function (d) { fotoBal = d; });
  document.querySelectorAll('#mis-aff button').forEach(function (b) { b.addEventListener('click', function () {
    affaccio = b.dataset.v; document.querySelectorAll('#mis-aff button').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
  }); });
  function salvaBalcone(vero, mag, disp, manuale) {
    var nome = $('mis-nome').value.trim() || ('Balcone ' + (stato.balconi.length + 1)), pb = posBal && posBal.acc <= C.precisioneMassima ? posBal : null;
    stato.balconi.push({ nome: nome, azimut: Math.round(vero * 10) / 10, azimut_magnetico: mag == null ? null : Math.round(mag * 10) / 10, dispersione_gradi: Math.round(disp * 10) / 10, manuale: !!manuale,
      lat: pb ? +pb.lat.toFixed(7) : null, lon: pb ? +pb.lon.toFixed(7) : null, accuratezza_m: pb ? Math.round(pb.acc * 10) / 10 : null, affaccio: affaccio && affaccio !== 'non_so' ? affaccio : null, foto: fotoBal || null });
    fotoBal = null; salvaBozza(); vai(4);
  }

  // ---------- 5. riepilogo e invio ----------
  function ordine() {
    return {
      tipo: 'ordine_fwa', versione: 1, id: stato.codice || ('APP-' + new Date().toISOString().replace(/\D/g, '').slice(0, 14)),
      data: new Date().toISOString(), lat: stato.pos ? +stato.pos.lat.toFixed(7) : null, lon: stato.pos ? +stato.pos.lon.toFixed(7) : null,
      accuratezza_m: stato.pos ? Math.round(stato.pos.acc * 10) / 10 : null, piano: stato.piano, piani_edificio: stato.pianiEd,
      tetto: stato.tetto === 'si' ? true : stato.tetto === 'no' ? false : null,
      balconi: stato.balconi.map(function (b) { return { nome: b.nome, azimut: b.azimut, azimut_magnetico: b.azimut_magnetico, dispersione_gradi: b.dispersione_gradi, manuale: b.manuale, lat: b.lat, lon: b.lon, accuratezza_m: b.accuratezza_m, affaccio: b.affaccio, foto: b.foto || null }; }),
      tetto_foto: stato.tetto === 'si' && stato.tettoFoto ? stato.tettoFoto : null,
      declinazione: C.declinazione, app: 'verifica-fwa ' + C.versione, dispositivo: nativo ? 'app Android' : 'browser'
    };
  }
  function riepilogo() {
    var o = ordine();
    $('riepilogo').innerHTML = '<dt>Ordine</dt><dd>' + esc(o.id) + '</dd>' +
      '<dt>Posizione</dt><dd>' + (o.lat != null ? o.lat.toFixed(5) + ', ' + o.lon.toFixed(5) + ' (± ' + Math.round(o.accuratezza_m) + ' m)' : 'mancante') + '</dd>' +
      '<dt>Piano</dt><dd>' + nomePiano(o.piano) + (o.piani_edificio ? ' di ' + o.piani_edificio : '') + '</dd>' +
      '<dt>Tetto</dt><dd>' + (o.tetto === true ? 'disponibile' : o.tetto === false ? 'non disponibile' : 'non so') + (o.tetto_foto ? '<br><img class="mini" src="' + o.tetto_foto + '" alt="Foto dal tetto">' : '') + '</dd>' +
      '<dt>Balconi</dt><dd>' + (o.balconi.length ? o.balconi.map(function (b) { return esc(b.nome) + ': ' + NOMI_DIR[dirDi(b.azimut)] + ' (' + Math.round(b.azimut) + '°)' + (b.affaccio ? ', su ' + (b.affaccio === 'cortile' ? 'cortile interno' : 'strada') : '') + (b.lat != null ? ', posizione ± ' + Math.round(b.accuratezza_m) + ' m' : '') + (b.foto ? '<br><img class="mini" src="' + b.foto + '" alt="Foto di ' + esc(b.nome) + '">' : ''); }).join('<br>') : 'nessuno') + '</dd>';
    $('json').textContent = JSON.stringify(o, function (k, v) { return typeof v === 'string' && v.indexOf('data:image') === 0 ? '[foto JPEG, ' + kB(v) + ' kB]' : v; }, 1);
    $('invia').disabled = o.lat == null;
  }
  function testo() { return JSON.stringify(ordine(), null, 1); }
  function nomeFile() { var o = ordine(); return C.nomeFile + '_' + String(o.id).replace(/[^\w-]/g, '_') + '.json'; }
  function esito(t, ok) { $('invio-stato').textContent = t; $('invio-stato').style.color = ok ? 'var(--ok)' : ''; }
  $('invia').addEventListener('click', function () {
    var t = testo(), f = nomeFile();
    if (C.urlInvio === 'parent' && window.parent !== window) {   // dentro il simulatore dello strumento: l'ordine va alla pagina che lo ospita
      window.parent.postMessage({ tipo: 'ordine_fwa', ordine: ordine() }, '*'); esito('Verifica inviata: attendo la risposta…', true); return;
    }
    if (C.urlInvio) {                                       // invio diretto al sistema degli ordini, se configurato
      fetch(C.urlInvio, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: t })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); esito('Verifica inviata. Grazie!', true); })
        .catch(function (e) { esito('Invio non riuscito (' + e.message + '): usa «Salva il file».'); });
      return;
    }
    if (nativo && P.Filesystem && P.Share) {
      P.Filesystem.writeFile({ path: f, data: t, directory: 'CACHE', encoding: 'utf8' })
        .then(function (w) { return P.Share.share({ title: 'Verifica FWA', text: 'Verifica dell\'installazione FWA', files: [w.uri], dialogTitle: 'Invia la verifica' }); })
        .then(function () { esito('Verifica condivisa.', true); }).catch(function (e) { esito('Condivisione annullata o non riuscita: ' + (e && e.message ? e.message : e)); });
      return;
    }
    var file = typeof File === 'function' ? new File([t], f, { type: 'application/json' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Verifica FWA', text: 'Verifica dell\'installazione FWA' }).then(function () { esito('Verifica condivisa.', true); }).catch(function () { esito('Condivisione annullata.'); });
    } else { scarica(t, f); esito('File salvato: allegalo alla mail o al messaggio per EOLO.', true); }
  });
  function scarica(t, f) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'application/json' })); a.download = f; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  $('salva').addEventListener('click', function () {
    if (nativo && P.Filesystem) {
      P.Filesystem.writeFile({ path: nomeFile(), data: testo(), directory: 'DOCUMENTS', encoding: 'utf8' }).then(function () { esito('Salvato in Documenti come ' + nomeFile(), true); }).catch(function (e) { esito('Salvataggio non riuscito: ' + e.message); });
    } else { scarica(testo(), nomeFile()); esito('File salvato.', true); }
  });
  $('copia').addEventListener('click', function () {
    var t = testo();
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { esito('Dati copiati.', true); }).catch(function () {
      var r = document.createRange(); r.selectNodeContents($('json')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); esito('Seleziona e copia il testo qui sotto.');
    });
  });
  $('ricomincia').addEventListener('click', function () { $('esito-box').hidden = true; stato = { codice: '', pos: null, piano: 0, pianiEd: null, tetto: null, tettoFoto: null, balconi: [] }; salvaBozza(); $('codice').value = ''; mostraTetto(); esito(''); vai(0); });

  if ('serviceWorker' in navigator && location.protocol === 'https:' && !nativo) navigator.serviceWorker.register('sw.js').catch(function () {});
  // risposta del sistema degli ordini (simulatore o server): esito della prequalifica mostrato al cliente
  window.addEventListener('message', function (ev) {
    var d = ev.data || {}; if (d.tipo !== 'esito_ordine') return;
    var box = $('esito-box'); box.hidden = false; box.className = 'esito-box ' + (d.classe || '');
    box.innerHTML = '<b>' + esc(d.titolo || '') + '</b>' + (d.testo ? '<span>' + esc(d.testo) + '</span>' : ''); esito('');
  });
  window.__verifica = { stato: function () { return stato; }, ordine: ordine, vai: vai };
  vai(0);
})();
