// Formattazione leggera per il testo delle email: converte una sintassi minima
// tipo markdown in HTML sicuro. Supporta: **grassetto**, *corsivo*, [testo](url).
// Usato da notifica-cliente.mjs, invia-benvenuto.mjs, crea-cliente.mjs, invia-broadcast.mjs.

function escapeHtml(testo) {
  return String(testo)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function markdownLeggero(testo) {
  if (!testo) return "";
  let sicuro = escapeHtml(testo);

  // Link: [testo](https://...) — solo http/https, mai javascript:
  sicuro = sicuro.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    return `<a href="${url}" style="color:#1A1AE6;">${label}</a>`;
  });

  // Grassetto: **testo**
  sicuro = sicuro.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Corsivo: *testo* (dopo il grassetto, per non confondersi con **)
  sicuro = sicuro.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return sicuro;
}
