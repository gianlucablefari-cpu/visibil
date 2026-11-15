// Crea la cartella di un progetto dentro la cartella Dropbox del cliente e restituisce il link condiviso.
// Solo per Gianluca. Corpo: { user_id, nome, progetto_id? } — con progetto_id salva anche il link nel progetto.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

async function getAccessToken() {
  const body = new URLSearchParams();
  body.append("grant_type", "refresh_token");
  body.append("refresh_token", Netlify.env.get("DROPBOX_REFRESH_TOKEN"));
  body.append("client_id", Netlify.env.get("DROPBOX_APP_KEY"));
  body.append("client_secret", Netlify.env.get("DROPBOX_APP_SECRET"));
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const data = await res.json();
  if (!res.ok) throw new Error("Errore refresh token Dropbox");
  return data.access_token;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!token) return json({ error: "Token mancante" }, 401);
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!ur.ok) return json({ error: "Token non valido" }, 401);
  const user = await ur.json();
  if (user.id !== OWNER_ID) return json({ error: "Non autorizzato" }, 403);

  let p; try { p = await req.json(); } catch (e) { return json({ error: "Corpo non valido" }, 400); }
  const nome = String(p.nome || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!p.user_id || !nome) return json({ error: "Dati mancanti" }, 400);

  const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const cr = await fetch(`${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${encodeURIComponent(p.user_id)}&select=onedrive_link,nome`, { headers: h });
  const cliente = ((await cr.json()) || [])[0];
  if (!cliente || !cliente.onedrive_link) return json({ error: "Il cliente non ha ancora una cartella Dropbox: collegala prima in Archivio." }, 400);

  try {
    const at = await getAccessToken();
    const api = async (endpoint, body, okErr) => {
      const r = await fetch("https://api.dropboxapi.com/2/" + endpoint, { method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok && !(okErr && okErr(d))) throw new Error(d.error_summary || "errore Dropbox");
      return { ok: r.ok, d };
    };
    const meta = (await api("sharing/get_shared_link_metadata", { url: cliente.onedrive_link })).d;
    let base = meta.path_lower;
    if (meta.id) { try { base = (await api("files/get_metadata", { path: meta.id })).d.path_display || base; } catch (e) {} }
    if (!base) return json({ error: "Non riesco a trovare la cartella del cliente nel tuo Dropbox." }, 400);
    const percorso = base.replace(/\/$/, "") + "/" + nome;

    // crea (se esiste già va bene lo stesso)
    await api("files/create_folder_v2", { path: percorso, autorename: false }, d => /conflict/.test(d.error_summary || ""));
    // link condiviso: nuovo o quello già esistente
    let url;
    const sl = await api("sharing/create_shared_link_with_settings", { path: percorso, settings: { requested_visibility: "public", audience: "public", access: "viewer" } }, d => /shared_link_already_exists/.test(d.error_summary || ""));
    if (sl.ok) url = sl.d.url;
    else {
      const ex = sl.d.error && sl.d.error.shared_link_already_exists && sl.d.error.shared_link_already_exists.metadata;
      url = ex && ex.url;
      if (!url) { const ls = await api("sharing/list_shared_links", { path: percorso, direct_only: true }); url = (ls.d.links || [])[0] && ls.d.links[0].url; }
    }
    if (!url) return json({ error: "Cartella creata ma non riesco a creare il link." }, 500);

    if (p.progetto_id) await fetch(`${SUPABASE_URL}/rest/v1/progetti?id=eq.${encodeURIComponent(p.progetto_id)}`, { method: "PATCH", headers: h, body: JSON.stringify({ cartella_link: url }) });
    return json({ url, percorso });
  } catch (e) {
    return json({ error: "Errore Dropbox: " + e.message }, 500);
  }
};

export const config = { path: "/api/crea-cartella-progetto" };
