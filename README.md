# Cobrinha

## Arena 3D

O visual atual é uma clareira flutuante em Three.js, com câmera ortográfica,
muros de pedra, escadaria e vegetação procedural. A arena fica centralizada e
se ajusta ao tamanho da janela, mantendo espaço ao redor.

- `static/js/arena.js`: cenário, iluminação, enquadramento e desenho dos snapshots.
- `static/js/server.js`: conexão WebSocket e envio das setas do teclado.
- `static/css/style.css`: layout e identidade visual responsivos.
- `static/vendor/three/`: Three.js 0.180.0 local, com licença MIT; sem instalação npm ou build.

Execute `go run .` e abra `http://localhost:8080`. Requer navegador com WebGL 2.
A vegetação e os muros são decorativos: o grid continua 21×21 e as regras do
servidor permanecem iguais, incluindo atravessar as bordas. A interface mostra
o estado real da conexão; se o servidor desconectar, o cenário permanece visível.

O renderer desenha quando recebe snapshots ou quando a janela muda de tamanho,
sem um loop contínuo de animação. A ilha mantém a mesma composição a cada recarga.

As seções abaixo também documentam o protótipo anterior.

Jogo da cobrinha rodando em `<canvas>`, servido por um servidor HTTP escrito em Go
sem dependências externas (apenas a biblioteca padrão).

O front-end é HTML, CSS e JavaScript puro — sem build, sem bundler, sem framework.

## Rodando

Requer Go 1.26+.

```bash
go run .
```

O servidor sobe em `http://localhost:8080`. Abra essa URL no navegador e o jogo
já está pronto para começar.

## Como jogar

| Ação | Teclado | Toque |
| --- | --- | --- |
| Mover | `↑` `←` `↓` `→` ou `W` `A` `S` `D` | D-pad na tela ou swipe no tabuleiro |
| Pausar / retomar | `Espaço` | Botão do overlay |
| Reiniciar | `R` | Botão do overlay |

- A cobrinha morre ao bater nas paredes ou no próprio corpo.
- Cada comida aumenta o corpo em um segmento e deixa o jogo um pouco mais rápido,
  até um limite de velocidade.
- O recorde fica salvo no `localStorage` do navegador.
- O jogo pausa sozinho quando a aba perde o foco.

## Estrutura

```
.
├── main.go              servidor HTTP: arquivos estáticos, /health e /ws
├── go.mod
└── static/
    ├── index.html       marcação da página e do HUD
    ├── css/style.css    tema, layout responsivo e controles de toque
    └── js/game.js       o jogo: estado, loop, input e render no canvas
```

### Servidor

| Rota | Descrição |
| --- | --- |
| `/` | Serve o conteúdo de `static/` |
| `/health` | Retorna `{"status":"ok"}` |
| `/ws` | Handshake de WebSocket (RFC 6455) feito na mão, via `http.Hijacker` |

O handler de `/ws` hoje valida os cabeçalhos, responde o `101 Switching Protocols`
com o `Sec-WebSocket-Accept` correto e encerra a conexão. A leitura e a escrita de
frames ainda não estão implementadas — é a base para a versão multiplayer.

### Front-end

O jogo vive inteiro em `static/js/game.js`, dentro de uma IIFE, sem estado global:

- **Grid fixo de 21×21.** Toda a lógica trabalha em coordenadas de célula; o
  tamanho em pixels é derivado do tamanho do canvas.
- **Passo em intervalo constante.** O loop acumula o tempo decorrido e executa um
  passo lógico a cada `step` milissegundos, então a velocidade não depende do FPS.
  O `dt` é limitado a 100 ms para a aba não "correr atrás do prejuízo" depois de
  ficar em segundo plano.
- **Render interpolado.** Cada quadro desenha a cobra entre a posição anterior e a
  atual, o que dá movimento suave mesmo com o passo lógico lento. O corpo é um
  único `stroke` com junções arredondadas, em vez de um quadrado por segmento.
- **Buffer de input.** Até duas direções ficam na fila, e reversões de 180° são
  descartadas — assim curvas rápidas em sequência não matam a cobra.
- **Canvas nítido.** O backing store é dimensionado por `devicePixelRatio` e
  reajustado por um `ResizeObserver`, que pega mudanças de layout e não só o
  `resize` da janela.

Para mudar o tamanho do tabuleiro ou a dificuldade, ajuste as constantes no topo
de `static/js/game.js`:

```js
const COLS = 21;         // colunas do grid
const ROWS = 21;         // linhas do grid
const BASE_STEP = 150;   // ms por passo no início
const MIN_STEP = 70;     // passo mais rápido possível
const STEP_DECAY = 4;    // ms a menos por comida
```

## Progresso da versão online

- [x] Leitura e escrita de frames curtos de WebSocket em `main.go`.
- [x] Movimento no servidor e envio de snapshots para renderização no navegador.
- [x] Setas do teclado enviando direção via WebSocket, com teste manual confirmado.
- [x] Hub global com registro/remoção de clientes e channel de broadcast.
- [ ] Mover o game loop para uma única instância compartilhada — próximo passo.
- [ ] Multiplayer: várias cobras na mesma arena, colisões e respawn.
- [ ] Comida, pontuação e placar compartilhado.

Atualizado em 10 de setembro de 2026. O cliente atual é `static/js/server.js`.
O Hub já acompanha conexões e sabe distribuir um snapshot por `broadcast`, mas cada
conexão ainda inicia seu próprio `runGameLoop`, que envia diretamente para a fila do
cliente. O próximo passo é manter apenas um game loop global e encaminhar seus
snapshots pelo Hub. As descrições do protótipo single-player acima são históricas:
pausa, reinício, comida e colisões ainda não foram migrados.
