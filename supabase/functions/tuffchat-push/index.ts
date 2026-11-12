import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@tuffchat.app";
  if (!url || !anon || !serviceKey) return reply({ error: "Push service is not configured." }, 500);
  if (!vapidPublic || !vapidPrivate) return reply({ error: "Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Supabase secrets." }, 503);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Please sign in." }, 401);
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "Your session expired." }, 401);
  let body: { event?: string; conversation_id?: string; content?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  const userId = authData.user.id;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let recipientIds: string[] = [];
  let title = "Tuffchat";
  let message = "You have a new notification.";
  let tag = "tuffchat";

  if (body.event === "test") {
    recipientIds = [userId];
    title = "Tuffchat notifications are working";
    message = "You will receive message, mention and AI completion alerts here.";
    tag = "tuffchat-push-test";
  } else if (body.event === "ai_done") {
    recipientIds = [userId];
    title = "Tuffchat AI is ready";
    message = "Your AI reply has finished.";
    tag = "tuffchat-ai";
  } else if (body.event === "message" && body.conversation_id) {
    const { data: members, error: memberError } = await caller.from("conversation_members").select("user_id").eq("conversation_id", body.conversation_id);
    if (memberError) return reply({ error: "Couldn't find conversation recipients." }, 403);
    const allRecipients = (members || []).map((row: { user_id: string }) => row.user_id).filter((id: string) => id !== userId);
    if (!allRecipients.length) return reply({ sent: 0 });
    const { data: profiles } = await caller.from("profiles").select("id,username,display_name").in("id", [userId, ...allRecipients]);
    const sender = (profiles || []).find((profile: {id:string}) => profile.id === userId);
    const lowerContent = (body.content || "").toLowerCase();
    const mentioned = (profiles || []).filter((profile: {id:string;username:string}) =>
      allRecipients.includes(profile.id) && lowerContent.includes(`@${profile.username.toLowerCase()}`)
    ).map((profile: {id:string}) => profile.id);
    recipientIds = mentioned.length ? mentioned : allRecipients;
    const { data: conversation } = await caller.from("conversations").select("name,is_group").eq("id", body.conversation_id).maybeSingle();
    title = conversation?.is_group ? (conversation.name || "New group message") : (sender?.display_name || sender?.username || "New message");
    message = (body.content || "Sent you a message").slice(0, 150);
    tag = `tuffchat-${body.conversation_id}`;
  } else {
    return reply({ error: "Unknown notification event." }, 400);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const { data: subscriptions, error: subscriptionError } = await admin.from("push_subscriptions")
    .select("endpoint,subscription").in("user_id", recipientIds);
  if (subscriptionError) return reply({ error: "Couldn't load notification subscriptions." }, 500);
  let sent = 0;
  let deliveryError = "";
  for (const row of subscriptions || []) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({ title, body: message, tag, url: "/chat/" }));
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      deliveryError = error instanceof Error ? error.message : "Push provider rejected the notification.";
      if (statusCode === 404 || statusCode === 410) await admin.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
    }
  }
  if (!sent && deliveryError) return reply({ sent: 0, error: deliveryError }, 502);
  if (!sent) return reply({ sent: 0, error: "No registered push subscription exists for this account/device." });
  return reply({ sent });
});