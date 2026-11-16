// Avvisa Gianluca via email quando un cliente apre l'area cliente (al massimo una volta ogni 3 ore per cliente)
const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";
const ESCLUSI = /^(visibil \(test\)|gianluca blefari)$/i;
const ORE_PAUSA = 3;

export default async (req) => {
  const ok = () => new Response(null, { status: 204 });
  if (req.method !== "POST") return ok();
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!token) return ok();
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!ur.ok) return ok();
  const user = await ur.json();
  if (!user.id || user.id === OWNER_ID) return ok();

  const SK = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const sh = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
  const c = ((await fetch(`${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${user.id}&select=nome,referente,accesso_notificato_il`, { headers: sh }).then(r => r.json()).catch(() => [])) || [])[0];
  if (!c || ESCLUSI.test(String(c.nome || "").trim())) return ok();
  if (c.accesso_notificato_il && Date.now() - new Date(c.accesso_notificato_il).getTime() < ORE_PAUSA * 3600e3) return ok();

  // segna subito, così due aperture ravvicinate non mandano due email
  await fetch(`${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${user.id}`, { method: "PATCH", headers: sh, body: JSON.stringify({ accesso_notificato_il: new Date().toISOString() }) });

  const RESEND = Netlify.env.get("RESEND_API_KEY");
  if (!RESEND) return ok();
  const chi = c.referente && c.referente !== c.nome ? `${c.nome} (${c.referente})` : c.nome;
  const ora = new Intl.DateTimeFormat("it-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const link = `https://vsbl.ch/admin.html?cliente=${user.id}`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VISIBIL <benvenuto@vsbl.ch>",
      to: ["gianluca.blefari@outlook.com"],
      subject: `👀 ${c.nome} è nell'area cliente`,
      html: `<div style="font-family:sans-serif; color:#0F0F0F; line-height:1.6;"><p><strong>${chi}</strong> ha aperto l'area cliente (${ora}).</p><p><a href="${link}">Apri il cliente nell'admin →</a></p><p style="color:#888; font-size:12px;">Avviso inviato al massimo una volta ogni ${ORE_PAUSA} ore per cliente.</p></div>`
    })
  }).catch(() => {});
  return ok();
};
export const config = { path: "/api/notifica-accesso" };
