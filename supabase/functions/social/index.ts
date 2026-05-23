import postgres from "https://esm.sh/postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

// Initialize DB client lazily
let sql: any;
function getDb() {
  if (!sql) {
    const databaseUrl = Deno.env.get("DATABASE_URL") || Deno.env.get("SUPABASE_DB_URL");
    if (!databaseUrl) {
      throw new Error("Missing database connection URL");
    }
    sql = postgres(databaseUrl, { ssl: databaseUrl.includes("sslmode=require") ? "require" : false });
  }
  return sql;
}

Deno.serve(async (req) => {
  const { method } = req;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // 1. POST /social/facebook/auth-url
    if (path.endsWith("/social/facebook/auth-url") && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { dealer_id } = body;
      if (!dealer_id) {
        return new Response(JSON.stringify({ error: "Missing dealer_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const appId = Deno.env.get("FACEBOOK_APP_ID") || "MOCK_APP_ID";
      // Redirect URI is either configured or built from current URL
      const redirectUri = Deno.env.get("OAUTH_REDIRECT_BASE_URL") 
        ? `${Deno.env.get("OAUTH_REDIRECT_BASE_URL")}/social/facebook/callback`
        : `${url.origin}/functions/v1/social/facebook/callback`;

      const state = btoa(JSON.stringify({
        dealer_id,
        platform: "facebook",
        timestamp: Date.now()
      }));

      const scopes = [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "pages_manage_engagement",
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_insights"
      ].join(",");

      const oauthUrl = `https://www.facebook.com/dialog/oauth` +
        `?client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${scopes}` +
        `&state=${state}` +
        `&response_type=code`;

      return new Response(JSON.stringify({ oauth_url: oauthUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 2. GET /social/facebook/callback
    if (path.endsWith("/social/facebook/callback") && method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const oauthError = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (oauthError || !code || !state) {
        const errorMsg = errorDescription || oauthError || "Authorization cancelled";
        return respondWithHtmlMessage({ status: "error", error: errorMsg, platform: "facebook" });
      }

      // Parse state
      let stateData: { dealer_id: string; platform: string; timestamp: number };
      try {
        stateData = JSON.parse(atob(state));
      } catch {
        return respondWithHtmlMessage({ status: "error", error: "Invalid state parameter", platform: "facebook" });
      }

      const appId = Deno.env.get("FACEBOOK_APP_ID") || "MOCK_APP_ID";
      const appSecret = Deno.env.get("FACEBOOK_APP_SECRET") || "MOCK_APP_SECRET";
      const redirectUri = Deno.env.get("OAUTH_REDIRECT_BASE_URL") 
        ? `${Deno.env.get("OAUTH_REDIRECT_BASE_URL")}/social/facebook/callback`
        : `${url.origin}/functions/v1/social/facebook/callback`;

      // Check if we are running in mock mode
      if (appId === "MOCK_APP_ID" || appSecret === "MOCK_APP_SECRET" || code.startsWith("mock_")) {
        // Return a mock page list for testing/dev if no real keys
        const mockPages = [
          { id: "mock_page_1", name: "Apex Motors Facebook Page", access_token: "mock_page_token_1" },
          { id: "mock_page_2", name: "Premium Car Showroom Delhi", access_token: "mock_page_token_2" }
        ];
        return respondWithHtmlMessage({
          status: "page_select",
          pages: mockPages,
          dealer_id: stateData.dealer_id,
          platform: "facebook"
        });
      }

      // 2.1 Exchange code for user access token
      const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${appSecret}` +
        `&code=${code}`;

      const tokenRes = await fetch(tokenUrl);
      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => ({}));
        return respondWithHtmlMessage({
          status: "error",
          error: errJson.error?.message || "Token exchange failed",
          platform: "facebook"
        });
      }
      const tokenData = await tokenRes.json();
      const shortToken = tokenData.access_token;

      // 2.2 Exchange short-lived token for long-lived user token (60 days)
      const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${shortToken}`;

      const llTokenRes = await fetch(longLivedUrl);
      if (!llTokenRes.ok) {
        return respondWithHtmlMessage({ status: "error", error: "Failed to exchange long-lived token", platform: "facebook" });
      }
      const llTokenData = await llTokenRes.json();
      const longToken = llTokenData.access_token;

      // 2.3 Fetch managed Pages
      const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${longToken}`;
      const pagesRes = await fetch(pagesUrl);
      if (!pagesRes.ok) {
        return respondWithHtmlMessage({ status: "error", error: "Failed to fetch Facebook Pages", platform: "facebook" });
      }
      const pagesData = await pagesRes.json();
      const rawPages = pagesData.data || [];

      if (rawPages.length === 0) {
        return respondWithHtmlMessage({ status: "error", error: "No Facebook Pages found. You must own or manage a page.", platform: "facebook" });
      }

      // Clean pages list
      const pages = rawPages.map((p: any) => ({
        id: p.id,
        name: p.name,
        access_token: p.access_token
      }));

      // If exactly 1 page, auto-connect and finish
      if (pages.length === 1) {
        const page = pages[0];
        try {
          const db = getDb();
          // Write to PlatformConnection
          await db`
            INSERT INTO "PlatformConnection" (
              id, dealer_id, platform, platform_account_id, platform_account_name, access_token, is_connected, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), ${stateData.dealer_id}, 'facebook', ${page.id}, ${page.name}, ${page.access_token}, true, NOW(), NOW()
            )
            ON CONFLICT (dealer_id, platform) DO UPDATE SET
              platform_account_id = EXCLUDED.platform_account_id,
              platform_account_name = EXCLUDED.platform_account_name,
              access_token = EXCLUDED.access_token,
              is_connected = true,
              updated_at = NOW()
          `;

          // Write to social_connections
          await db`
            INSERT INTO social_connections (
              id, dealer_id, platform, account_id, account_name, access_token, connected_at, is_active
            ) VALUES (
              gen_random_uuid(), ${stateData.dealer_id}, 'facebook', ${page.id}, ${page.name}, ${page.access_token}, NOW(), true
            )
            ON CONFLICT (dealer_id, platform) DO UPDATE SET
              account_id = EXCLUDED.account_id,
              account_name = EXCLUDED.account_name,
              access_token = EXCLUDED.access_token,
              is_active = true
          `;

          // Try discover Instagram
          let instagramAccount = null;
          const igUrl = `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
          const igRes = await fetch(igUrl);
          if (igRes.ok) {
            const igData = await igRes.json();
            const igBusinessAcc = igData.instagram_business_account;
            if (igBusinessAcc && igBusinessAcc.id) {
              // Fetch username
              const igProfileUrl = `https://graph.facebook.com/v19.0/${igBusinessAcc.id}?fields=username&access_token=${page.access_token}`;
              const igProfileRes = await fetch(igProfileUrl);
              if (igProfileRes.ok) {
                const igProfile = await igProfileRes.json();
                instagramAccount = { id: igBusinessAcc.id, username: igProfile.username };
              }
            }
          }

          return respondWithHtmlMessage({
            status: "success",
            platform: "facebook",
            pageName: page.name,
            instagram_account: instagramAccount,
            dealer_id: stateData.dealer_id
          });
        } catch (dbErr) {
          console.error("DB Save Error:", dbErr);
          return respondWithHtmlMessage({ status: "error", error: "Database save failed", platform: "facebook" });
        }
      }

      // If multiple pages, send pages back to opener for UI selection
      return respondWithHtmlMessage({
        status: "page_select",
        pages,
        dealer_id: stateData.dealer_id,
        platform: "facebook"
      });
    }

    // 3. POST /social/facebook/select-page
    if (path.endsWith("/social/facebook/select-page") && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { dealer_id, platform = "facebook", page_id, page_name, page_access_token } = body;

      if (!dealer_id || !page_id || !page_access_token) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const db = getDb();

      // Upsert into "PlatformConnection"
      const apiPlatform = platform === "google" ? "gmb" : platform;
      await db`
        INSERT INTO "PlatformConnection" (
          id, dealer_id, platform, platform_account_id, platform_account_name, access_token, is_connected, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${dealer_id}, ${apiPlatform}, ${page_id}, ${page_name}, ${page_access_token}, true, NOW(), NOW()
        )
        ON CONFLICT (dealer_id, platform) DO UPDATE SET
          platform_account_id = EXCLUDED.platform_account_id,
          platform_account_name = EXCLUDED.platform_account_name,
          access_token = EXCLUDED.access_token,
          is_connected = true,
          updated_at = NOW()
      `;

      // Upsert into social_connections
      await db`
        INSERT INTO social_connections (
          id, dealer_id, platform, account_id, account_name, access_token, connected_at, is_active
        ) VALUES (
          gen_random_uuid(), ${dealer_id}, ${platform}, ${page_id}, ${page_name}, ${page_access_token}, NOW(), true
        )
        ON CONFLICT (dealer_id, platform) DO UPDATE SET
          account_id = EXCLUDED.account_id,
          account_name = EXCLUDED.account_name,
          access_token = EXCLUDED.access_token,
          is_active = true
      `;

      // If it's facebook and we connect, discover instagram linked account
      let instagramAccount = null;
      if (platform === "facebook" && !page_id.startsWith("mock_")) {
        const igUrl = `https://graph.facebook.com/v19.0/${page_id}?fields=instagram_business_account&access_token=${page_access_token}`;
        const igRes = await fetch(igUrl);
        if (igRes.ok) {
          const igData = await igRes.json();
          const igBusinessAcc = igData.instagram_business_account;
          if (igBusinessAcc && igBusinessAcc.id) {
            const igProfileUrl = `https://graph.facebook.com/v19.0/${igBusinessAcc.id}?fields=username&access_token=${page_access_token}`;
            const igProfileRes = await fetch(igProfileUrl);
            if (igProfileRes.ok) {
              const igProfile = await igProfileRes.json();
              instagramAccount = { id: igBusinessAcc.id, username: igProfile.username };
            }
          }
        }
      } else if (platform === "facebook" && page_id.startsWith("mock_")) {
        // Return mock Instagram account in mock mode
        instagramAccount = { id: "mock_ig_account", username: "apex_motors_official" };
      }

      return new Response(JSON.stringify({ success: true, connected: true, instagram_account: instagramAccount }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Route not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (err: any) {
    console.error("Deno Function Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

function respondWithHtmlMessage(message: any) {
  const jsonStr = JSON.stringify(message);
  return new Response(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Completing Connection...</title>
        <style>
          body {
            background-color: #0f1117;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .spinner {
            border: 4px solid rgba(255, 255, 255, 0.1);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border-left-color: #f97316;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .content {
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="content">
          <div class="spinner"></div>
          <div>Completing connection, please wait...</div>
        </div>
        <script>
          const data = ${jsonStr};
          // Send message to parent window if inside popup
          if (window.opener) {
            window.opener.postMessage(data, "*");
            setTimeout(() => {
              window.close();
            }, 1500);
          } else {
            // Direct navigation fallback (e.g. mobile redirect)
            console.warn("window.opener not found. Redirecting...");
            const params = new URLSearchParams();
            if (data.status === "success") {
              params.set("connected", "true");
              params.set("platform", data.platform || "facebook");
              params.set("page_name", data.pageName || "");
            } else if (data.status === "page_select") {
              params.set("error", "Multiple pages found. Please connect from the app directly.");
            } else {
              params.set("error", data.error || "Connection failed");
            }
            window.location.replace("/accounts?" + params.toString());
          }
        </script>
      </body>
    </html>
  `, {
    headers: { "Content-Type": "text/html", ...corsHeaders },
  });
}
