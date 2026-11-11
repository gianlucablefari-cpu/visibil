// Funzione server-side: dato il link condiviso di un file Dropbox e quello della cartella del cliente,
// restituisce il percorso del file a partire dal nome della cartella (es. "Cliente/Sottocartella/video.mp4").
// Richiede un utente autenticato (cliente o titolare).

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";

async function getAccessToken() {
  const body = new URLSearchParams();
  body.append("grant_type", "refresh_token");
  body.append("refresh_token", Netlify.env.get("DROPBOX_REFRESH_TOKEN"));
  body.append("client_id", Netlify.env.get("DROPBOX_APP_KEY"));
  body.append("client_secret", Netlify.env.get("DROPBOX_APP_SECRET"));
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Errore refresh token Dropbox");
  return data.access_token;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

const isDbx = (u) => /^https:\/\/(www\.)?dropbox\.com\//i.test(u);

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!token) return json({ error: "Token mancante" }, 401);
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!verifyRes.ok) return json({ error: "Token non valido" }, 401);

  let payload;
  try { payload = await req.json(); } catch (e) { return json({ error: "Corpo richiesta non valido." }, 400); }
  const fileUrl = String(payload.file_url || "").trim();
  const folderUrl = String(payload.folder_url || "").trim();
  if (!isDbx(fileUrl) || !isDbx(folderUrl)) return json({ error: "Link Dropbox non valido." }, 400);

  try {
    const at = await getAccessToken();
    const api = async (endpoint, body) => {
      const r = await fetch("https://api.dropboxapi.com/2/" + endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error_summary || "errore Dropbox");
      return d;
    };
    const [file, folder] = await Promise.all([
      api("sharing/get_shared_link_metadata", { url: fileUrl }),
      api("sharing/get_shared_link_metadata", { url: folderUrl })
    ]);
    if (!file.path_lower || !folder.path_lower) return json({ percorso: null });

    // Nomi con maiuscole/minuscole originali
    const display = async (id) => {
      try { return (await api("files/get_metadata", { path: id })).path_display; } catch (e) { return null; }
    };
    const [fd, od] = await Promise.all([
      file.id ? display(file.id) : null,
      folder.id ? display(folder.id) : null
    ]);
    const filePath = fd || file.path_lower;
    const folderPath = od || folder.path_lower;
    if (!filePath.toLowerCase().startsWith(folderPath.toLowerCase() + "/")) return json({ percorso: null });
    const rel = filePath.slice(folderPath.length + 1);
    const nomeCartella = folderPath.split("/").filter(Boolean).pop() || folder.name;
    return json({ percorso: nomeCartella + "/" + rel });
  } catch (e) {
    return json({ error: "Errore: " + e.message }, 500);
  }
};

export const config = {
  path: "/api/percorso-dropbox"
};
