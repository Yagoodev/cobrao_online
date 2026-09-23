const overlay = document.getElementById("overlay");
const connection = document.getElementById("connection");

function setConnection(state, label) {
  connection.dataset.state = state;
  connection.querySelector("span").textContent = label;
}

async function start() {
  // Dynamic import keeps loading failures visible instead of leaving a blank page.
  const { createArena } = await import("./arena.js");
  const arena = createArena(document.getElementById("board"));
  overlay.hidden = true;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  ws.onopen = () => setConnection("online", "Conectado");
  ws.onclose = () => setConnection("offline", "Desconectado");
  ws.onerror = () => setConnection("offline", "Servidor indisponível");
  ws.onmessage = (event) => {
    try {
      const game = JSON.parse(event.data);
      if (Array.isArray(game.snake?.body)) arena.drawGame(game);
    } catch (error) {
      console.warn("Snapshot inválido:", error);
    }
  };

  const directions = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  window.addEventListener("keydown", (event) => {
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "direction", direction }));
    }
  });
  window.addEventListener("pagehide", () => { ws.close(); arena.dispose(); }, { once: true });
  window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
}

start().catch((error) => {
  console.error("Não foi possível iniciar a arena:", error);
  overlay.hidden = false;
  overlay.textContent = "Não foi possível abrir a arena. Recarregue a página.";
  setConnection("offline", "Arena indisponível");
});
