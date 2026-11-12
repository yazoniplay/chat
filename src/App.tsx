import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase, isConfigured } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { Search, MessageCircle, Users, Plus, Send, Smile, LogOut, Settings, Phone, Video, MoreVertical, ArrowLeft, X, CheckCheck, Image as ImageIcon, UserRound, Palette, Sun, Moon, Camera, Save, ShieldCheck, Trash2, Sparkles, Bot, Pencil, Forward, Reply } from "lucide-react";
import { ProfileDecoration } from "decoprofile";

const TRANSPARENT_AVATAR = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const AVATAR_DECORATIONS = [{id:"halo",name:"Halo",kind:"halo"},{id:"angel",name:"Angel",kind:"library",fileId:"1TUzGQqWzpyZhBGXVZPPnRuUybbdiFp85"},{id:"cat_ears",name:"Cat Ears",kind:"library",fileId:"17XghhKtpk0BjCjrTBqRYu1Wks8RlOLcp"},{id:"nightwraith",name:"Nightwraith",kind:"library",fileId:"16WqiPcs21a_rxmVeuqd6oyZw6U_CnH3n"},{id:"solar_flare",name:"Solar Flare",kind:"library",fileId:"11p_jMzIDH9jkIpOpbqol1wb9KLiIYRg2"},{id:"comets",name:"Comets",kind:"library",fileId:"1rsQgN1qG9QwZXWtudCK-lsiC5FRP3zEL"},{id:"hologram_dragon",name:"Hologram Dragon",kind:"library",fileId:"1DQDa2MR_H19cEur5E1gGs5mdgx14lmPs"},{id:"malefic_crown",name:"Malefic Crown",kind:"library",fileId:"1FUTXPSTue0zA4Kl7TbCpcBLgOP2UZ_QO"},{id:"fire",name:"Fire",kind:"library",fileId:"1zOZB27xk-Eo-GZEDMeGMeR9Py2KL0pcv"},{id:"aurora",name:"Aurora",kind:"library",fileId:"1g5YBljR8hKLsql7ghJHwx5DbqbLggbVF"}] as const;

type Profile = { id: string; username: string; display_name: string; avatar_url: string | null; banner_url?: string | null; status_message?: string | null; about_me?: string | null; display_name_font?: string | null; profile_gradient?: string | null; profile_gradient_custom?: string | null; profile_effect?: string | null; avatar_decoration?: string | null; deletion_requested_at?: string | null };
type Conversation = { id: string; name: string | null; is_group: boolean; created_at: string; conversation_members?: { user_id: string; profiles: Profile | null }[] };
type Message = { id: string; conversation_id: string; sender_id: string; content: string; kind: string; created_at: string; reply_to?: string | null; forwarded_from?: string | null; edited_at?: string | null };
type AiMessage = { id: string; role: "user" | "assistant"; content: string; image_data?: string | null; created_at: string };
const EMOJIS = ["😀","😂","🥹","😍","😎","🔥","❤️","💀","😭","👍","🙏","🎉","💯","👀","🤝","✨","🥶","😈"];

function Avatar({ profile, label, size = "md" }: { profile?: Profile | null; label?: string; size?: "sm" | "md" | "lg" }) {
  const name = profile?.display_name || profile?.username || label || "?";
  const decoration = AVATAR_DECORATIONS.find(item => item.id === profile?.avatar_decoration);
  const fallback = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#8068c9"/><stop offset="1" stop-color="#d18aaf"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#g)"/><text x="50" y="58" font-size="48" font-family="Arial" font-weight="700" text-anchor="middle" fill="white">${name.slice(0,1).toUpperCase()}</text></svg>`)}`;
  const source = profile?.avatar_url || fallback;
  return <div className={`avatar avatar-${size} ${decoration ? `avatar-decoration-${decoration.id}` : ""}`}>
    <div className="avatar-image" style={{ backgroundImage: `url(${source})` }} />
    {decoration?.kind === "library" && <img className="avatar-decoration-art" src={`https://drive.google.com/thumbnail?id=${decoration.fileId}&sz=w1000`} alt="" aria-hidden="true" />}
    {profile?.status_message && <span className="avatar-status" title={profile.status_message}>{profile.status_message}</span>}
  </div>;
}

function TypingIndicator({ label }: { label: string }) {
  return <div className="typing-indicator" role="status" aria-label={label}><span className="typing-dots"><i/><i/><i/></span><span>{label}</span></div>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [showPeople, setShowPeople] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupPeople, setGroupPeople] = useState<Profile[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [messageError, setMessageError] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState<{url:string; preview:string}[]>([]);
  const [gifError, setGifError] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiDraft, setAiDraft] = useState("");
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiImageData, setAiImageData] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushError, setPushError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"profile" | "appearance" | "theme" | "account">("profile");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [editStatusMessage, setEditStatusMessage] = useState("");
  const [editAboutMe, setEditAboutMe] = useState("");
  const [editNameFont, setEditNameFont] = useState("modern");
  const [editProfileGradient, setEditProfileGradient] = useState("aurora");
  const [editProfileEffect, setEditProfileEffect] = useState("none");
  const [editAvatarDecoration, setEditAvatarDecoration] = useState("none");
  const [viewedBadges, setViewedBadges] = useState<string[]>([]);
  const [mutualProfiles, setMutualProfiles] = useState<Profile[]>([]);
  const [mutualGroups, setMutualGroups] = useState<string[]>([]);
  const [gradientStart, setGradientStart] = useState("#352c50");
  const [gradientMiddle, setGradientMiddle] = useState("#7558a8");
  const [gradientEnd, setGradientEnd] = useState("#d59ac0");
  const [gradientAngle, setGradientAngle] = useState(120);
  const customGradient = `linear-gradient(${gradientAngle}deg, ${gradientStart}, ${gradientMiddle}, ${gradientEnd})`;
  const nameFontOptions = [{id:"modern",name:"Modern"},{id:"rounded",name:"Rounded"},{id:"serif",name:"Elegant"},{id:"mono",name:"Mono"},{id:"poppins",name:"Poppins"},{id:"montserrat",name:"Montserrat"},{id:"playfair",name:"Playfair"},{id:"bebas",name:"Bebas"},{id:"pacifico",name:"Pacifico"},{id:"space",name:"Space Grotesk"},{id:"oswald",name:"Oswald"},{id:"merriweather",name:"Merriweather"},{id:"caveat",name:"Handwritten"},{id:"nunito",name:"Nunito"},{id:"lora",name:"Lora"}];
  const gradientOptions = [{id:"aurora",name:"Aurora",value:"linear-gradient(120deg,#352c50,#7558a8 52%,#d59ac0)"},{id:"sunset",name:"Sunset",value:"linear-gradient(120deg,#ff7e5f,#feb47b)"},{id:"ocean",name:"Ocean",value:"linear-gradient(120deg,#13547a,#80d0c7)"},{id:"berry",name:"Berry",value:"linear-gradient(120deg,#7028e4,#e5b2ca)"},{id:"emerald",name:"Emerald",value:"linear-gradient(120deg,#134e5e,#71b280)"},{id:"midnight",name:"Midnight",value:"linear-gradient(120deg,#232526,#414345)"}] as const;
  const [viewedProfile, setViewedProfile] = useState<Profile | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("tuffchat-theme") as "dark" | "light") || "dark");
  const accentOptions = [{ id: "lavender", name: "Lavender", color: "#9b7bfa" }, { id: "ocean", name: "Ocean", color: "#38a9e8" }, { id: "rose", name: "Rose", color: "#ef789b" }, { id: "mint", name: "Mint", color: "#45c6a1" }, { id: "sunset", name: "Sunset", color: "#f29a55" }] as const;
  const [accent, setAccent] = useState(() => localStorage.getItem("tuffchat-accent") || "lavender");
  const avatarPreview = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : null, [avatarFile]);
  const bannerPreview = useMemo(() => bannerFile ? URL.createObjectURL(bannerFile) : null, [bannerFile]);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  useEffect(() => () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); }, [bannerPreview]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tuffchat-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    localStorage.setItem("tuffchat-accent", accent);
  }, [accent]);

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); setConversations([]); setActiveId(""); setLoading(false); return; }
    let live = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (live) setProfile(data as Profile | null);
      await loadConversations();
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(async registration => {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) setPushEnabled(true);
    }).catch(error => setPushError(error instanceof Error ? error.message : "Could not register notifications."));
  }, [session?.user.id]);

  async function enablePushNotifications() {
    if (!session?.user) return;
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!publicKey) { setPushError("Push keys are not configured yet. Add VITE_VAPID_PUBLIC_KEY to GitHub Actions secrets first."); return; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setPushError("This browser does not support push notifications."); return; }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setPushError("Allow notifications in your browser to turn these on."); return; }
      const registration = await navigator.serviceWorker.ready;
      const padding = "=".repeat((4 - publicKey.length % 4) % 4);
      const decoded = atob((publicKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = Uint8Array.from(decoded, char => char.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey as BufferSource });
      const { error } = await supabase.from("push_subscriptions").upsert({ user_id: session.user.id, endpoint: subscription.endpoint, subscription: subscription.toJSON() }, { onConflict: "endpoint" });
      if (error) throw error;
      setPushEnabled(true); setPushError("");
    } catch (error) { setPushError(error instanceof Error ? error.message : "Could not enable push notifications."); }
  }

  async function loadConversations() {
    if (!session?.user) return;
    const { data: selfConversationId, error: selfChatError } = await supabase.rpc("ensure_self_conversation");
    if (selfChatError || !selfConversationId) {
      setAuthError(selfChatError?.message || "Couldn't create your personal chat.");
    }
    const { data: memberships, error: membershipError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", session.user.id);
    if (membershipError) setAuthError(membershipError.message);

    // Always include the ID returned by the self-chat RPC. This prevents a
    // stale/filtered membership query from hiding the personal conversation.
    const ids = [...new Set([
      ...(memberships || []).map((m: {conversation_id:string}) => m.conversation_id),
      ...(selfConversationId ? [String(selfConversationId)] : [])
    ])];
    let rows: Conversation[] = [];
    if (ids.length) {
      const { data, error } = await supabase.from("conversations").select("id,name,is_group,created_at,conversation_members(user_id,profiles(id,username,display_name,avatar_url,banner_url,status_message,about_me,display_name_font,profile_gradient,profile_gradient_custom,profile_effect,avatar_decoration))").in("id", ids).order("created_at", { ascending: false });
      if (error) setAuthError(error.message);
      rows = (data || []) as unknown as Conversation[];
    }

    // If PostgREST still omits the row (for example, because of a relationship
    // visibility issue), construct its sidebar entry from the verified RPC ID.
    if (selfConversationId && !rows.some(row => row.id === String(selfConversationId))) {
      rows.unshift({
        id: String(selfConversationId),
        name: "You",
        is_group: false,
        created_at: new Date().toISOString(),
        conversation_members: [{ user_id: session.user.id, profiles: null }]
      });
    }
    setConversations(rows);
    if (!activeId && selfConversationId) setActiveId(String(selfConversationId));
  }

  useEffect(() => {
    if (!viewedProfile || !session?.user) { setViewedBadges([]); setMutualProfiles([]); setMutualGroups([]); return; }
    let live = true;
    (async () => {
      const [{ data: badges }, { data: mine }, { data: theirs }] = await Promise.all([
        supabase.from("profile_badges").select("badge_key").eq("user_id", viewedProfile.id),
        supabase.from("conversation_members").select("conversation_id").eq("user_id", session.user.id),
        supabase.from("conversation_members").select("conversation_id").eq("user_id", viewedProfile.id)
      ]);
      if (!live) return;
      setViewedBadges((badges || []).map((badge: {badge_key:string}) => badge.badge_key));
      if (viewedProfile.id === session.user.id) { setMutualProfiles([]); setMutualGroups([]); return; }
      const mineIds = new Set((mine || []).map((row: {conversation_id:string}) => row.conversation_id));
      const sharedIds = (theirs || []).map((row: {conversation_id:string}) => row.conversation_id).filter((id: string) => mineIds.has(id));
      if (!sharedIds.length) { setMutualProfiles([]); setMutualGroups([]); return; }
      const { data: groups } = await supabase.from("conversations").select("id,name").in("id", sharedIds).eq("is_group", true);
      if (!live) return;
      const groupIds = (groups || []).map((group: {id:string}) => group.id);
      setMutualGroups((groups || []).map((group: {name:string|null}) => group.name || "Group"));
      if (!groupIds.length) { setMutualProfiles([]); return; }
      const { data: members } = await supabase.from("conversation_members").select("user_id").in("conversation_id", groupIds);
      const mutualIds = [...new Set((members || []).map((member: {user_id:string}) => member.user_id).filter((id: string) => id !== session.user.id && id !== viewedProfile.id))];
      if (!mutualIds.length) { setMutualProfiles([]); return; }
      const { data: people } = await supabase.from("profiles").select("id,username,display_name,avatar_url,display_name_font,profile_effect,avatar_decoration").in("id", mutualIds).limit(8);
      if (live) setMutualProfiles((people || []) as Profile[]);
    })();
    return () => { live = false; };
  }, [viewedProfile?.id, session?.user.id]);

  const active = conversations.find(c => c.id === activeId);
  const activeMembers = active?.conversation_members || [];
  const isSelfChat = (conversation?: Conversation) => !!conversation && !!session?.user && !conversation.is_group && conversation.conversation_members?.length === 1 && conversation.conversation_members[0].user_id === session.user.id;
  const otherMember = activeMembers.find(m => m.user_id !== session?.user.id)?.profiles;
  const activePerson = isSelfChat(active) ? profile : otherMember;
  const activeTitle = isSelfChat(active) ? "You" : active?.is_group ? (active.name || "Group chat") : (otherMember?.display_name || otherMember?.username || "Chat");
  const typingNames = typingUsers.map(id => {
    const person = activeMembers.find(member => member.user_id === id)?.profiles;
    return person?.display_name || person?.username || "Someone";
  });
  const typingLabel = typingNames.length === 1 ? `${typingNames[0]} is typing` : typingNames.length > 1 ? `${typingNames.slice(0, 2).join(" and ")} are typing` : "";

  useEffect(() => {
    if (!activeId) { setMessages([]); setTypingUsers([]); return; }
    let live = true;
    setTypingUsers([]);
    supabase.from("messages").select("*").eq("conversation_id", activeId).order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => { if (live) setMessages((data || []) as Message[]); });
    const channel = supabase.channel(`messages-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, payload => {
        const next = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === next.id) ? prev : [...prev, next]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, payload => {
        const next = payload.new as Message;
        setMessages(prev => prev.map(message => message.id === next.id ? next : message));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, payload => {
        const removed = payload.old as { id?: string };
        if (removed.id) setMessages(prev => prev.filter(message => message.id !== removed.id));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const userId = payload?.user_id as string | undefined;
        if (!userId || userId === session?.user.id) return;
        if (remoteTypingTimeouts.current[userId]) clearTimeout(remoteTypingTimeouts.current[userId]);
        if (payload?.is_typing) {
          setTypingUsers(prev => prev.includes(userId) ? prev : [...prev, userId]);
          remoteTypingTimeouts.current[userId] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(id => id !== userId));
            delete remoteTypingTimeouts.current[userId];
          }, 2400);
        } else {
          setTypingUsers(prev => prev.filter(id => id !== userId));
          delete remoteTypingTimeouts.current[userId];
        }
      });
    typingChannelRef.current = channel;
    channel.subscribe();
    return () => {
      live = false;
      typingChannelRef.current = null;
      Object.values(remoteTypingTimeouts.current).forEach(clearTimeout);
      remoteTypingTimeouts.current = {};
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setTypingUsers([]);
      supabase.removeChannel(channel);
    };
  }, [activeId, session?.user.id]);

  useEffect(() => {
    if (!aiMode || !isSelfChat(conversations.find(c => c.id === activeId)) || !session?.user) {
      setAiMessages([]);
      setAiError("");
      return;
    }
    let live = true;
    supabase.from("personal_ai_messages").select("id,role,content,image_data,created_at").eq("user_id", session.user.id).order("created_at", { ascending: true }).limit(100)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setAiError(error.message);
        setAiMessages((data || []) as AiMessage[]);
      });
    return () => { live = false; };
  }, [aiMode, activeId, session?.user.id, conversations]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, aiMessages]);

  function openSettings() {
    setEditUsername(profile?.username || "");
    setEditDisplayName(profile?.display_name || "");
    setAvatarFile(null);
    setBannerFile(null);
    setEditStatusMessage(profile?.status_message || "");
    setEditAboutMe(profile?.about_me || "");
    setEditNameFont(profile?.display_name_font || "modern");
    setEditProfileGradient(profile?.profile_gradient || "aurora");
    setEditProfileEffect(profile?.profile_effect === "glow" ? "glow" : "none");
    setEditAvatarDecoration(profile?.avatar_decoration || "none");
    const savedGradient = profile?.profile_gradient_custom || "";
    const savedColors = savedGradient.match(/#[0-9a-fA-F]{6}/g);
    const savedAngle = savedGradient.match(/linear-gradient\((\d+)deg/);
    setGradientStart(savedColors?.[0] || "#352c50");
    setGradientMiddle(savedColors?.[1] || "#7558a8");
    setGradientEnd(savedColors?.[2] || "#d59ac0");
    setGradientAngle(savedAngle ? Number(savedAngle[1]) : 120);
    setProfileSaveError("");
    setSettingsOpen(true);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!session?.user || !profile) return;
    const cleanUsername = editUsername.trim().toLowerCase();
    const cleanDisplayName = editDisplayName.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setProfileSaveError("Username must be 3–20 characters: letters, numbers or underscores.");
      return;
    }
    if (!cleanDisplayName) {
      setProfileSaveError("Please enter a display name.");
      return;
    }
    if (avatarFile && avatarFile.size > 5 * 1024 * 1024) { setProfileSaveError("Photo must be 5 MB or smaller."); return; }
    if (bannerFile && bannerFile.size > 5 * 1024 * 1024) { setProfileSaveError("Banner must be 8 MB or smaller."); return; }
    if (editStatusMessage.length > 60) { setProfileSaveError("Status messages can be up to 60 characters."); return; }
    if (editAboutMe.length > 300) { setProfileSaveError("About me can be up to 300 characters."); return; }
    setProfileSaving(true);
    setProfileSaveError("");
    let avatarUrl = profile.avatar_url;
    let bannerUrl = profile.banner_url || null;
    if (avatarFile || bannerFile) {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const uploadUser = authData.session?.user;
      if (authError || !uploadUser || uploadUser.id !== session.user.id) {
        setProfileSaveError("Your login session expired. Sign out and sign back in, then try again.");
        setProfileSaving(false);
        return;
      }
      const uploadImage = async (file: File, prefix: string) => {
        const types: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
        const extension = types[file.type];
        if (!extension) throw new Error("Please choose a JPG, PNG, WEBP or GIF image.");
        const path = `${uploadUser.id}/${prefix}-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "3600" });
        if (uploadError) throw uploadError;
        return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      };
      try {
        if (avatarFile) avatarUrl = await uploadImage(avatarFile, "avatar");
        if (bannerFile) bannerUrl = await uploadImage(bannerFile, "banner");
      } catch (uploadError) {
        setProfileSaveError(`Image upload failed: ${uploadError instanceof Error ? uploadError.message : "Please try again."}`);
        setProfileSaving(false);
        return;
      }
    }
    const { data, error } = await supabase.from("profiles").update({ username: cleanUsername, display_name: cleanDisplayName, avatar_url: avatarUrl, banner_url: bannerUrl, status_message: editStatusMessage.trim() || null, about_me: editAboutMe.trim() || null, display_name_font: editNameFont, profile_gradient: editProfileGradient, profile_gradient_custom: customGradient, profile_effect: editProfileEffect, avatar_decoration: editAvatarDecoration }).eq("id", session.user.id).select("id,username,display_name,avatar_url,banner_url,status_message,about_me,display_name_font,profile_gradient,profile_gradient_custom,profile_effect,avatar_decoration").single();
    if (error) setProfileSaveError(error.code === "23505" ? "That username is already taken. Try another one." : error.message);
    else { setProfile(data as Profile); setSettingsOpen(false); setAvatarFile(null); setBannerFile(null); }
    setProfileSaving(false);
  }

  async function requestAccountDeletion() {
    if (!session?.user) return;
    setDeletionBusy(true); setDeletionError("");
    for (let page = 0; page < 100; page += 1) {
      const { data: avatarFiles, error: listError } = await supabase.storage.from("avatars").list(session.user.id, { limit: 100 });
      if (listError) { setDeletionError(`Could not prepare account files for deletion: ${listError.message}`); setDeletionBusy(false); return; }
      if (!avatarFiles?.length) break;
      const { error: removeError } = await supabase.storage.from("avatars").remove(avatarFiles.map(file => `${session.user.id}/${file.name}`));
      if (removeError) { setDeletionError(`Could not remove profile photos: ${removeError.message}`); setDeletionBusy(false); return; }
      if (avatarFiles.length < 100) break;
    }
    const { data, error } = await supabase.rpc("request_account_deletion");
    if (error) setDeletionError(error.message);
    else {
      setProfile(current => current ? { ...current, deletion_requested_at: data || new Date().toISOString() } : current);
      setSettingsOpen(false); setDeleteConfirm(false);
    }
    setDeletionBusy(false);
  }

  async function cancelAccountDeletion() {
    setDeletionBusy(true); setDeletionError("");
    const { error } = await supabase.rpc("cancel_account_deletion");
    if (error) setDeletionError(error.message);
    else {
      setProfile(current => current ? { ...current, deletion_requested_at: null } : current);
      await loadConversations();
    }
    setDeletionBusy(false);
  }

  async function authenticate(e: FormEvent) {
    e.preventDefault(); setAuthError("");
    if (authMode === "signup") {
      const clean = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(clean)) { setAuthError("Username must be 3–20 characters (letters, numbers or _)."); return; }
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { username: clean, display_name: displayName.trim() || clean } } });
      if (error) setAuthError(error.message);
      else setAuthError("Account created! If email confirmation is enabled, check your inbox.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    }
  }

  async function searchPeople(value: string, group = false) {
    if (group) setGroupSearch(value); else setSearch(value);
    if (value.trim().length < 2) { group ? setGroupPeople([]) : setPeople([]); return; }
    const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url,banner_url,status_message,about_me,display_name_font,profile_gradient,profile_gradient_custom,profile_effect,avatar_decoration").ilike("username", `%${value.trim()}%`).neq("id", session?.user.id || "").limit(12);
    group ? setGroupPeople((data || []) as Profile[]) : setPeople((data || []) as Profile[]);
  }

  async function startDirect(person: Profile) {
    if (!session?.user) return;
    const { data: mine } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", session.user.id);
    const ids = (mine || []).map((m: {conversation_id:string}) => m.conversation_id);
    if (ids.length) {
      const { data: shared } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", person.id).in("conversation_id", ids);
      if (shared?.length) {
        const { data: existing } = await supabase.from("conversations").select("id,is_group").in("id", shared.map(x => x.conversation_id)).eq("is_group", false).limit(1).maybeSingle();
        if (existing) { await loadConversations(); setActiveId(existing.id); setMobileChat(true); setShowPeople(false); return; }
      }
    }
    const { data: convo, error } = await supabase.from("conversations").insert({ created_by: session.user.id, is_group: false }).select().single();
    if (error || !convo) { setAuthError(error?.message || "Couldn't create chat."); return; }
    await supabase.from("conversation_members").insert([{ conversation_id: convo.id, user_id: session.user.id }, { conversation_id: convo.id, user_id: person.id }]);
    await loadConversations(); setActiveId(convo.id); setMobileChat(true); setShowPeople(false); setSearch("");
  }

  async function createGroup() {
    if (!session?.user || !selectedPeople.length || !groupName.trim()) return;
    const { data: convo, error } = await supabase.from("conversations").insert({ created_by: session.user.id, name: groupName.trim(), is_group: true }).select().single();
    if (error || !convo) { setAuthError(error?.message || "Couldn't create group."); return; }
    await supabase.from("conversation_members").insert([session.user.id, ...selectedPeople].map(user_id => ({ conversation_id: convo.id, user_id })));
    await loadConversations(); setActiveId(convo.id); setMobileChat(true); setShowGroup(false); setSelectedPeople([]); setGroupName(""); setGroupSearch("");
  }

  function broadcastTyping(isTyping: boolean) {
    if (!typingChannelRef.current || !session?.user) return;
    void typingChannelRef.current.send({
      type: "broadcast", event: "typing",
      payload: { user_id: session.user.id, is_typing: isTyping }
    });
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!value.trim()) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      broadcastTyping(false);
      return;
    }
    broadcastTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), 1700);
  }

  async function sendMessage(content = draft, kind = "text") {
    if (!content.trim() || !activeId || !session?.user || sending) return;
    setSending(true); setDraft(""); setEmojiOpen(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    broadcastTyping(false);
    const { error } = await supabase.from("messages").insert({
      conversation_id: activeId, sender_id: session.user.id, content: content.trim(), kind,
      reply_to: replyingTo?.id || null
    });
    if (error) {
      setDraft(content);
      setMessageError(error.message);
    } else {
      setReplyingTo(null);
      setMessageError("");
      void supabase.functions.invoke("tuffchat-push", { body: { event: "message", conversation_id: activeId, content: content.trim() } });
    }
    setSending(false);
  }

  function startReply(message: Message) {
    setReplyingTo(message);
    setEditingMessageId(null);
  }

  async function saveMessageEdit(messageId: string) {
    const content = editDraft.trim();
    if (!content || !session?.user) return;
    const { error } = await supabase.from("messages").update({
      content, edited_at: new Date().toISOString()
    }).eq("id", messageId).eq("sender_id", session.user.id);
    if (error) setMessageError(error.message);
    else setMessageError("");
    setEditingMessageId(null);
  }

  async function deleteMessage(messageId: string) {
    if (!session?.user) return;
    const { error } = await supabase.from("messages").delete()
      .eq("id", messageId).eq("sender_id", session.user.id);
    if (error) setMessageError(error.message);
    else setMessageError("");
  }

  async function forwardMessageTo(conversation: Conversation) {
    if (!forwardingMessage || !session?.user) return;
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversation.id, sender_id: session.user.id,
      content: forwardingMessage.content, kind: forwardingMessage.kind,
      forwarded_from: forwardingMessage.id
    });
    if (error) setMessageError(error.message);
    else { setMessageError(""); void supabase.functions.invoke("tuffchat-push", { body: { event: "message", conversation_id: conversation.id, content: forwardingMessage.content } }); }
    setForwardingMessage(null);
  }

  async function sendAiMessage(e?: FormEvent) {
    e?.preventDefault();
    const prompt = aiDraft.trim();
    if ((!prompt && !aiImageData) || !session?.user || aiSending) return;
    setAiSending(true);
    setAiDraft("");
    setAiError("");
    const dateContext = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" }).format(new Date());
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const imageData = aiImageData;
    setAiImageData(null);
    const { error } = await supabase.functions.invoke("tuffchat-ai", { body: { message: prompt, image_data: imageData, date_context: dateContext, time_zone: timeZone } });
    if (error) {
      let detail = error.message || "Couldn't reach Tuffchat AI.";
      const response = (error as any).context;
      if (response && typeof response.clone === "function") {
        try {
          const payload = await response.clone().json();
          if (typeof payload?.error === "string" && payload.error.trim()) detail = payload.error;
        } catch { /* Keep the SDK error when the response isn't JSON. */ }
      }
      setAiError(detail);
      setAiDraft(prompt);
      setAiImageData(imageData);
    } else {
      const { data, error: loadError } = await supabase.from("personal_ai_messages")
        .select("id,role,content,created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true }).limit(100);
      if (loadError) setAiError(loadError.message);
      setAiMessages((data || []) as AiMessage[]);
    }
    setAiSending(false);
  }

  async function searchGifs(value: string) {
    setGifSearch(value);
    setGifError("");
    const key = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
    if (!key) {
      setGifResults([]);
      setGifError("GIPHY isn't connected in this build. Check the GIPHY_API_KEY GitHub Actions secret, then rebuild.");
      return;
    }
    if (value.trim().length < 2) { setGifResults([]); return; }
    try {
      const params = new URLSearchParams({ api_key: key, q: value.trim().slice(0, 50), limit: "12", rating: "pg-13", lang: "en" });
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json?.meta?.status !== 200) {
        throw new Error(json?.meta?.msg || `GIPHY returned HTTP ${res.status}. Check that your API key is valid.`);
      }
      const results = (json.data || []).map((item: any) => ({
        url: item.images?.original?.url || item.images?.fixed_width?.url,
        preview: item.images?.fixed_width_small?.url || item.images?.fixed_width?.url
      })).filter((g: any) => g.url);
      setGifResults(results);
      if (!results.length) setGifError("No GIFs found for that search. Try another word.");
    } catch (error) {
      setGifResults([]);
      setGifError(error instanceof Error ? error.message : "Couldn't load GIFs from GIPHY.");
    }
  }

  const sortedConversations = useMemo(() => conversations.filter(c => !c.is_group).sort((a, b) => Number(isSelfChat(b)) - Number(isSelfChat(a))), [conversations, session?.user.id]);
  const groupConversations = useMemo(() => conversations.filter(c => c.is_group), [conversations]);
  const lastMessages = useMemo(() => Object.fromEntries(sortedConversations.map(c => [c.id, isSelfChat(c) ? "Your private space for notes and links" : "Tap to open conversation"])), [sortedConversations, session?.user.id]);

  if (!isConfigured) return <div className="setup-screen"><div className="setup-card"><div className="brand-mark">t</div><h1>Welcome to <span>Tuffchat</span></h1><p>Your crew, one chat away.</p><div className="setup-step"><b>One quick setup step</b><p>Connect a free Supabase project to power accounts, chats and live messages.</p><ol><li>Create a project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>.</li><li>Run <code>supabase/migrations/0001_tuffchat.sql</code> in its SQL Editor.</li><li>Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and anon key.</li></ol></div><p className="muted">No secret service-role key belongs in this app.</p></div></div>;

  if (loading) return <div className="loading-screen"><div className="brand-mark">t</div><span>Loading Tuffchat…</span></div>;

  if (session && profile?.deletion_requested_at) return <div className="deactivated-screen"><div className="deactivated-card"><div className="brand-mark">t</div><span className="settings-kicker">ACCOUNT DEACTIVATED</span><h1>Your account is on pause.</h1><p>Your account is hidden and can’t send or receive chats. It is scheduled for permanent deletion on <b>{new Date(new Date(profile.deletion_requested_at).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString([], { dateStyle: "long" })}</b>.</p><p>You can restore everything by cancelling deletion before that date.</p>{deletionError && <div className="settings-error">{deletionError}</div>}<button className="primary-btn full" disabled={deletionBusy} onClick={cancelAccountDeletion}>{deletionBusy ? "Restoring…" : "Keep my account"}</button><button className="deactivated-signout" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/> Sign out</button></div></div>;

  if (!session) return <div className="auth-screen"><div className="auth-art"><div className="brand-mark">t</div><div><span className="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>Good chats.<br/><em>Better days.</em></h1><p>Bring your favourite people together, wherever life takes you.</p></div><div className="art-bubbles"><span>hey 👋</span><span>you coming? 🔥</span><span>always 😂</span></div></div><form className="auth-card" onSubmit={authenticate}><div className="auth-brand"><div className="brand-mark">t</div><b>Tuffchat</b></div><h2>{authMode === "login" ? "Welcome back" : "Make it official"}</h2><p className="muted">{authMode === "login" ? "Sign in to catch up with your people." : "Create an account and claim your username."}</p>{authMode === "signup" && <><label>Username<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="your_username" required /></label><label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="What should people call you?" /></label></>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required /></label>{authError && <div className="auth-message">{authError}</div>}<button className="primary-btn full" type="submit">{authMode === "login" ? "Sign in" : "Create account"}</button><p className="switch-auth">{authMode === "login" ? "New around here?" : "Already have an account?"} <button type="button" onClick={()=>{setAuthMode(authMode==="login"?"signup":"login");setAuthError("");}}>{authMode === "login" ? "Create account" : "Sign in"}</button></p></form></div>;

  return <main className={`app-shell theme-${theme}`}>
    {viewedProfile && <div className="modal-backdrop profile-backdrop" onClick={()=>setViewedProfile(null)}><section className={`profile-card ${viewedProfile.profile_effect === "glow" ? "profile-card-has-effect" : ""}`} onClick={e=>e.stopPropagation()} style={{background:viewedProfile.profile_gradient_custom || gradientOptions.find(option=>option.id===viewedProfile.profile_gradient)?.value || gradientOptions[0].value}}>
      {viewedProfile.profile_effect === "glow" && <div className="profile-effect-layer" aria-hidden="true"><ProfileDecoration name="OnisCurse" src={TRANSPARENT_AVATAR} scale={1.45}/></div>}
      <button className="profile-close" onClick={()=>setViewedProfile(null)} aria-label="Close profile"><X size={19}/></button>
      <div className="profile-banner">{viewedProfile.banner_url && <img className="profile-banner-image" src={viewedProfile.banner_url} alt="Profile banner"/>}</div>
      <div className="profile-card-main"><Avatar profile={viewedProfile} size="lg"/><div className="profile-card-identity"><h2 className={`profile-name-font-${viewedProfile.display_name_font || "modern"}`}>{viewedProfile.display_name || viewedProfile.username}</h2><span>@{viewedProfile.username}</span><div className="profile-badges">{viewedBadges.includes("founder") && <span className="profile-badge founder-badge" title="Founder">✦ Founder</span>}{viewedBadges.includes("early_supporter") && <span className="profile-badge supporter-badge" title="Early Supporter">★ Early Supporter</span>}</div></div></div>
      {viewedProfile.status_message && <div className="profile-status-full">“{viewedProfile.status_message}”</div>}
      {viewedProfile.about_me && <div className="profile-about"><h3>About me</h3><p>{viewedProfile.about_me}</p></div>}
      {viewedProfile.id !== session.user.id && (mutualGroups.length > 0 || mutualProfiles.length > 0) && <div className="profile-mutuals"><div className="profile-mutuals-heading"><b>Mutuals</b><span>{mutualGroups.length} shared {mutualGroups.length === 1 ? "group" : "groups"}</span></div>{mutualGroups.length > 0 && <div className="mutual-group-list">{mutualGroups.slice(0,4).map((group,index)=><span key={`${group}-${index}`}>#{group}</span>)}</div>}{mutualProfiles.length > 0 && <div className="mutual-people-list">{mutualProfiles.map(person=><span key={person.id}><Avatar profile={person} size="sm"/>{person.display_name || person.username}</span>)}</div>}</div>}
      <div className="profile-card-footer">{viewedProfile.id===session.user.id ? <button className="primary-btn" onClick={()=>{setViewedProfile(null);openSettings();}}><Settings size={16}/> Edit profile</button> : <button className="primary-btn" onClick={()=>{startDirect(viewedProfile);setViewedProfile(null);}}><MessageCircle size={16}/> Message</button>}</div>
    </section></div>}
    {settingsOpen && <div className="modal-backdrop settings-backdrop" onClick={()=>setSettingsOpen(false)}><form className="settings-modal" onSubmit={saveProfile} onClick={e=>e.stopPropagation()}><div className="settings-top"><div><span className="settings-kicker">YOUR ACCOUNT</span><h2>Settings</h2><p>Make Tuffchat feel like yours.</p></div><button type="button" className="icon-close" onClick={()=>setSettingsOpen(false)} aria-label="Close settings"><X size={20}/></button></div><div className="settings-layout">
<nav className="settings-nav" aria-label="Settings sections">
<button type="button" className={settingsSection==="profile"?"active":""} onClick={()=>setSettingsSection("profile")}><UserRound size={16}/> Profile</button>
<button type="button" className={settingsSection==="appearance"?"active":""} onClick={()=>setSettingsSection("appearance")}><Sun size={16}/> Appearance</button>
<button type="button" className={settingsSection==="theme"?"active":""} onClick={()=>setSettingsSection("theme")}><Palette size={16}/> Theme color</button>
<button type="button" className={settingsSection==="account"?"active":""} onClick={()=>setSettingsSection("account")}><ShieldCheck size={16}/> Sign out & deletion</button>
</nav>
<div className="settings-content">
<section className="settings-panel" hidden={settingsSection!=="profile"}><div className="settings-section-title"><UserRound size={16}/> Profile</div><div className="avatar-editor"><div className="avatar-preview">{avatarPreview ? <img src={avatarPreview} alt="Profile preview"/> : <Avatar profile={profile} size="lg"/>}</div><label className="upload-avatar"><Camera size={15}/> Change photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>setAvatarFile(e.target.files?.[0] || null)}/></label><span className="field-hint">JPG, PNG, WEBP or GIF. Max 5 MB.</span></div><label className="settings-field"><span>Username</span><div className="username-input"><span>@</span><input value={editUsername} onChange={e=>setEditUsername(e.target.value)} maxLength={20} autoComplete="username" /></div><small>3–20 characters · letters, numbers and _</small></label><label className="settings-field"><span>Display name</span><input value={editDisplayName} onChange={e=>setEditDisplayName(e.target.value)} maxLength={40} placeholder="Your name" /></label><label className="settings-field"><span>Status message</span><input value={editStatusMessage} onChange={e=>setEditStatusMessage(e.target.value)} maxLength={60} placeholder="What are you up to?" /><small>Shown in a bubble on your profile picture · 60 characters max</small></label><div className="settings-section-title"><Palette size={16}/> Profile style</div><div className="profile-style-picker"><b>Name font</b><div className="font-options">{nameFontOptions.map(option=><button type="button" key={option.id} className={`font-option profile-name-font-${option.id} ${editNameFont===option.id?"active":""}`} onClick={()=>setEditNameFont(option.id)}>{option.name}</button>)}</div><b>Avatar decoration</b><div className="style-choice-grid">{[{id:"none",name:"None"},...AVATAR_DECORATIONS].map(option=><button type="button" key={option.id} className={`style-choice avatar-decoration-choice ${editAvatarDecoration===option.id?"active":""}`} onClick={()=>setEditAvatarDecoration(option.id)}><span className={`decoration-preview decoration-preview-${option.id}`} aria-hidden="true"/>{option.name}</button>)}</div><b>Profile effect</b><div className="style-choice-grid"><button type="button" className={`style-choice effect-style-choice ${editProfileEffect==="none"?"active":""}`} onClick={()=>setEditProfileEffect("none")}><span className="effect-preview effect-preview-none"/>None</button><button type="button" className={`style-choice effect-style-choice ${editProfileEffect==="glow"?"active":""}`} onClick={()=>setEditProfileEffect("glow")}><span className="effect-preview effect-preview-oni"><ProfileDecoration name="OnisCurse" src={TRANSPARENT_AVATAR} scale={0.15}/></span>Oni’s Curse</button></div><b>Profile gradient</b><div className="gradient-options">{gradientOptions.map(option=><button type="button" key={option.id} className={`gradient-option ${editProfileGradient===option.id?"active":""}`} style={{background:option.value}} onClick={()=>{setEditProfileGradient(option.id);const colors=option.value.match(/#[0-9a-fA-F]{6}/g)||[];if(colors[0])setGradientStart(colors[0]);if(colors[1])setGradientMiddle(colors[1]);if(colors[2])setGradientEnd(colors[2]);const angle=option.value.match(/linear-gradient\((\d+)deg/);if(angle)setGradientAngle(Number(angle[1]));}} aria-label={`${option.name} gradient`} title={option.name}>{editProfileGradient===option.id?"✓":""}</button>)}</div><b>Custom gradient</b><div className="custom-gradient-preview" style={{background:customGradient}}/><div className="custom-gradient-controls"><label>Color 1<input aria-label="Gradient color one" type="color" value={gradientStart} onChange={e=>setGradientStart(e.target.value)}/></label><label>Color 2<input aria-label="Gradient color two" type="color" value={gradientMiddle} onChange={e=>setGradientMiddle(e.target.value)}/></label><label>Color 3<input aria-label="Gradient color three" type="color" value={gradientEnd} onChange={e=>setGradientEnd(e.target.value)}/></label></div><label className="gradient-angle-control">Angle <span>{gradientAngle}°</span><input type="range" min="0" max="360" value={gradientAngle} onChange={e=>setGradientAngle(Number(e.target.value))}/></label></div><label className="settings-field"><span>About me</span><textarea value={editAboutMe} onChange={e=>setEditAboutMe(e.target.value)} maxLength={300} rows={4} placeholder="Tell people a little about yourself..." /><small>{editAboutMe.length}/300 · Shown on your profile</small></label><div className="banner-editor"><div className={`banner-preview profile-gradient-${editProfileGradient}`} style={{background:customGradient}}>{(bannerPreview || profile?.banner_url) && <img className="profile-banner-image" src={bannerPreview || profile?.banner_url || ""} alt="Banner preview"/>}<span>PROFILE BANNER</span></div><label className="upload-avatar"><ImageIcon size={15}/> Upload banner<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>setBannerFile(e.target.files?.[0] || null)}/></label><span className="field-hint">Wide image · JPG, PNG, WEBP or GIF · Max 5 MB</span></div><div className="settings-divider"/><div className="settings-divider"/></section>
<section className="settings-panel" hidden={settingsSection!=="appearance"}><div className="settings-section-title"><Palette size={16}/> App appearance</div><div className="theme-choice"><button type="button" className={theme==="light"?"theme-option active":"theme-option"} onClick={()=>setTheme("light")}><Sun size={19}/><span><b>Light mode</b><small>Bright and clean</small></span>{theme==="light" && <CheckCheck size={17}/>}</button><button type="button" className={theme==="dark"?"theme-option active":"theme-option"} onClick={()=>setTheme("dark")}><Moon size={19}/><span><b>Dark mode</b><small>Easy on the eyes</small></span>{theme==="dark" && <CheckCheck size={17}/>}</button></div></section>
<section className="settings-panel" hidden={settingsSection!=="theme"}><div className="accent-picker"><div className="accent-picker-heading"><b>Theme color</b><span>Choose your Tuffchat accent</span></div><div className="accent-swatches">{accentOptions.map(option => <button key={option.id} type="button" className={`accent-swatch ${accent === option.id ? "active" : ""}`} style={{ "--swatch": option.color } as React.CSSProperties} onClick={() => setAccent(option.id)} aria-label={`${option.name} theme color`} aria-pressed={accent === option.id}><span/>{accent === option.id && <CheckCheck size={15}/>}<small>{option.name}</small></button>)}</div></div></section>
<section className="settings-panel" hidden={settingsSection!=="account"}><div className="push-settings"><div><b>Push notifications</b><p>Get alerts for new messages, @mentions and completed AI replies.</p><small>{pushEnabled ? "Notifications are enabled on this device." : "Allow browser notifications to receive alerts even when Tuffchat is closed."}</small>{pushError && <small className="push-error">{pushError}</small>}</div><button type="button" className="primary-btn" onClick={enablePushNotifications} disabled={pushEnabled}>{pushEnabled ? "Enabled" : "Enable notifications"}</button></div><div className="settings-footnote"><ShieldCheck size={15}/> Your profile changes are saved to your Tuffchat account.</div><div className="account-danger-zone"><div><b>Delete account</b><p>Your account is deactivated immediately. You have 30 days to restore it before permanent deletion.</p></div>{!deleteConfirm ? <button type="button" className="danger-btn" onClick={()=>{setDeleteConfirm(true);setDeletionError("");}}><Trash2 size={15}/> Delete account</button> : <div className="delete-confirm"><span>Are you sure? You’ll be signed out of chats and your 30-day countdown will start.</span><button type="button" className="cancel-btn" onClick={()=>setDeleteConfirm(false)}>Keep account</button><button type="button" className="danger-btn" disabled={deletionBusy} onClick={requestAccountDeletion}>{deletionBusy ? "Deactivating…" : "Yes, deactivate"}</button></div>}</div>{deletionError && <div className="settings-error">{deletionError}</div>}<div className="account-signout"><div><b>Sign out</b><p>Sign out of your Tuffchat account on this device.</p></div><button type="button" className="signout-btn" onClick={async()=>{await supabase.auth.signOut();setSettingsOpen(false);}}><LogOut size={16}/> Sign out</button></div></section>
</div></div>
{profileSaveError && <div className="settings-error">{profileSaveError}</div>}<div className="settings-actions"><button type="button" className="cancel-btn" onClick={()=>setSettingsOpen(false)}>Cancel</button><button className="primary-btn" type="submit" disabled={profileSaving}><Save size={16}/>{profileSaving?"Saving…":"Save changes"}</button></div></form></div>}
    <nav className={`group-rail ${mobileChat ? "group-rail-hidden" : ""}`} aria-label="Tuffchat navigation">
      <button className={`rail-home ${!active || !active.is_group ? "rail-selected" : ""}`} title="Chats" aria-label="Chats" onClick={()=>{setActiveId("");setMobileChat(false);}}>
        <MessageCircle size={22}/>
      </button>
      <div className="rail-divider"/>
      <div className="group-rail-label">GROUPS</div>
      <div className="group-rail-list">
        {groupConversations.map(group => <button key={group.id} className={`group-rail-icon ${activeId===group.id ? "rail-selected" : ""}`} title={group.name || "Group"} aria-label={`Open group ${group.name || "Group"}`} onClick={()=>{setActiveId(group.id);setMobileChat(true);}}>
          <span>{(group.name || "G").trim().charAt(0).toUpperCase()}</span>
        </button>)}
      </div>
      <button className="group-rail-add" title="Create group" aria-label="Create group" onClick={()=>setShowGroup(true)}><Plus size={22}/></button>
    </nav>
    <aside className={`sidebar ${mobileChat ? "sidebar-hidden" : ""}`}>
      <header className="side-header"><div className="brand-lockup"><div className="brand-mark small">t</div><b>tuffchat</b></div><div className="side-actions"><button title="Create group" onClick={()=>setShowGroup(true)}><Users size={19}/></button><button title="Find people" onClick={()=>setShowPeople(true)}><Plus size={21}/></button></div></header>
      <div className="profile-strip"><button className="profile-open" onClick={()=>setViewedProfile(profile)} aria-label="View your profile"><Avatar profile={profile}/><span className="profile-meta"><b className={`profile-name-font-${profile?.display_name_font || "modern"}`}>{profile?.display_name || profile?.username}</b><span>@{profile?.username}</span></span></button><button title="Settings" onClick={openSettings}><Settings size={17}/></button></div>
      <div className="search-box"><Search size={17}/><input placeholder="Search or start a new chat" value={search} onChange={e=>searchPeople(e.target.value)} /><button onClick={()=>setShowPeople(true)} title="Find people"><Plus size={17}/></button></div>
      {search.length >= 2 && <div className="search-results">{people.map(p=><button className="person-row" key={p.id} onClick={()=>startDirect(p)}><Avatar profile={p}/><span><b className={`profile-name-font-${p.display_name_font || "modern"}`}>{p.display_name || p.username}</b><small>@{p.username}</small></span><MessageCircle size={17}/></button>)}</div>}
      <div className="chat-list-label">DIRECT MESSAGES <span>{sortedConversations.length}</span></div>
      <div className="chat-list">{sortedConversations.map(c=>{const selfChat = isSelfChat(c); const member = selfChat ? profile : c.conversation_members?.find(m=>m.user_id!==session.user.id)?.profiles; const title = selfChat ? "You" : c.is_group ? c.name || "Group chat" : member?.display_name || member?.username || "Direct chat"; return <button key={c.id} className={`chat-row ${activeId===c.id?"selected":""} ${selfChat?"self-chat-row":""}`} onClick={()=>{setActiveId(c.id);setMobileChat(true);}}><span className="avatar-open" aria-hidden="true"><Avatar profile={member} label={title}/></span><span className="chat-row-copy"><b className={member ? `profile-name-font-${member.display_name_font || "modern"}` : undefined}>{title}</b><small>{lastMessages[c.id]}</small></span><span className="chat-time">{selfChat ? "NOTE" : new Date(c.created_at).toLocaleDateString([], {month:"short",day:"numeric"})}</span></button>;})}
      {!sortedConversations.length && <div className="empty-list"><MessageCircle size={26}/><b>No direct messages yet</b><span>Find a friend and say hello.</span><button onClick={()=>setShowPeople(true)}>Find people</button></div>}</div>
      <footer className="side-footer"><span className="online-dot"/> Your space is ready</footer>
    </aside>
    <section className={`chat-panel ${mobileChat ? "chat-panel-mobile" : ""}`}>
      {active ? <><header className="chat-header"><button className="mobile-back" onClick={()=>setMobileChat(false)}><ArrowLeft/></button><button className="avatar-open" onClick={()=>{if(activePerson)setViewedProfile(activePerson);}} aria-label={isSelfChat(active) ? "View your profile" : `View ${activeTitle} profile`}><Avatar profile={activePerson} label={activeTitle}/></button><div className="chat-heading"><b className={!active?.is_group && activePerson ? `profile-name-font-${activePerson.display_name_font || "modern"}` : undefined}>{activeTitle}</b><span>{aiMode && isSelfChat(active) ? "AI assistant · powered by Gemini" : isSelfChat(active) ? "Only you can see this chat" : active.is_group ? `${activeMembers.length} members` : "Direct message"}</span></div><div className="chat-header-actions">{isSelfChat(active) && <button className={aiMode ? "active" : ""} title={aiMode ? "Back to your notes" : "Open AI Chat"} onClick={()=>{setAiMode(v=>!v);setAiError("");}}><Sparkles size={18}/></button>}<button title="Voice call"><Phone size={18}/></button><button title="Video call"><Video size={19}/></button><button title="More"><MoreVertical size={19}/></button></div></header>
      <div className={`message-area ${aiMode ? "ai-message-area" : ""}`}>{aiMode && isSelfChat(active) ? <>{aiImageData && <div className="ai-image-pending"><img src={aiImageData} alt="Ready to send"/><button type="button" onClick={()=>setAiImageData(null)}><X size={14}/></button></div>}<div className="ai-welcome"><div className="ai-welcome-icon"><Sparkles size={22}/></div><b>Your Tuffchat AI</b><span>Ask anything. Your AI conversation is private and separate from your notes.</span></div>{aiMessages.map(m=><div key={m.id} className={`ai-message-line ${m.role==="user"?"mine":"assistant"}`}><div className="ai-message-bubble">{m.role==="assistant" && <b><Bot size={14}/> Tuffchat AI</b>}{m.image_data && <img className="ai-attached-image" src={m.image_data} alt="Image sent to Tuffchat AI"/>}{m.content && <span>{m.content}</span>}<small>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></div></div>)}{aiSending && <TypingIndicator label="Tuffchat AI is typing"/>}<div ref={bottomRef}/>{aiError && <div className="ai-error">{aiError}</div>}</> : <><div className="date-chip">TODAY</div>{messages.map(m=>{const mine=m.sender_id===session.user.id; const sender=activeMembers.find(x=>x.user_id===m.sender_id)?.profiles; const replied=messages.find(x=>x.id===m.reply_to); return <div key={m.id} className={`message-line ${mine?"mine":""}`}>{!mine && active.is_group && <Avatar profile={sender} size="sm"/>}<div className="message-bubble">{!mine && active.is_group && <b className={`sender-name profile-name-font-${sender?.display_name_font || "modern"}`}>{sender?.display_name || sender?.username || "Member"}</b>}{m.reply_to && <div className="message-reply-preview"><b>↪ Replying to {replied?.sender_id===session.user.id ? "you" : replied ? (activeMembers.find(x=>x.user_id===replied.sender_id)?.profiles?.display_name || "message") : "a message"}</b><span>{replied?.content || "Original message"}</span></div>}{m.forwarded_from && <div className="message-forwarded-label">↗ Forwarded</div>}{editingMessageId===m.id ? <form className="message-edit-form" onSubmit={e=>{e.preventDefault();saveMessageEdit(m.id);}}><input autoFocus value={editDraft} onChange={e=>setEditDraft(e.target.value)}/><button type="submit">Save</button><button type="button" onClick={()=>setEditingMessageId(null)}>Cancel</button></form> : <>{m.kind==="gif" ? <img className="gif-message" src={m.content} alt="GIF"/> : <span>{m.content}</span>}</>}<small>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} {m.edited_at && <i>edited</i>} {mine && <CheckCheck size={14}/>}</small><div className="message-actions"><button type="button" onClick={()=>startReply(m)}><Reply size={13}/> Reply</button><button type="button" onClick={()=>setForwardingMessage(m)}><Forward size={13}/> Forward</button>{mine && <button type="button" onClick={()=>{setEditingMessageId(m.id);setEditDraft(m.content);}}><Pencil size={13}/> Edit</button>}{mine && <button type="button" className="message-delete-action" onClick={()=>deleteMessage(m.id)}><Trash2 size={13}/> Delete</button>}</div></div></div>;})}{typingLabel && !isSelfChat(active) && <TypingIndicator label={typingLabel}/>}<div ref={bottomRef}/>{!messages.length && <div className="first-message"><div>{isSelfChat(active) ? "📝" : "👋"}</div><b>{isSelfChat(active) ? "Your own little corner." : "This is the start of something good."}</b><span>{isSelfChat(active) ? "Save notes, links, ideas and messages here." : "Send a message to kick things off."}</span></div>}</>}</div>
      {messageError && !aiMode && <div className="message-error">{messageError}</div>}
      {!aiMode && emojiOpen && <div className="emoji-tray">{EMOJIS.map(e=><button key={e} onClick={()=>setDraft(d=>d+e)}>{e}</button>)}</div>}
      {replyingTo && !aiMode && <div className="reply-composer-preview"><span><b>Replying to</b> {replyingTo.sender_id===session.user.id ? "yourself" : (activeMembers.find(x=>x.user_id===replyingTo.sender_id)?.profiles?.display_name || "message")} · {replyingTo.content}</span><button type="button" onClick={()=>setReplyingTo(null)}><X size={15}/></button></div>}
      {aiMode && isSelfChat(active) ? <form className="composer ai-composer" onSubmit={sendAiMessage}><label className="ai-image-button" title="Attach an image"><ImageIcon size={20}/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>4*1024*1024){setAiError("Images must be 4 MB or smaller.");e.target.value="";return;}if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setAiError("Choose a PNG, JPG or WEBP image.");e.target.value="";return;}const reader=new FileReader();reader.onload=()=>{setAiImageData(String(reader.result));setAiError("");};reader.readAsDataURL(file);e.target.value="";}}/></label><input value={aiDraft} onChange={e=>setAiDraft(e.target.value)} placeholder="Message Tuffchat AI…"/><button type="submit" className="send-btn" disabled={(!aiDraft.trim() && !aiImageData) || aiSending}>{aiSending ? <span className="ai-spinner"/> : <Send size={19}/>}</button></form> : <form className="composer" onSubmit={e=>{e.preventDefault();sendMessage();}}><button type="button" title="GIFs" onClick={()=>setGifSearch(" ")}><ImageIcon size={21}/></button><button type="button" title="Emoji" onClick={()=>setEmojiOpen(!emojiOpen)}><Smile size={22}/></button><input value={draft} onChange={e=>handleDraftChange(e.target.value)} placeholder="Type a message…"/><button type="submit" className="send-btn" disabled={!draft.trim() || sending}><Send size={19}/></button></form>}
      </> : <div className="welcome-panel"><div className="welcome-graphic"><div className="welcome-icon"><MessageCircle size={42}/></div><span>✦</span><span>✦</span></div><h1>Good to see you.</h1><p>Pick a conversation or find your people to get started.</p><button className="primary-btn" onClick={()=>setShowPeople(true)}><Plus size={18}/> Start a chat</button><div className="encryption-note">Private conversations for your favourite people.</div></div>}
    </section>
    {showPeople && <div className="modal-backdrop" onClick={()=>setShowPeople(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Find your people</h2><p>Search by their username.</p></div><button onClick={()=>setShowPeople(false)}><X/></button></div><div className="modal-search"><Search size={18}/><input autoFocus value={search} onChange={e=>searchPeople(e.target.value)} placeholder="Search usernames…"/></div>{people.map(p=><button className="person-row" key={p.id} onClick={()=>startDirect(p)}><Avatar profile={p}/><span><b className={`profile-name-font-${p.display_name_font || "modern"}`}>{p.display_name || p.username}</b><small>@{p.username}</small></span><MessageCircle size={18}/></button>)}{search.length<2 && <div className="modal-hint">Type at least 2 characters to search.</div>}{search.length>=2 && !people.length && <div className="modal-hint">No users found yet.</div>}</div></div>}
    {showGroup && <div className="modal-backdrop" onClick={()=>setShowGroup(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Make a group</h2><p>Bring the whole crew together.</p></div><button onClick={()=>setShowGroup(false)}><X/></button></div><label className="modal-label">Group name<input value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="The gang" /></label><div className="modal-search"><Search size={18}/><input value={groupSearch} onChange={e=>searchPeople(e.target.value,true)} placeholder="Add people by username…"/></div>{groupPeople.map(p=><button className="person-row" key={p.id} onClick={()=>setSelectedPeople(s=>s.includes(p.id)?s.filter(x=>x!==p.id):[...s,p.id])}><Avatar profile={p}/><span><b className={`profile-name-font-${p.display_name_font || "modern"}`}>{p.display_name || p.username}</b><small>@{p.username}</small></span><span className={`select-dot ${selectedPeople.includes(p.id) ? "checked" : ""}`}>{selectedPeople.includes(p.id)?"✓":"+"}</span></button>)}<div className="modal-bottom"><span>{selectedPeople.length} selected</span><button className="primary-btn" disabled={!groupName.trim() || !selectedPeople.length} onClick={createGroup}>Create group</button></div></div></div>}
    {forwardingMessage && <div className="modal-backdrop" onClick={()=>setForwardingMessage(null)}><div className="modal forward-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Forward message</h2><p>Choose where to send this message.</p></div><button onClick={()=>setForwardingMessage(null)}><X/></button></div>{sortedConversations.map(conversation=>{const self=isSelfChat(conversation);const person=conversation.conversation_members?.find(member=>member.user_id!==session.user.id)?.profiles;const title=self?"You":conversation.is_group?(conversation.name||"Group chat"):(person?.display_name||person?.username||"Direct chat");return <button key={conversation.id} className="person-row" onClick={()=>forwardMessageTo(conversation)}><Avatar profile={self?profile:person} label={title}/><span><b>{title}</b><small>{conversation.is_group?"Group":self?"Your private notes":"Direct message"}</small></span><Forward size={17}/></button>;})}</div></div>}
    {gifSearch.length>0 && <div className="gif-search-float"><div className="modal-head"><b>GIF search</b><button onClick={()=>{setGifSearch("");setGifResults([]);}}><X/></button></div><input autoFocus value={gifSearch.trimStart()} onChange={e=>searchGifs(e.target.value)} placeholder="Search GIFs…"/>{gifError && <div className="gif-error">{gifError}</div>}<div className="gif-grid">{gifResults.map(g=><button key={g.url} onClick={()=>{sendMessage(g.url,"gif");setGifSearch("");setGifResults([]);setGifError("");}}><img src={g.preview || g.url} alt="GIF"/></button>)}</div><div className="giphy-credit">Powered by GIPHY</div></div>}
    </main>;
}
