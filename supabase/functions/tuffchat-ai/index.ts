import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function imagePart(dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || match[2].length > 5_600_000) throw new Error("Please attach a PNG, JPG or WEBP image smaller than 4 MB.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!geminiKey) return reply({ error: "Gemini isn't connected yet. Add GEMINI_API_KEY in Supabase Edge Function secrets." }, 503);
  if (!supabaseUrl || !anonKey) return reply({ error: "The AI service is not configured correctly." }, 500);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Please sign in again." }, 401);
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) return reply({ error: "Your session expired. Please sign in again." }, 401);

  let prompt = "";
  let imageData: string | null = null;
  let dateContext = "";
  let timeZone = "UTC";
  try {
    const body = await req.json();
    prompt = typeof body.message === "string" ? body.message.trim() : "";
    imageData = typeof body.image_data === "string" ? body.image_data : null;
    dateContext = typeof body.date_context === "string" ? body.date_context.slice(0, 160) : "";
    timeZone = typeof body.time_zone === "string" ? body.time_zone.slice(0, 80) : "UTC";
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  if ((!prompt && !imageData) || prompt.length > 6000) return reply({ error: "Write a message or attach an image (text up to 6,000 characters)." }, 400);

  let currentImage;
  try { currentImage = imagePart(imageData); }
  catch (error) { return reply({ error: error instanceof Error ? error.message : "Invalid image." }, 400); }

  const userId = userData.user.id;
  const { data: history, error: historyError } = await supabase
    .from("personal_ai_messages").select("role,content,image_data").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(24);
  if (historyError) return reply({ error: "Couldn't load your AI chat history." }, 500);

  const chatHistory = (history || []).reverse().map((item: { role: string; content: string; image_data?: string | null }) => {
    const parts: Record<string, unknown>[] = [];
    if (item.content) parts.push({ text: item.content });
    if (item.image_data) {
      try { const part = imagePart(item.image_data); if (part) parts.push(part); } catch { /* Ignore old invalid attachments. */ }
    }
    return { role: item.role === "assistant" ? "model" : "user", parts };
  });

  const { error: saveUserError } = await supabase.from("personal_ai_messages").insert({
    user_id: userId, role: "user", content: prompt || "Please look at this image.", image_data: imageData,
  });
  if (saveUserError) return reply({ error: "Couldn't save your message." }, 500);

  try {
    const nowUtc = new Date().toISOString();
    const currentContext = `Current real-world date and time: ${dateContext || nowUtc}. User time zone: ${timeZone}. Server UTC timestamp: ${nowUtc}. Treat this as the current date/time; do not guess or substitute a different date. For questions about today, yesterday, weekdays, dates, or time, calculate from this context.`;
    const currentParts: Record<string, unknown>[] = [];
    if (prompt) currentParts.push({ text: prompt });
    if (currentImage) currentParts.push(currentImage);
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `You are Tuffchat AI, a friendly, helpful assistant inside the user's private personal chat. Be conversational, clear, and concise. Help with everyday questions, learning, writing, ideas, and planning. You can understand attached images and should describe or answer questions about them. Never claim to have access to the user's private Tuffchat messages unless they are included in this conversation. ${currentContext}` }] },
        contents: [...chatHistory, { role: "user", parts: currentParts }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    });

    const result = await upstream.json();
    if (!upstream.ok) {
      const message = result?.error?.message || "Gemini couldn't complete that reply.";
      return reply({ error: String(message).slice(0, 500) }, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
    }
    const answerText = (result?.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part.text || "").join("").trim();
    if (!answerText) return reply({ error: "Gemini returned an empty reply. Try again." }, 502);

    const { data: saved, error: saveAssistantError } = await supabase.from("personal_ai_messages")
      .insert({ user_id: userId, role: "assistant", content: answerText })
      .select("id,role,content,image_data,created_at").single();
    if (saveAssistantError) return reply({ error: "The reply arrived but couldn't be saved." }, 500);
    try {
      await fetch(supabaseUrl + "/functions/v1/tuffchat-push", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ event: "ai_done" }),
      });
    } catch { /* Keep the AI answer successful if push delivery is temporarily unavailable. */ }
    return reply({ message: saved });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Couldn't reach Gemini. Please try again." }, 502);
  }
});