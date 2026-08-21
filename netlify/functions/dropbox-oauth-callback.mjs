// Funzione di supporto per l'autorizzazione OAuth una tantum con Dropbox.
// Riceve il "code" dopo che Gianluca ha autorizzato l'app, lo scambia con un refresh token
// permanente, e lo mostra a schermo per essere copiato negli env di Netlify.
// Dopo il setup iniziale, questa funzione non serve piu' al funzionamento del sito.

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const DROPBOX_APP_KEY = Netlify.env.get("DROPBOX_APP_KEY");
  const DROPBOX_APP_SECRET = Netlify.env.get("DROPBOX_APP_SECRET");

  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
    return new Response("Mancano DROPBOX_APP_KEY / DROPBOX_APP_SECRET su Netlify. Aggiungili e riprova.", { status: 500 });
  }

  if (!code) {
    // Passo 1: mostra il link di autorizzazione da cliccare
    const redirectUri = "https://vsbl.ch/api/dropbox-oauth-callback";
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=code&token_access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return new Response(
      `<a href="${authUrl}">Clicca qui per autorizzare VISIBIL ad accedere al tuo Dropbox</a>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // Passo 2: scambia il code con un refresh token permanente
  const redirectUri = "https://vsbl.ch/api/dropbox-oauth-callback";
  const body = new URLSearchParams();
  body.append("code", code);
  body.append("grant_type", "authorization_code");
  body.append("client_id", DROPBOX_APP_KEY);
  body.append("client_secret", DROPBOX_APP_SECRET);
  body.append("redirect_uri", redirectUri);

  const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return new Response("Errore: " + JSON.stringify(tokenData), { status: 500 });
  }

  return new Response(
    `<p>Fatto! Copia questo <strong>refresh_token</strong> e salvalo su Netlify come variabile d'ambiente <code>DROPBOX_REFRESH_TOKEN</code>:</p>
     <p style="font-family:monospace; background:#eee; padding:1rem; word-break:break-all;">${tokenData.refresh_token}</p>
     <p>Dopo averlo salvato, questa pagina non ti servira' piu'.</p>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
};

export const config = {
  path: "/api/dropbox-oauth-callback"
};
