import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.105.3/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function generateImage(prompt: string): Promise<string> {
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) throw new Error(`image gen ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("no image returned");
  return url;
}

async function generateCopy(opts: { brief: string; modelName: string; dealershipName: string }) {
  const sys = `You are an automotive copywriter for a premium Indian car dealership. Generate 3 distinct heading + byline pairs for a social media post.

HARD BANS — never use these phrases or any close variant: "Embrace", "Drive the difference", "Built for the bold", "Unleash", "Experience luxury", "Make a statement", "Prominent badging", "Bold lines", "Striking design", "Redefine", "Your journey begins", "More than just a car", "Where X meets Y".

HEADING: 2-5 words, specific, references model name or concrete brief detail, punchy.
BYLINE: 8-16 words, mentions car model, references one specific brief detail, human Indian English ("book your test drive"), never describes visual features.

THREE VARIANTS — different tones: 1) Bold/declarative, 2) Invitational/action, 3) Aspirational/benefit.

Return JSON via the tool call.`;

  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Brief: ${opts.brief}\nCar model: ${opts.modelName}\nDealership: ${opts.dealershipName}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_variants",
          description: "Return three heading+byline variants",
          parameters: {
            type: "object",
            properties: {
              variants: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    byline: { type: "string" },
                  },
                  required: ["heading", "byline"],
                },
              },
            },
            required: ["variants"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_variants" } },
    }),
  });
  if (!r.ok) throw new Error(`copy gen ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("no copy returned");
  return JSON.parse(args).variants;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const body = await req.json();
    const { kind } = body;

    if (kind === "image") {
      const url = await generateImage(body.prompt);
      return new Response(JSON.stringify({ imageUrl: url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (kind === "copy") {
      const variants = await generateCopy(body);
      return new Response(JSON.stringify({ variants }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "unknown kind" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg.includes(" 429") ? 429 : msg.includes(" 402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});