// Funzione schedulata (eseguita automaticamente ogni giorno da Netlify).
// Cerca pagamenti "In attesa" con data scaduta da almeno 3 giorni e manda un promemoria via email,
// evitando di rimandarlo se già inviato negli ultimi 14 giorni per lo stesso pagamento.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const GIORNI_ATTESA_MINIMA = 3;
const GIORNI_TRA_PROMEMORIA = 14;

export default async (req) => {
  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  if (!SERVICE_KEY || !RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta." }), { status: 500 });
  }

  const oggi = new Date();
  const sogliaScadenza = new Date(oggi);
  sogliaScadenza.setDate(sogliaScadenza.getDate() - GIORNI_ATTESA_MINIMA);
  const sogliaScadenzaStr = sogliaScadenza.toISOString().slice(0, 10);

  const sogliaUltimoPromemoria = new Date(oggi);
  sogliaUltimoPromemoria.setDate(sogliaUltimoPromemoria.getDate() - GIORNI_TRA_PROMEMORIA);

  // Pagamenti in attesa, scaduti da almeno GIORNI_ATTESA_MINIMA giorni
  const pagamentiRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pagamenti?stato=eq.In+attesa&data=lt.${sogliaScadenzaStr}&select=id,user_id,descrizione,importo,data,payment_link,promemoria_inviato_il`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const pagamenti = await pagamentiRes.json();
  if (!pagamentiRes.ok || !Array.isArray(pagamenti)) {
    return new Response(JSON.stringify({ error: "Errore nel leggere i pagamenti." }), { status: 500 });
  }

  const daInviare = pagamenti.filter(p => {
    if (!p.promemoria_inviato_il) return true;
    return new Date(p.promemoria_inviato_il) < sogliaUltimoPromemoria;
  });

  let inviati = 0;
  const errori = [];

  for (const p of daInviare) {
    try {
      const clienteRes = await fetch(
        `${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${p.user_id}&select=nome,email_contatto`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const clienteRows = await clienteRes.json();
      if (!clienteRes.ok || !clienteRows.length || !clienteRows[0].email_contatto) continue;
      const { nome, email_contatto: email } = clienteRows[0];

      const linkPagamento = p.payment_link
        ? `<a href="${p.payment_link}" style="display:inline-block; background:#1A1AE6; color:#fff; text-decoration:none; font-size:0.85em; font-weight:600; padding:0.7em 1.4em; border-radius:5px; margin-top:0.5em;">Paga ora</a>`
        : '';

      const emailHtml = `
        <div style="font-family: 'Inter', Arial, sans-serif; color:#0F0F0F; line-height:1.6; max-width:480px; margin:0 auto;">
          <div style="font-weight:900; font-size:0.9em; letter-spacing:0.22em; text-transform:uppercase; margin-bottom:2em;">VISIBIL</div>
          <p style="margin:0 0 1.5em;">Ciao ${nome}, ti ricordiamo un pagamento ancora da saldare:</p>
          <div style="background:#F5F6FF; border-left:3px solid #1A1AE6; padding:1em 1.25em; margin:0 0 1.5em;">
            <div style="font-size:0.95em;">${p.descrizione || 'Pagamento VISIBIL'}</div>
            <div style="font-size:0.95em; font-weight:700; margin-top:0.3em;">CHF ${p.importo}</div>
          </div>
          ${linkPagamento}
          <p style="margin:1.5em 0 0;">A presto,<br>Gianluca — VISIBIL</p>
        </div>
      `;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "VISIBIL <benvenuto@vsbl.ch>",
          to: [email],
          subject: "Promemoria: pagamento da saldare — VISIBIL",
          html: emailHtml
        })
      });
      if (!emailRes.ok) { errori.push(p.id); continue; }
      const emailData = await emailRes.json().catch(() => ({}));

      await fetch(`${SUPABASE_URL}/rest/v1/pagamenti?id=eq.${p.id}`, {
        method: "PATCH",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ promemoria_inviato_il: new Date().toISOString() })
      });

      await fetch(`${SUPABASE_URL}/rest/v1/messaggi`, {
        method: "POST",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: p.user_id,
          tipo: "promemoria",
          oggetto: "Promemoria: pagamento da saldare — VISIBIL",
          contenuto: emailHtml,
          resend_id: emailData.id || null,
          stato_consegna: "inviata"
        })
      });

      inviati++;
    } catch (e) {
      errori.push(p.id);
    }
  }

  return new Response(JSON.stringify({ success: true, inviati, errori }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  schedule: "0 7 * * *"
};
