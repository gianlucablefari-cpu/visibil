export default async () => {
  return new Response(
    JSON.stringify({
      supabase_key_present: !!Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      resend_key_present: !!Netlify.env.get("RESEND_API_KEY")
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/debug-env"
};
