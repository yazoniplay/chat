import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase, isConfigured } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { Search, MessageCircle, Users, Plus, Send, Smile, LogOut, Settings, Phone, Video, MoreVertical, ArrowLeft, X, CheckCheck, Image as ImageIcon, UserRound, Palette, Sun, Moon, Camera, Save, ShieldCheck, Trash2 } from "lucide-react";

type Profile = { id: string; username: string; display_name: string; avatar_url: string | null; deletion_requested_at?: string | null };
type Conversation = { id: string; name: string | null; is_group: boolean; created_at: string; conversation_members?: { user_id: string; profiles: Profile | null }[] };
type Message = { id: string; conversation_id: string; sender_id: string; content: string; kind: string; created_at: string };
const EMOJIS = ["😀","😂","🥹","😍","😎","🔥","❤️","💀","😭","👍","🙏","🎉","💯","👀","🤝","✨","🥶","😈"];

function Avatar({ profile, label, size = "md" }: { profile?: Profile | null; label?: string; size?: "sm" | "md" | "lg" }) {
  const name = profile?.display_name || profile?.username || label || "?";
  return <div className={`avatar avatar-${size}`} style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : undefined}>{!profile?.avatar_url && name.slice(0,1).toUpperCase()}</div>;
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
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState<{url:string; preview:string}[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("tuffchat-theme") as "dark" | "light") || "dark");
  const avatarPreview = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : null, [avatarFile]);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tuffchat-theme", theme);
  }, [theme]);

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

  async function loadConversations() {
    if (!session?.user) return;
    const { data: memberships } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", session.user.id);
    const ids = (memberships || []).map((m: {conversation_id:string}) => m.conversation_id);
    if (!ids.length) { setConversations([]); return; }
    const { data } = await supabase.from("conversations").select("id,name,is_group,created_at,conversation_members(user_id,profiles(id,username,display_name,avatar_url))").in("id", ids).order("created_at", { ascending: false });
    setConversations((data || []) as unknown as Conversation[]);
  }

  const active = conversations.find(c => c.id === activeId);
  const activeMembers = active?.conversation_members || [];
  const otherMember = activeMembers.find(m => m.user_id !== session?.user.id)?.profiles;
  const activeTitle = active?.is_group ? (active.name || "Group chat") : (otherMember?.display_name || otherMember?.username || "Chat");

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let live = true;
    supabase.from("messages").select("*").eq("conversation_id", activeId).order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => { if (live) setMessages((data || []) as Message[]); });
    const channel = supabase.channel(`messages-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, payload => {
        const next = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === next.id) ? prev : [...prev, next]);
      }).subscribe();
    return () => { live = false; supabase.removeChannel(channel); };
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function openSettings() {
    setEditUsername(profile?.username || "");
    setEditDisplayName(profile?.display_name || "");
    setAvatarFile(null);
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
    setProfileSaving(true);
    setProfileSaveError("");
    let avatarUrl = profile.avatar_url;
    if (avatarFile) {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const uploadUser = authData.session?.user;
      if (authError || !uploadUser || uploadUser.id !== session.user.id) {
        setProfileSaveError("Your login session expired. Sign out and sign back in, then try again.");
        setProfileSaving(false);
        return;
      }
      const extensionByType: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
      };
      const extension = extensionByType[avatarFile.type];
      if (!extension) {
        setProfileSaveError("Please choose a JPG, PNG, WEBP or GIF image.");
        setProfileSaving(false);
        return;
      }
      // Storage paths are relative to the avatars bucket; the first folder must be the signed-in user's ID.
      const path = `${uploadUser.id}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile, {
        upsert: false,
        contentType: avatarFile.type,
        cacheControl: "3600",
      });
      if (uploadError) {
        setProfileSaveError(`Photo upload failed: ${uploadError.message}`);
        setProfileSaving(false);
        return;
      }
      avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase.from("profiles").update({ username: cleanUsername, display_name: cleanDisplayName, avatar_url: avatarUrl }).eq("id", session.user.id).select("id,username,display_name,avatar_url").single();
    if (error) setProfileSaveError(error.code === "23505" ? "That username is already taken. Try another one." : error.message);
    else { setProfile(data as Profile); setSettingsOpen(false); setAvatarFile(null); }
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
    const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url").ilike("username", `%${value.trim()}%`).neq("id", session?.user.id || "").limit(12);
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

  async function sendMessage(content = draft, kind = "text") {
    if (!content.trim() || !activeId || !session?.user || sending) return;
    setSending(true); setDraft(""); setEmojiOpen(false);
    const { error } = await supabase.from("messages").insert({ conversation_id: activeId, sender_id: session.user.id, content: content.trim(), kind });
    if (error) setDraft(content);
    setSending(false);
  }

  async function searchGifs(value: string) {
    setGifSearch(value);
    const key = import.meta.env.VITE_TENOR_API_KEY as string | undefined;
    if (!key || value.trim().length < 2) { setGifResults([]); return; }
    try {
      const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(value)}&key=${key}&limit=12&media_filter=tinygif,gif`);
      const json = await res.json();
      setGifResults((json.results || []).map((item: any) => ({ url: item.media_formats?.gif?.url, preview: item.media_formats?.tinygif?.url })).filter((g: any) => g.url));
    } catch { setGifResults([]); }
  }

  const sortedConversations = useMemo(() => conversations.filter(c => !c.is_group), [conversations]);
  const groupConversations = useMemo(() => conversations.filter(c => c.is_group), [conversations]);
  const lastMessages = useMemo(() => Object.fromEntries(sortedConversations.map(c => [c.id, "Tap to open conversation"])), [sortedConversations]);

  if (!isConfigured) return <div className="setup-screen"><div className="setup-card"><div className="brand-mark">t</div><h1>Welcome to <span>Tuffchat</span></h1><p>Your crew, one chat away.</p><div className="setup-step"><b>One quick setup step</b><p>Connect a free Supabase project to power accounts, chats and live messages.</p><ol><li>Create a project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>.</li><li>Run <code>supabase/migrations/0001_tuffchat.sql</code> in its SQL Editor.</li><li>Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and anon key.</li></ol></div><p className="muted">No secret service-role key belongs in this app.</p></div></div>;

  if (loading) return <div className="loading-screen"><div className="brand-mark">t</div><span>Loading Tuffchat…</span></div>;

  if (session && profile?.deletion_requested_at) return <div className="deactivated-screen"><div className="deactivated-card"><div className="brand-mark">t</div><span className="settings-kicker">ACCOUNT DEACTIVATED</span><h1>Your account is on pause.</h1><p>Your account is hidden and can’t send or receive chats. It is scheduled for permanent deletion on <b>{new Date(new Date(profile.deletion_requested_at).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString([], { dateStyle: "long" })}</b>.</p><p>You can restore everything by cancelling deletion before that date.</p>{deletionError && <div className="settings-error">{deletionError}</div>}<button className="primary-btn full" disabled={deletionBusy} onClick={cancelAccountDeletion}>{deletionBusy ? "Restoring…" : "Keep my account"}</button><button className="deactivated-signout" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/> Sign out</button></div></div>;

  if (!session) return <div className="auth-screen"><div className="auth-art"><div className="brand-mark">t</div><div><span className="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>Good chats.<br/><em>Better days.</em></h1><p>Bring your favourite people together, wherever life takes you.</p></div><div className="art-bubbles"><span>hey 👋</span><span>you coming? 🔥</span><span>always 😂</span></div></div><form className="auth-card" onSubmit={authenticate}><div className="auth-brand"><div className="brand-mark">t</div><b>Tuffchat</b></div><h2>{authMode === "login" ? "Welcome back" : "Make it official"}</h2><p className="muted">{authMode === "login" ? "Sign in to catch up with your people." : "Create an account and claim your username."}</p>{authMode === "signup" && <><label>Username<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="your_username" required /></label><label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="What should people call you?" /></label></>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required /></label>{authError && <div className="auth-message">{authError}</div>}<button className="primary-btn full" type="submit">{authMode === "login" ? "Sign in" : "Create account"}</button><p className="switch-auth">{authMode === "login" ? "New around here?" : "Already have an account?"} <button type="button" onClick={()=>{setAuthMode(authMode==="login"?"signup":"login");setAuthError("");}}>{authMode === "login" ? "Create account" : "Sign in"}</button></p></form></div>;

  return <main className={`app-shell theme-${theme}`}>
    {settingsOpen && <div className="modal-backdrop settings-backdrop" onClick={()=>setSettingsOpen(false)}><form className="settings-modal" onSubmit={saveProfile} onClick={e=>e.stopPropagation()}><div className="settings-top"><div><span className="settings-kicker">YOUR ACCOUNT</span><h2>Settings</h2><p>Make Tuffchat feel like yours.</p></div><button type="button" className="icon-close" onClick={()=>setSettingsOpen(false)} aria-label="Close settings"><X size={20}/></button></div><div className="settings-section-title"><UserRound size={16}/> Profile</div><div className="avatar-editor"><div className="avatar-preview">{avatarPreview ? <img src={avatarPreview} alt="Profile preview"/> : <Avatar profile={profile} size="lg"/>}</div><label className="upload-avatar"><Camera size={15}/> Change photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>setAvatarFile(e.target.files?.[0] || null)}/></label><span className="field-hint">JPG, PNG, WEBP or GIF. Max 5 MB.</span></div><label className="settings-field"><span>Username</span><div className="username-input"><span>@</span><input value={editUsername} onChange={e=>setEditUsername(e.target.value)} maxLength={20} autoComplete="username" /></div><small>3–20 characters · letters, numbers and _</small></label><label className="settings-field"><span>Display name</span><input value={editDisplayName} onChange={e=>setEditDisplayName(e.target.value)} maxLength={40} placeholder="Your name" /></label><div className="settings-divider"/><div className="settings-section-title"><Palette size={16}/> Appearance</div><div className="theme-choice"><button type="button" className={theme==="light"?"theme-option active":"theme-option"} onClick={()=>setTheme("light")}><Sun size={19}/><span><b>Light mode</b><small>Bright and clean</small></span>{theme==="light" && <CheckCheck size={17}/>}</button><button type="button" className={theme==="dark"?"theme-option active":"theme-option"} onClick={()=>setTheme("dark")}><Moon size={19}/><span><b>Dark mode</b><small>Easy on the eyes</small></span>{theme==="dark" && <CheckCheck size={17}/>}</button></div><div className="settings-footnote"><ShieldCheck size={15}/> Your profile changes are saved to your Tuffchat account.</div><div className="account-danger-zone"><div><b>Delete account</b><p>Your account is deactivated immediately. You have 30 days to restore it before permanent deletion.</p></div>{!deleteConfirm ? <button type="button" className="danger-btn" onClick={()=>{setDeleteConfirm(true);setDeletionError("");}}><Trash2 size={15}/> Delete account</button> : <div className="delete-confirm"><span>Are you sure? You’ll be signed out of chats and your 30-day countdown will start.</span><button type="button" className="cancel-btn" onClick={()=>setDeleteConfirm(false)}>Keep account</button><button type="button" className="danger-btn" disabled={deletionBusy} onClick={requestAccountDeletion}>{deletionBusy ? "Deactivating…" : "Yes, deactivate"}</button></div>}</div>{deletionError && <div className="settings-error">{deletionError}</div>}{profileSaveError && <div className="settings-error">{profileSaveError}</div>}<div className="settings-actions"><button type="button" className="signout-btn" onClick={async()=>{await supabase.auth.signOut();setSettingsOpen(false);}}><LogOut size={16}/> Sign out</button><button type="button" className="cancel-btn" onClick={()=>setSettingsOpen(false)}>Cancel</button><button className="primary-btn" type="submit" disabled={profileSaving}><Save size={16}/>{profileSaving?"Saving…":"Save changes"}</button></div></form></div>}
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
      <div className="profile-strip"><Avatar profile={profile} /><div className="profile-meta"><b>{profile?.display_name || profile?.username}</b><span>@{profile?.username}</span></div><button title="Settings" onClick={openSettings}><Settings size={17}/></button></div>
      <div className="search-box"><Search size={17}/><input placeholder="Search or start a new chat" value={search} onChange={e=>searchPeople(e.target.value)} /><button onClick={()=>setShowPeople(true)} title="Find people"><Plus size={17}/></button></div>
      {search.length >= 2 && <div className="search-results">{people.map(p=><button className="person-row" key={p.id} onClick={()=>startDirect(p)}><Avatar profile={p}/><span><b>{p.display_name || p.username}</b><small>@{p.username}</small></span><MessageCircle size={17}/></button>)}</div>}
      <div className="chat-list-label">DIRECT MESSAGES <span>{sortedConversations.length}</span></div>
      <div className="chat-list">{sortedConversations.map(c=>{const member = c.conversation_members?.find(m=>m.user_id!==session.user.id)?.profiles; const title = c.is_group ? c.name || "Group chat" : member?.display_name || member?.username || "Direct chat"; return <button key={c.id} className={`chat-row ${activeId===c.id?"selected":""}`} onClick={()=>{setActiveId(c.id);setMobileChat(true);}}><Avatar profile={member} label={title}/><span className="chat-row-copy"><b>{title}</b><small>{lastMessages[c.id]}</small></span><span className="chat-time">{new Date(c.created_at).toLocaleDateString([], {month:"short",day:"numeric"})}</span></button>;})}
      {!sortedConversations.length && <div className="empty-list"><MessageCircle size={26}/><b>No direct messages yet</b><span>Find a friend and say hello.</span><button onClick={()=>setShowPeople(true)}>Find people</button></div>}</div>
      <footer className="side-footer"><span className="online-dot"/> Your space is ready</footer>
    </aside>
    <section className={`chat-panel ${mobileChat ? "chat-panel-mobile" : ""}`}>
      {active ? <><header className="chat-header"><button className="mobile-back" onClick={()=>setMobileChat(false)}><ArrowLeft/></button><Avatar profile={otherMember} label={activeTitle}/><div className="chat-heading"><b>{activeTitle}</b><span>{active.is_group ? `${activeMembers.length} members` : "Direct message"}</span></div><div className="chat-header-actions"><button title="Voice call"><Phone size={18}/></button><button title="Video call"><Video size={19}/></button><button title="More"><MoreVertical size={19}/></button></div></header>
      <div className="message-area"><div className="date-chip">TODAY</div>{messages.map(m=>{const mine=m.sender_id===session.user.id; const sender=activeMembers.find(x=>x.user_id===m.sender_id)?.profiles; return <div key={m.id} className={`message-line ${mine?"mine":""}`}>{!mine && active.is_group && <Avatar profile={sender} size="sm"/>}<div className="message-bubble">{!mine && active.is_group && <b className="sender-name">{sender?.display_name || sender?.username || "Member"}</b>}{m.kind==="gif" ? <img className="gif-message" src={m.content} alt="GIF"/> : <span>{m.content}</span>}<small>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} {mine && <CheckCheck size={14}/>}</small></div></div>;})}<div ref={bottomRef}/>{!messages.length && <div className="first-message"><div>👋</div><b>This is the start of something good.</b><span>Send a message to kick things off.</span></div>}</div>
      {emojiOpen && <div className="emoji-tray">{EMOJIS.map(e=><button key={e} onClick={()=>setDraft(d=>d+e)}>{e}</button>)}</div>}
      <form className="composer" onSubmit={e=>{e.preventDefault();sendMessage();}}><button type="button" title="GIFs" onClick={()=>setGifSearch(" ")}><ImageIcon size={21}/></button><button type="button" title="Emoji" onClick={()=>setEmojiOpen(!emojiOpen)}><Smile size={22}/></button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Type a message…" /><button type="submit" className="send-btn" disabled={!draft.trim() || sending}><Send size={19}/></button></form>
      </> : <div className="welcome-panel"><div className="welcome-graphic"><div className="welcome-icon"><MessageCircle size={42}/></div><span>✦</span><span>✦</span></div><h1>Good to see you.</h1><p>Pick a conversation or find your people to get started.</p><button className="primary-btn" onClick={()=>setShowPeople(true)}><Plus size={18}/> Start a chat</button><div className="encryption-note">Private conversations for your favourite people.</div></div>}
    </section>
    {showPeople && <div className="modal-backdrop" onClick={()=>setShowPeople(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Find your people</h2><p>Search by their username.</p></div><button onClick={()=>setShowPeople(false)}><X/></button></div><div className="modal-search"><Search size={18}/><input autoFocus value={search} onChange={e=>searchPeople(e.target.value)} placeholder="Search usernames…"/></div>{people.map(p=><button className="person-row" key={p.id} onClick={()=>startDirect(p)}><Avatar profile={p}/><span><b>{p.display_name || p.username}</b><small>@{p.username}</small></span><MessageCircle size={18}/></button>)}{search.length<2 && <div className="modal-hint">Type at least 2 characters to search.</div>}{search.length>=2 && !people.length && <div className="modal-hint">No users found yet.</div>}</div></div>}
    {showGroup && <div className="modal-backdrop" onClick={()=>setShowGroup(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Make a group</h2><p>Bring the whole crew together.</p></div><button onClick={()=>setShowGroup(false)}><X/></button></div><label className="modal-label">Group name<input value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="The gang" /></label><div className="modal-search"><Search size={18}/><input value={groupSearch} onChange={e=>searchPeople(e.target.value,true)} placeholder="Add people by username…"/></div>{groupPeople.map(p=><button className="person-row" key={p.id} onClick={()=>setSelectedPeople(s=>s.includes(p.id)?s.filter(x=>x!==p.id):[...s,p.id])}><Avatar profile={p}/><span><b>{p.display_name || p.username}</b><small>@{p.username}</small></span><span className={`select-dot ${selectedPeople.includes(p.id) ? "checked" : ""}`}>{selectedPeople.includes(p.id)?"✓":"+"}</span></button>)}<div className="modal-bottom"><span>{selectedPeople.length} selected</span><button className="primary-btn" disabled={!groupName.trim() || !selectedPeople.length} onClick={createGroup}>Create group</button></div></div></div>}
    {gifSearch.length>0 && <div className="gif-search-float"><div className="modal-head"><b>GIF search</b><button onClick={()=>{setGifSearch("");setGifResults([]);}}><X/></button></div><input autoFocus value={gifSearch.trimStart()} onChange={e=>searchGifs(e.target.value)} placeholder="Search GIFs…"/><div className="gif-grid">{gifResults.map(g=><button key={g.url} onClick={()=>{sendMessage(g.url,"gif");setGifSearch("");setGifResults([]);}}><img src={g.preview || g.url} alt="GIF"/></button>)}</div></div>}
    </main>;
}
