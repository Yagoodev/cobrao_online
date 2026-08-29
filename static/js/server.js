(() => {
  const ws = new WebSocket('ws://localhost:8080/ws');
  ws.send("Oi");
  // ws.onopen = () => console.log('Conexão WebSocket estabelecida.');
  // ws.onclose   = e => console.log("fechou", e.code);
  // ws.onmessage = e => console.log("recebi:", e.data);
})()