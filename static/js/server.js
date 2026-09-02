(() => {

  const GRID_SIZE = 21;
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");

  canvas.width = 420;
  canvas.height = 420;
  overlay.hidden = true;

  const cellSize = canvas.width / GRID_SIZE;

  function drawGame(game) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#4ADE80"

    for (const segment of game.snake.body) {
      ctx.fillRect(
        segment.x * cellSize,
        segment.y * cellSize,
        cellSize,
        cellSize
      )
    }
  }

  const ws = new WebSocket('ws://localhost:8080/ws');
  ws.onopen = () => {
    console.log('Conexão WebSocket estabelecida.')
  };

  ws.onmessage = e => {
    const game = JSON.parse(e.data);
    drawGame(game);
  }
})()