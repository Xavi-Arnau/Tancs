import { Route, Routes } from "react-router-dom";
import GameView from "@/views/GameView";
import JoinGameView from "@/views/JoinGameView";
import LobbyView from "@/views/LobbyView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyView />} />
      <Route path="/join/:inviteToken" element={<JoinGameView />} />
      <Route path="/game/:gameId" element={<GameView />} />
    </Routes>
  );
}
