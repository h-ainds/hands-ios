// Supabase Edge Function: delete-account
// Deletes the authenticated user's auth account and related data (service role only).

import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "DELETE") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[DeleteAccount] Missing Supabase config")
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim()
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token)

    if (userError || !user) {
      console.error("[DeleteAccount] Auth failed:", userError?.message)
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const userId = user.id
    console.log("[DeleteAccount] Starting deletion for user:", userId)

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Delete related rows (best effort; continue if table missing or empty)
    const tables: { table: string; column: string }[] = [
      { table: "conversations", column: "user_id" },
      { table: "recipe_interactions", column: "user_id" },
      { table: "UserTasteProfiles", column: "id" },
      { table: "Users", column: "id" },
    ]

    for (const { table, column } of tables) {
      const { error: delErr } = await supabaseAdmin.from(table).delete().eq(column, userId)
      if (delErr) console.warn("[DeleteAccount] Delete", table, delErr.message)
    }

    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteErr) {
      const msg = deleteErr.message ?? ""
      if (msg.includes("not found") || msg.includes("does not exist")) {
        console.log("[DeleteAccount] User already deleted (idempotent):", userId)
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      console.error("[DeleteAccount] Auth delete error:", deleteErr)
      return new Response(
        JSON.stringify({ error: "Failed to delete auth user", details: msg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    console.log("[DeleteAccount] Successfully deleted user:", userId)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[DeleteAccount] Error:", err)
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
