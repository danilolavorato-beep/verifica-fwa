// Impostazioni dell'app (si cambiano senza toccare il resto del codice)
window.CONFIG = {
  versione: '1.1.0',
  // declinazione magnetica (gradi, positiva verso est): la bussola del telefono indica il nord magnetico, il modello 3D
  // usa il nord geografico. In Campania nel 2026 e' circa +4,5°; in Italia va da circa +2° (ovest) a +6° (sud-est).
  declinazione: 4.5,
  precisioneBuona: 10,        // metri: sotto questa soglia la posizione e' buona
  precisioneMassima: 30,      // metri: oltre non si accetta
  stabilitaGradi: 6,          // la direzione si salva quando oscilla meno di cosi' per ...
  stabilitaSecondi: 2,        // ... questi secondi
  // dove inviare la verifica: vuoto = il cliente condivide il file (mail, WhatsApp, ...); un indirizzo https = POST JSON
  urlInvio: '',
  nomeFile: 'verifica_fwa'
};
