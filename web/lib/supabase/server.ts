import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

function supabaseKey() {
  // nutze den Key, den du wirklich hast:
  // wenn du PUBLISHABLE_KEY nutzt, dann hier anpassen.
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

/**
 * Für Server Components / Pages / Layouts:
 * - darf Cookies lesen
 * - darf NICHT Cookies schreiben (Next Restriction)
 */
export async function createServerReadClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // noop: in Server Components verboten
      },
    },
  });
}

/**
 * Für Route Handlers / Server Actions:
 * - darf Cookies lesen + schreiben
 */
export async function createServerActionClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
