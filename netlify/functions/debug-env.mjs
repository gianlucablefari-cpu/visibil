export default async () => {
  return new Response(
    JSON.stringify({
      supabase_key_present: !!Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      resend_key_present: !!Netlify.env.get("RESEND_API_KEY"),
      test_var_present: !!Netlify.env.get("TEST_VAR"),
      test_var_value: Netlify.env.get("TEST_VAR") || null
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/debug-env"
};
