import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { ArrowLeft, Bot, Check, ChevronDown, Gamepad2, Swords, Trophy, Users, X } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./chat-games.css";

type Member = { user_id: string; profiles?: { username?: string; display_name?: string; avatar_url?: string | null } | null };
type ChatGame = { id: string; conversation_id: string; game_type: string; status: "pending" | "active" | "finished" | "declined"; opponent_type: "human" | "ai"; created_by: string; white_player: string; black_player: string | null; fen: string; pgn: string; winner: string | null; created_at: string; updated_at: string };
type Props = { conversationId: string; userId: string; members: Member[]; conversationName: string; onClose: () => void };

const pieces: Record<string, string> = { wk:"♔", wq:"♕", wr:"♖", wb:"♗", wn:"♘", wp:"♙", bk:"♚", bq:"♛", br:"♜", bb:"♝", bn:"♞", bp:"♟︎" };
const initialFen = new Chess().fen();
const playerName = (members: Member[], id: string | null) => {
  if (!id) return "Tuffchat AI";
  const p = members.find(m => m.user_id === id)?.profiles;
  return p?.display_name || p?.username || "Player";
};

export default function ChatGames({ conversationId, userId, members, conversationName, onClose }: Props) {
  const [games, setGames] = useState<ChatGame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [opponentId, setOpponentId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{from: Square; to: Square} | null>(null);

  const opponents = members.filter(member => member.user_id !== userId);
  const selectedGame = selectedId ? games.find(game => game.id === selectedId) || null : null;

  async function refresh() {
    const { data, error: queryError } = await supabase.from("chat_games").select("*").eq("conversation_id", conversationId).order("updated_at", { ascending: false });
    if (queryError) setError(queryError.message);
    else setGames((data || []) as ChatGame[]);
    setLoading(false);
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    supabase.from("chat_games").select("*").eq("conversation_id", conversationId).order("updated_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!live) return;
        if (queryError) setError(queryError.message);
        else setGames((data || []) as ChatGame[]);
        setLoading(false);
      });
    const channel = supabase.channel("chat-games-" + conversationId)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_games", filter: "conversation_id=eq." + conversationId }, () => { if (live) void refresh(); })
      .subscribe();
    return () => { live = false; void supabase.removeChannel(channel); };
  }, [conversationId]);

  const chess = useMemo(() => {
    try { return new Chess(selectedGame?.fen || initialFen); }
    catch { return new Chess(); }
  }, [selectedGame?.fen]);
  const legalTargets = useMemo(() => selectedSquare ? chess.moves({ square: selectedSquare, verbose: true }).map(move => move.to) : [], [chess, selectedSquare]);
  const isPlayerTurn = !!selectedGame && chess.turn() === (selectedGame.white_player === userId ? "w" : "b") && (selectedGame.white_player === userId || selectedGame.black_player === userId);
  const isAiGame = selectedGame?.opponent_type === "ai";
  const isFinished = selectedGame?.status === "finished" || chess.isGameOver();
  const statusText = !selectedGame ? "" : selectedGame.status === "pending" ? "Waiting for the other player to accept" : selectedGame.status === "declined" ? "Challenge declined" : isFinished ? (chess.isCheckmate() ? "Checkmate" : "Game drawn") : aiThinking ? "Tuffchat AI is thinking…" : chess.isCheck() ? "Check — " + (chess.turn() === "w" ? "White" : "Black") + " to move" : (chess.turn() === "w" ? "White" : "Black") + " to move";

  async function createGame(mode: "ai" | "human") {
    if (mode === "human" && !opponentId) { setError("Choose someone to challenge."); return; }
    setCreating(true);
    setError("");
    const human = mode === "human";
    const userIsWhite = !human || Math.random() > 0.5;
    const { data, error: insertError } = await supabase.from("chat_games").insert({
      conversation_id: conversationId, game_type: "chess", status: human ? "pending" : "active",
      opponent_type: human ? "human" : "ai", created_by: userId,
      white_player: userIsWhite ? userId : opponentId,
      black_player: human ? (userIsWhite ? opponentId : userId) : null,
      fen: initialFen, pgn: ""
    }).select("*").single();
    if (insertError) { setError(insertError.message); setCreating(false); return; }
    const game = data as ChatGame;
    setGames(prev => [game, ...prev]);
    setSelectedId(game.id);
    setShowChallenge(false);
    setOpponentId("");
    if (human) {
      await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, content: "♟️ Chess challenge — open Games to accept", kind: "game" });
    } else {
      await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, content: "♟️ Started a chess game against Tuffchat AI", kind: "game" });
    }
    setCreating(false);
  }

  async function acceptChallenge(game: ChatGame) {
    setBusy(true); setError("");
    const { data, error: updateError } = await supabase.from("chat_games").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", game.id).eq("status", "pending").select("*").maybeSingle();
    if (updateError || !data) setError(updateError?.message || "This challenge has already changed.");
    else setGames(prev => prev.map(item => item.id === game.id ? data as ChatGame : item));
    setBusy(false);
  }

  async function saveMove(from: Square, to: Square, promote = "q", fromAi = false) {
    if (!selectedGame || busy || isFinished) return;
    const current = new Chess(selectedGame.fen);
    if (!fromAi && !isPlayerTurn) return;
    let move;
    try { move = current.move({ from, to, promotion: promote }); } catch { move = null; }
    if (!move) { setError("That move is not legal."); return; }
    const finished = current.isGameOver();
    const winner = current.isCheckmate() ? (current.turn() === "w" ? selectedGame.black_player : selectedGame.white_player) : null;
    setBusy(true); setError("");
    const { data, error: updateError } = await supabase.from("chat_games")
      .update({ fen: current.fen(), pgn: current.pgn(), status: finished ? "finished" : "active", winner, updated_at: new Date().toISOString() })
      .eq("id", selectedGame.id).eq("fen", selectedGame.fen).select("*").maybeSingle();
    setBusy(false);
    if (updateError || !data) { setError(updateError?.message || "The board changed on another device. Refreshing…"); await refresh(); return; }
    const saved = data as ChatGame;
    setGames(prev => prev.map(item => item.id === saved.id ? saved : item));
    setSelectedSquare(null); setPromotion(null);
    if (isAiGame && !finished && current.turn() === "b" && !fromAi) void requestAiMove(saved);
  }

  async function requestAiMove(game: ChatGame) {
    const position = new Chess(game.fen);
    const legal = position.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ""));
    if (!legal.length) return;
    setAiThinking(true); setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("tuffchat-ai", { body: {
      mode: "chess_move", fen: game.fen, legal_moves: legal, recent_moves: position.history().slice(-16)
    }});
    setAiThinking(false);
    if (invokeError || !data?.move) { setError(invokeError?.message || data?.error || "Tuffchat AI couldn't find a move. Try again."); return; }
    const uci = String(data.move);
    if (!legal.includes(uci)) { setError("Tuffchat AI returned an invalid move. Try again."); return; }
    const aiPosition = new Chess(game.fen);
    try { aiPosition.move({ from: uci.slice(0,2) as Square, to: uci.slice(2,4) as Square, promotion: uci[4] || "q" }); }
    catch { setError("Tuffchat AI suggested an illegal move. Try again."); return; }
    const finished = aiPosition.isGameOver();
    const winner = aiPosition.isCheckmate() ? (aiPosition.turn() === "w" ? game.black_player : game.white_player) : null;
    const { data: saved, error: saveError } = await supabase.from("chat_games")
      .update({ fen: aiPosition.fen(), pgn: aiPosition.pgn(), status: finished ? "finished" : "active", winner, updated_at: new Date().toISOString() })
      .eq("id", game.id).eq("fen", game.fen).select("*").maybeSingle();
    if (saveError || !saved) { setError(saveError?.message || "The board changed while AI was thinking. Refreshing…"); await refresh(); return; }
    setGames(prev => prev.map(item => item.id === game.id ? saved as ChatGame : item));
  }

  function chooseSquare(square: Square) {
    if (!selectedGame || selectedGame.status !== "active" || !isPlayerTurn || busy || aiThinking || isFinished) return;
    const piece = chess.get(square);
    if (selectedSquare) {
      const moves = chess.moves({ square: selectedSquare, verbose: true }).filter(move => move.to === square);
      if (moves.length) {
        if (moves.some(move => move.promotion)) { setPromotion({ from: selectedSquare, to: square }); return; }
        void saveMove(selectedSquare, square);
        return;
      }
    }
    if (piece && piece.color === chess.turn()) setSelectedSquare(square);
    else setSelectedSquare(null);
  }

  async function resign() {
    if (!selectedGame || !isPlayerTurn || isFinished) return;
    const winner = selectedGame.white_player === userId ? selectedGame.black_player : selectedGame.white_player;
    const { data, error: updateError } = await supabase.from("chat_games").update({ status: "finished", winner, updated_at: new Date().toISOString() }).eq("id", selectedGame.id).eq("fen", selectedGame.fen).select("*").maybeSingle();
    if (updateError || !data) setError(updateError?.message || "Couldn't resign this game.");
    else setGames(prev => prev.map(item => item.id === selectedGame.id ? data as ChatGame : item));
  }

  return <section className="chat-games">
    <div className="chat-games-top"><div className="chat-games-heading"><span className="chat-games-icon"><Gamepad2 size={19}/></span><div><b>Games</b><small>Play something together in {conversationName}</small></div></div><button className="chat-games-close" onClick={onClose} title="Close game panel"><X size={18}/></button></div>
    {!selectedGame || selectedGame.status === "declined" || (selectedGame.status === "finished" && !selectedId) ? <div className="chat-games-lobby">
      <div className="chat-games-hero"><span>♟</span><h3>Take a little break.</h3><p>Challenge a friend or play a match against Tuffchat AI.</p></div>
      <button className="chat-game-choice" disabled={creating} onClick={() => void createGame("ai")}><span className="game-choice-icon ai"><Bot size={21}/></span><span><b>Play against AI</b><small>Start a private chess match</small></span><Swords size={18}/></button>
      <button className="chat-game-choice" disabled={creating || !opponents.length} onClick={() => setShowChallenge(true)}><span className="game-choice-icon human"><Users size={21}/></span><span><b>Challenge a friend</b><small>{opponents.length ? "Invite someone in this chat" : "Add a friend to this conversation first"}</small></span><Swords size={18}/></button>
      {games.length > 0 && <div className="chat-games-previous"><b>Recent games</b>{games.map(game => <button key={game.id} onClick={() => setSelectedId(game.id)}><span>♟ Chess · {game.status}</span><small>{new Date(game.updated_at).toLocaleDateString()}</small></button>)}</div>}
    </div> : <div className="chat-chess">
      <div className="chat-chess-toolbar"><button onClick={() => setSelectedId(null)}><ArrowLeft size={16}/> All games</button><span>{selectedGame.opponent_type === "ai" ? "vs Tuffchat AI" : "vs " + playerName(members, selectedGame.white_player === userId ? selectedGame.black_player : selectedGame.white_player)}</span></div>
      {selectedGame.status === "pending" ? <div className="chat-game-pending"><span>♟</span><b>You've been challenged to chess</b><p>{playerName(members, selectedGame.created_by)} wants to play in {conversationName}.</p>{(selectedGame.white_player === userId || selectedGame.black_player === userId) && <button className="chat-game-primary" disabled={busy} onClick={() => void acceptChallenge(selectedGame)}><Check size={16}/> Accept challenge</button>}</div> : <>
        <div className="chat-chess-players"><span className={chess.turn()==="w"?"turn-active":""}>⚪ {playerName(members, selectedGame.white_player)}</span><span className={chess.turn()==="b"?"turn-active":""}>⚫ {playerName(members, selectedGame.black_player)}</span></div>
        <div className="chat-chess-board" role="group" aria-label="Chess board">
          {chess.board().map((row, rank) => row.map((piece, file) => {
            const square = ("abcdefgh"[file] + (8-rank)) as Square;
            const selected = selectedSquare === square;
            const target = legalTargets.includes(square);
            return <button key={square} type="button" className={`chat-chess-square ${(rank+file)%2===0?"light":"dark"} ${selected?"selected":""} ${target?"target":""} ${piece?"occupied":""}`} onClick={() => chooseSquare(square)} aria-label={square + (piece ? " " + piece.color + " " + piece.type : "")}>
              {piece && <span className={piece.color==="w"?"white-piece":"black-piece"}>{pieces[piece.color+piece.type]}</span>}
              {file===0 && <i>{8-rank}</i>}{rank===7 && <em>{"abcdefgh"[file]}</em>}
            </button>;
          }))}
        </div>
        {promotion && <div className="chat-promotion"><span>Promote pawn to</span>{(["q","r","b","n"] as const).map(type=><button key={type} onClick={()=>void saveMove(promotion.from,promotion.to,type)}>{pieces[(chess.turn()==="w"?"w":"b")+type]}</button>)}</div>}
        <div className="chat-chess-status">{aiThinking ? <><span className="chat-ai-pulse"/> Tuffchat AI is thinking…</> : statusText}</div>
        <div className="chat-chess-history"><b>Moves</b><span>{chess.history().length ? chess.history().map((move,index)=><i key={index}>{Math.floor(index/2)+1}{index%2===0?".":"…"} {move}</i>) : "The first move is yours."}</span></div>
        <div className="chat-chess-actions">{selectedGame.status==="active" && !isFinished && <button onClick={()=>void resign()} disabled={!isPlayerTurn || busy}>Resign</button>}{isFinished && <button onClick={()=>setSelectedId(null)}>Back to games</button>}</div>
      </>}
    </div>}
    {showChallenge && <div className="chat-game-modal-backdrop" onClick={() => setShowChallenge(false)}><div className="chat-game-modal" onClick={event => event.stopPropagation()}><div><b>Challenge a friend</b><button onClick={() => setShowChallenge(false)}><X size={17}/></button></div><p>Who do you want to play against?</p><select value={opponentId} onChange={event => setOpponentId(event.target.value)}><option value="">Choose a player…</option>{opponents.map(member=><option key={member.user_id} value={member.user_id}>{member.profiles?.display_name || member.profiles?.username || "Player"}</option>)}</select><button className="chat-game-primary" disabled={!opponentId || creating} onClick={() => void createGame("human")}>Send challenge</button></div></div>}
    {loading && <div className="chat-games-loading">Loading games…</div>}
    {error && <div className="chat-games-error">{error}</div>}
  </section>;
}
