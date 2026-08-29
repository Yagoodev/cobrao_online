(() => {
  const ws = new WebSocket('ws://localhost:8080/ws');
  ws.onopen = () => {
    console.log('Conexão WebSocket estabelecida.')
    ws.send(JSON.stringify({ message: 'Olá, servidor!' }));
  };

  ws.onmessage = e => {
    console.log('Mensagem recebida do servidor:', e.data);
  }
})()