// Fonte unica dei prezzi VISIBIL. Usato sia dal configuratore prezzi (index.html/area-cliente.html)
// sia dal catalogo prezzi in admin.html, cosi' restano sempre sincronizzati: si cambia un numero qui
// e si aggiorna ovunque.

const PREZZI_DATI = {
  siti: [
    { key: 'base',     lbl: 'Sito Base',     once: 290,  monthly: 19, formazione: 120 },
    { key: 'completo', lbl: 'Sito Completo', once: 790,  monthly: 39, formazione: 160 },
    { key: 'avanzato', lbl: 'Sito Avanzato', once: 1290, monthly: 79, formazione: 200 }
  ],
  instagram: [
    { lbl: 'Instagram Base', monthly: 190 },
    { lbl: 'Instagram Full', monthly: 490 }
  ],
  fotoVideo: [
    { lbl: 'Servizio foto', once: 300 },
    { lbl: 'Reel / Short video', once: 440 }
  ],
  consulenza: {
    orario: 120,
    primaMezzoraGratis: true
  },
  lavoroExtra: {
    orario: 120
  }
};
