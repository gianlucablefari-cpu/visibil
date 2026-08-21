// Funzione server-side: carica un file su Dropbox nella cartella "Da Gianluca" del cliente,
// crea un link condiviso, e lo restituisce. Richiede l'autorizzazione del titolare.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

async function getAccessToken() {
  const APP_KEY = Netlify.env.get("DROPBOX_APP_KEY");
  const APP_SECRET = Netlify.env.get("DROPBOX_APP_SECRET");
  const REFRESH_TOKEN = Netlify.env.get("DROPBOX_REFRESH_TOKEN");

  const body = new URLSearchParams();
  body.append("grant_type", "refresh_token");
  body.append("refresh_token", REFRESH_TOKEN);
  body.append("client_id", APP_KEY);
  body.append("client_secret", APP_SECRET);

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Errore refresh token Dropbox: " + JSON.stringify(data));
  return data.access_token;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Token mancante" }), { status: 401 });
  }

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!verifyRes.ok) {
    return new Response(JSON.stringify({ error: "Token non valido" }), { status: 401 });
  }
  const verifyData = await verifyRes.json();
  if (verifyData.id !== OWNER_ID) {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 403 });
  }

  const DROPBOX_APP_KEY = Netlify.env.get("DROPBOX_APP_KEY");
  const DROPBOX_APP_SECRET = Netlify.env.get("DROPBOX_APP_SECRET");
  const DROPBOX_REFRESH_TOKEN = Netlify.env.get("DROPBOX_REFRESH_TOKEN");
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    return new Response(JSON.stringify({ error: "Credenziali Dropbox non configurate su Netlify." }), { status: 500 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Corpo richiesta non valido." }), { status: 400 });
  }

  const { nomeCliente, nomeFile, contenutoBase64 } = payload;
  if (!nomeCliente || !nomeFile || !contenutoBase64) {
    return new Response(JSON.stringify({ error: "nomeCliente, nomeFile e contenutoBase64 sono obbligatori." }), { status: 400 });
  }

  try {
    const accessToken = await getAccessToken();
    const dropboxPath = `/VISIBIL Clienti/${nomeCliente}/Da Gianluca/${nomeFile}`;

    const fileBuffer = Uint8Array.from(atob(contenutoBase64), c => c.charCodeAt(0));

    const uploadRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: dropboxPath,
          mode: "add",
          autorename: true,
          mute: false
        })
      },
      body: fileBuffer
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      return new Response(JSON.stringify({ error: "Errore upload Dropbox: " + JSON.stringify(uploadData) }), { status: 500 });
    }

    // Crea (o riusa) un link condiviso per il file appena caricato
    const linkRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: uploadData.path_display })
    });

    let linkData = await linkRes.json();
    if (!linkRes.ok) {
      // se il link esiste gia', lo recupera invece di fallire
      const listRes = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path: uploadData.path_display, direct_only: true })
      });
      const listData = await listRes.json();
      if (listRes.ok && listData.links && listData.links[0]) {
        linkData = listData.links[0];
      } else {
        return new Response(JSON.stringify({ error: "File caricato ma errore nel creare il link: " + JSON.stringify(linkData) }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ url: linkData.url, path: uploadData.path_display }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Errore: " + e.message }), { status: 500 });
  }
};

export const config = {
  path: "/api/upload-documento-dropbox"
};
