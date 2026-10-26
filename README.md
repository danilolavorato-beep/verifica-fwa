# Verifica FWA – app del cliente per la prequalifica degli ordini

Il cliente, prima che l'ordine entri, apre l'app e in due minuti raccoglie:

1. **posizione** della casa (GPS ad alta precisione, si accetta sotto i 30 m, consigliato sotto i 10 m);
2. **piano** dell'abitazione (0 = piano terra) e, se lo sa, i piani dell'edificio; nell'APK, se il telefono ha il
   **barometro**, il piano si può misurare: una lettura al portone e una in casa danno il dislivello (3 m a piano);
3. **tetto** o lastrico disponibile per l'antenna (sì / no / non so);
4. **balconi**: per ognuno l'app guida il cliente fuori, con il telefono in piano e la parte alta rivolta verso l'esterno,
   e registra con la bussola l'**esposizione** (gradi dal nord geografico) quando la lettura è stabile;
5. **foto** (facoltative) dal tetto e da ogni balcone, scattate con la fotocamera o scelte dalla galleria: l'app le riduce
   a 1280 px in JPEG (circa 150–300 kB l'una) e le mette nel file, così chi valuta l'ordine vede gli ostacoli davanti.

Alla fine produce un file `verifica_fwa_<ordine>.json` che il cliente condivide (mail, WhatsApp, …) o che l'app invia
direttamente a un indirizzo configurato. Lo strumento **Linea di vista FWA** lo importa in *Ordini nuovi > Importa
ordini dall'app* e decide: accettato dal tetto, accettato dal balcone (quale), da verificare, respinto.

## Due modi di distribuirla (stesso codice in `www/`)

| | Come | Note |
|---|---|---|
| **App web (PWA)** | Workflow *App web*: pubblica `www/` su GitHub Pages | Il cliente apre un link, nessuna installazione; funziona su Android e iPhone (su iPhone chiede il permesso ai sensori). Serve HTTPS (Pages lo dà). |
| **APK Android** | Workflow *APK Android*: Capacitor 7 + Gradle | APK di prova (debug) da scaricare dagli *Artifacts* dell'esecuzione e installare a mano (consentire "origini sconosciute"). Per il Play Store serve la firma con una chiave EOLO (vedi sotto). |

### Mettere su la repo
1. Crea una repo su GitHub e carica il contenuto di questa cartella (senza `node_modules`).
2. **APK**: scheda *Actions* > *APK Android* > *Run workflow*; dopo circa 5 minuti scarichi `verifica-fwa-apk`.
3. **PWA**: *Settings > Pages > Source: GitHub Actions*, poi *Actions* > *App web* > *Run workflow*; il link compare
   nell'esecuzione (es. `https://<utente>.github.io/<repo>/`).

### In locale
```
npm install
npx cap sync android
cd android && ./gradlew assembleDebug        # serve JDK 21 e Android SDK 35
```
Per provare la PWA basta servire `www/` in HTTPS (o `localhost`): `npx serve www`.

## Impostazioni (`www/config.js`)
- `declinazione`: correzione dal nord magnetico (bussola) al nord geografico (modello 3D). Campania 2026 ≈ +4,5°.
- `precisioneBuona` / `precisioneMassima`: soglie del GPS in metri.
- `stabilitaGradi` / `stabilitaSecondi`: quanto deve stare ferma la lettura prima di poterla salvare.
- `urlInvio`: se impostato (https), la verifica viene inviata in POST JSON a quell'indirizzo invece che condivisa.

## Formato del file (versione 1)
```json
{
  "tipo": "ordine_fwa", "versione": 1, "id": "FWA-123456", "data": "2026-10-22T09:32:03Z",
  "lat": 40.887946, "lon": 14.187958, "accuratezza_m": 6,
  "piano": 2, "piani_edificio": 4, "tetto": false,
  "balconi": [ { "nome": "Balcone del soggiorno", "azimut": 10, "azimut_magnetico": 5.5, "dispersione_gradi": 1.1, "manuale": false,
                 "lat": 40.887981, "lon": 14.187905, "accuratezza_m": 4, "affaccio": "strada", "foto": "data:image/jpeg;base64,...", "distanza_casa_m": 6 } ],
  "tetto_foto": null,
  "barometro": { "hPa_portone": 1013.2, "hPa_casa": 1012.08, "dislivello_m": 9.3, "piano_stimato": 3, "minuti": 2.5 },
  "declinazione": 4.5, "app": "verifica-fwa 1.0.0", "dispositivo": "app Android"
}
```
`azimut` è la direzione verso cui guarda il balcone (uscendo dalla casa), in gradi dal nord geografico. `lat`/`lon`/`accuratezza_m`
del balcone sono la posizione presa sul balcone durante la misura; `affaccio` è `strada`, `cortile` o `null` (non so).
`distanza_casa_m` è la distanza fra la posizione del balcone e quella della casa: se supera la somma delle due precisioni
più 5 m l'app chiede di ripetere la misura o di confermarla. `barometro` c'è solo se il piano è stato misurato con il
barometro (APK); lo strumento usa quel piano al posto di quello dichiarato se le due letture distano meno di 20 minuti.
`foto` (balcone) e `tetto_foto` sono immagini JPEG in base64 (`data:image/jpeg;base64,...`) oppure `null`.
Servono a distinguere balconi con la stessa esposizione ma esiti diversi (per esempio sulla strada e sul cortile interno).
Lo strumento accetta anche elenchi di ordini (`[ ... ]` o `{ "ordini": [ ... ] }`) e CSV `id;lat;lon;piano;tetto;balconi`
con gli azimut separati da `|`.

## Limiti da conoscere
- **Bussola**: le ringhiere di ferro, il cemento armato e le auto vicine la disturbano (anche 20–30°). L'app chiede di
  tenere il telefono lontano dal ferro e di calibrare con un movimento a "8"; lo strumento abbina il balcone al lato
  dell'edificio più vicino entro 45°, quindi tollera questi errori. Senza bussola (alcuni telefoni economici) il
  cliente sceglie la direzione tra 8 (N, NE, …).
- **GPS dentro casa**: può sbagliare di 15–30 m e cadere sull'edificio accanto; l'app chiede di stare vicino a una
  finestra e lo strumento manda in "da verificare" gli ordini che cadono a più di 8 m dalla sagoma.
- **Piano**: dichiarato dal cliente; lo strumento lo confronta con i piani stimati dal DSM.
- **Firma per il Play Store**: crea una chiave (`keytool -genkey ...`), mettila nei *Secrets* della repo e aggiungi al
  workflow il passo `assembleRelease` con la firma; l'APK debug serve solo per le prove.
- **Foto**: nell'APK la fotocamera si apre con l'app Fotocamera del telefono (nessun permesso aggiuntivo); nella PWA con il
  selettore del browser. Con molte foto il file della verifica cresce (1–2 MB): va bene per mail e WhatsApp.
- **Barometro**: plugin dell'app (`android/app/src/main/java/it/eolo/verificafwa/BarometroPlugin.java`, registrato in
  `MainActivity`); nella PWA non c'è (i browser non leggono la pressione). Dislivello = 8434 × ln(p portone / p casa) m.
- **GPS**: una posizione al secondo (nel plugin Android `timeout` è anche l'intervallo) e media delle letture degli ultimi 20 s.
- L'`appId` è `it.eolo.verificafwa` (in `capacitor.config.json`): cambialo prima di pubblicare se serve.
