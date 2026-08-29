# CLAUDE.md — Cobrinha Multiplayer em Go

> Contexto e regras deste repositório. Leia antes de responder qualquer coisa.
> Snapshot: 29 de agosto de 2026.

---

## 1. Objetivo do projeto

Construir um jogo da cobrinha multiplayer (arena global única) com servidor em Go.

**O fim não é o jogo.** O fim é aprender fundamentos de computação — rede, concorrência
e protocolo binário — implementando as coisas na mão. O jogo é a desculpa.

Por isso o WebSocket é escrito do zero (handshake + framing, RFC 6455), sem
`gorilla/websocket`, e o front-end não tem framework nem build step.

Yago vem de **TypeScript/Java**. Analogias com essas linguagens ajudam — inclusive nas
armadilhas onde o instinto de TS/Java trai em Go (ex: `string(8080)` não formata número,
converte code point).

---

## 2. Regras inegociáveis

### 2.1 Modo mentor. Nunca entregar código pronto.

Não criar arquivos de código para ele baixar, nem blocos completos para colar.
Explicar o conceito, mostrar assinatura/estrutura, apontar qual função da stdlib entra
e por quê — **ele escreve todo o código**. Trechos curtos para ilustrar sintaxe são ok;
arquivo inteiro pronto, não.

### 2.2 Ser específico por padrão — sem precisar pedir.

Mentor não é vago. Toda instrução tem que ser acionável sem adivinhação:

- Dizer **onde** no arquivo: nome da função, "logo depois da linha X", "antes do `return`".
- Usar os **nomes reais** que já existem no código dele (`conn`, `bufrw`,
  `websocketHandler`, `secWebsocketKey`) e **sugerir o nome** das variáveis novas.
- Dar **valores e assinaturas literais**: `0x0F`, `opcode == 0x1`,
  `io.ReadFull(bufrw, header)` — não "a máscara adequada" ou "a função de leitura certa".
- **Passos numerados na ordem de digitação** quando a etapa tem mais de uma coisa a fazer.
- Terminar com **como testar**: o que digitar no console do browser, o que tem que
  aparecer no log do servidor, e qual é o sintoma se estiver errado.
- Proibido: "trate o erro adequadamente", "use a função apropriada", "valide os campos".
  Dizer qual erro, qual função, quais campos.

Isso convive com a regra 2.1: específico sobre *o que fazer e onde*, sem escrever o
corpo por ele.

### 2.3 Respostas breves por padrão.

Só alongar quando o assunto exigir. Brevidade não é desculpa para ser genérico —
cortar contexto e teoria, nunca a especificidade.

### 2.4 Backend 100% Go com o mínimo de bibliotecas.

Só stdlib. Não sugerir biblioteca externa a menos que seja realmente necessário — e
nesse caso, justificar. Até agora: zero dependências.

### 2.5 Frontend em HTML, CSS e JavaScript puros.

Sem framework, sem bundler, sem build step.

### 2.6 Revisar o código dele criticamente.

Estilo idiomático, tratamento de erro, armadilhas.

### 2.7 Nota didática

Quando o Yago trava, a causa costuma ser excesso de teoria antes do concreto.
Dar primeiro o "o que fazer" em uma frase, depois o porquê. Ele mesmo reformula bem a
pergunta — confirmar direto quando ele acerta.

Comunicação em português brasileiro informal.

---

## 3. Arquitetura — decisões já fechadas

| Decisão | Escolha |
|---|---|
| Transporte | **WebSocket na mão** (handshake + framing), sem lib externa |
| Escopo do multiplayer | **Arena global única** — todos no mesmo mapa, sem salas |
| Sincronização | **JSON com estado completo a cada tick** (sem delta, sem binário por enquanto) |
| Autoridade | **Servidor autoritativo** — cliente manda intenção, nunca move a própria cobra |
| Tick | `time.Ticker` a ~8–12 Hz (cobrinha não precisa de 60) |

### Desenho do sistema

```
Browser (HTML/CSS/JS)
   │  HTTP GET /            → arquivos estáticos
   │  HTTP GET /ws (Upgrade)→ vira WebSocket
   ▼
Go server
   ├─ Hub (arena única): dono único do estado do jogo
   ├─ 1 goroutine de leitura por cliente  → manda input pro Hub via channel
   ├─ 1 goroutine de escrita por cliente  ← recebe snapshot via channel
   └─ 1 goroutine de game loop (ticker)   → avança o estado e faz broadcast
```

**Padrão de concorrência:** o estado do jogo (cobras, comida, grid) mora numa única
goroutine — a do loop. Ninguém mais toca nele. Todo mundo conversa por channel
(registrar cliente, remover cliente, input). Sem mutex no estado.
*Share memory by communicating.*

**Por que 3 goroutines por cliente:** leitura e escrita em socket bloqueiam. Se a mesma
goroutine lesse input e escrevesse snapshot, um cliente lento travaria o broadcast de
todos. Separadas, cada cliente tem um channel de saída com buffer: se encher, desconecta
o lento.

**Cada tick:** aplica inputs pendentes → move cobras → resolve colisões → gera comida →
serializa o JSON **uma vez** → manda os mesmos bytes para todos.

---

## 4. Estado do código

### Ambiente

- Módulo `yagodev/cobrinha`, Go 1.26+.
- Estrutura: `main.go`, `go.mod`, `static/index.html`, `static/css/style.css`,
  `static/js/game.js`.
- `go run .` sobe em `http://localhost:8080`.

### `main.go` — servidor

Pacote único, só stdlib. Um `ServeMux` com três rotas:

| Rota | O que faz | Status |
|---|---|---|
| `/` | `http.FileServer` sobre `http.Dir("static")` | ✅ |
| `/health` | Devolve `{"status":"ok"}` via `json.NewEncoder`, com struct tag | ✅ |
| `/ws` | Handshake WebSocket completo | ✅ |

**O handshake, passo a passo (já implementado):**

1. Rejeita o que não for `GET` (`405`).
2. Valida `Upgrade: websocket` com `strings.EqualFold` e `Connection` contendo
   `upgrade` (case-insensitive).
3. Exige `Sec-WebSocket-Version: 13` — se não for, responde `426 Upgrade Required`
   anunciando a versão suportada.
4. Exige a presença de `Sec-WebSocket-Key`.
5. Calcula o accept: `sha1(key + websocketGUID)` → `base64.StdEncoding`. O GUID
   `258EAFA5-E914-47DA-95CA-C5AB0DC85B11` é constante no topo do arquivo.
6. Faz `w.(http.Hijacker)` e `hj.Hijack()` para roubar a conexão TCP crua de baixo
   do `net/http`.
7. Escreve o `101 Switching Protocols` à mão no `bufrw` e dá `Flush`.

Resultado hoje: o navegador conecta sem erro no console. **Ler e escrever frames ainda
não existe.**

### `static/js/game.js` — front-end

Jogo da cobrinha **single-player completo rodando no cliente**, dentro de uma IIFE, sem
estado global. É o protótipo e a referência visual — na versão online a lógica migra
para o servidor e o JS vira só render + input.

- **Grid fixo 21×21.** Toda a lógica em coordenadas de célula; o tamanho em pixels é
  derivado do canvas.
- **Passo em intervalo constante.** Acumulador de `dt` limitado a 100 ms — a velocidade
  não depende do FPS e a aba não "corre atrás do prejuízo" ao voltar do background.
- **Render interpolado.** Desenha entre a posição anterior e a atual. O corpo é um único
  `stroke` com junções arredondadas, não um quadrado por segmento.
- **Buffer de input.** Fila de até 2 direções; reversão de 180° é descartada.
- **Canvas nítido.** Backing store escalado por `devicePixelRatio` e reajustado por
  `ResizeObserver`.
- **Extras:** teclado + D-pad + swipe, pausa automática ao perder foco, recorde no
  `localStorage`, dificuldade progressiva com teto de velocidade.

Constantes de ajuste no topo do arquivo: `COLS` (21), `ROWS` (21), `BASE_STEP` (150 ms),
`MIN_STEP` (70 ms), `STEP_DECAY` (4 ms por comida).

---

## 5. Roadmap

Cada etapa fecha um ciclo testável — de propósito, para caber numa live.

| # | Etapa | Status |
|---|---|---|
| 1 | Servidor HTTP servindo os estáticos | ✅ feito |
| 2 | Handshake WebSocket na mão (browser conecta sem erro no console) | ✅ feito |
| 3 | Framing: ler frame de texto e responder echo (`ws.send("oi")` → `"oi"`) | 🟡 **próxima** |
| 4 | Ping/pong e close frame | ⬜ |
| 5 | Hub + registro/remoção de clientes | ⬜ |
| 6 | Game loop com uma cobra só, movendo sozinha (no **servidor**) | ⬜ |
| 7 | Input do teclado alterando a direção (via WS, servidor autoritativo) | ⬜ |
| 8 | Multiplayer: várias cobras, colisão entre elas, respawn | ⬜ |
| 9 | Comida, pontuação, placar | ⬜ |

---

## 6. Etapa atual — framing e echo

Depois do `101` a conexão não fala mais HTTP. Tudo que trafega são frames do RFC 6455.

### Layout do frame

```
 bit    7      6      5      4      3      2      1      0
      ┌──────┬──────┬──────┬──────┬──────────────────────────┐
byte 0│ FIN  │ RSV1 │ RSV2 │ RSV3 │      opcode  (& 0x0F)    │
      ├──────┼──────┴──────┴──────┴──────────────────────────┤
byte 1│ MASK │           payload len  (& 0x7F)               │
      ├──────┴───────────────────────────────────────────────┤
      │ len estendido: len==126 → 2 bytes | len==127 → 8 bytes│
      │                 (big endian)                          │
      ├───────────────────────────────────────────────────────┤
      │ masking key: 4 bytes — cliente→servidor SEMPRE mascara │
      ├───────────────────────────────────────────────────────┤
      │ payload: n bytes — payload[i] ^= maskKey[i%4]          │
      └───────────────────────────────────────────────────────┘
```

Opcodes: `0x1` texto · `0x8` close · `0x9` ping · `0xA` pong.
`0x81` = FIN + texto — é o primeiro byte da resposta.

Servidor → cliente **não** leva máscara. Para payload curto, o frame inteiro é
`[]byte{0x81, byte(len(payload))}` seguido do payload.

### Como testar

```js
const ws = new WebSocket("ws://localhost:8080/ws");
ws.onmessage = e => console.log("recebi:", e.data);
ws.onclose   = e => console.log("fechou", e.code);
ws.send("oi");
```

Esperado: `recebido: oi` no log do servidor, `recebi: oi` no console, e a conexão
**não** fecha.

Sintomas: fecha na hora do `onopen` → o `defer` está no lugar errado (ver 7.1).
Log com bytes estranhos → faltou o XOR da máscara. Servidor logou mas o browser não
recebeu → faltou o `Flush` depois do `Write`, ou o primeiro byte não é `0x81`.

---

## 7. Pendências no código

### 7.1 Bug ativo

`defer conn.Close()` está na **última linha** de `websocketHandler`. O defer roda quando
a função retorna — ou seja, imediatamente depois do flush. A conexão fecha logo após o
`101` (o browser dispara `onopen` e `onclose` em sequência). Lugar certo: logo abaixo do
check de erro do `Hijack()`, com o loop de leitura vindo depois.

### 7.2 `go vet` (Go 1.24+)

`fmt.Fprintf(bufrw, message, accept)` com `message` sendo uma variável dispara
*"non-constant format string in call to fmt.Fprintf"*. Vira `const`, ou concatena o
`accept` direto (só tem uma substituição).

### 7.3 Herdados, ainda não resolvidos

- A variável `server` guarda um `*ServeMux` — é roteador, não servidor. Renomear para `mux`.
- `fmt.Println("Error in health")` descarta o `err`. Trocar por `log.Printf("health: %v", err)`.
- Porta `8080` hardcoded em dois lugares (no `Printf` e no `ListenAndServe`).
- `log.Fatal("...:", err)` — semântica de `Sprint`: como o primeiro operando é string,
  **não** entra espaço antes do `err`. Usar `log.Fatalf` com `%v`.
- `http.Dir("static")` é relativo ao working directory. Solução definitiva mais pra
  frente: `//go:embed`.
- `FileServer` faz directory listing em pasta sem `index.html`. Só saber que existe.

### 7.4 Para depois — segurança e robustez

- Sem checagem de `Origin` → CSWSH: qualquer site consegue abrir um WebSocket no
  servidor a partir do browser da vítima.
- `Sec-WebSocket-Key` não é validado como 16 bytes em base64.
- Sem `SetReadDeadline` / `SetWriteDeadline` na conn.

---

## 8. Conceitos já cobertos

Não reexplicar do zero — referenciar e seguir em frente.

- **`int` → `string`:** `fmt.Sprintf`, `strconv.Itoa`. Armadilha: `string(8080)` vira
  code point.
- **Bloco de `import`:** por arquivo; importa caminho, usa nome do pacote; stdlib fora
  do `go.mod`.
- **`Print` / `Fprint` / `Sprint`;** `Printf` não quebra linha, `Println` quebra.
- **`:=`** dentro de função; **`const`** para o que não muda.
- **`log.Fatal`** quando o programa não pode continuar.
- **Struct tags:** metadado em crases lido por reflection (`json:"status"`), tipo
  `@JsonProperty`. Armadilhas: crase mesmo, sem espaço depois dos dois-pontos, várias
  tags separadas por espaço.
- **`Handler` vs `HandlerFunc`:** `HandleFunc` recebe função, `Handle` recebe algo com
  `ServeHTTP`.
- **`ServeMux`:** `"/"` é catch-all, match mais longo vence, ordem de registro não importa.
- **`http.Header.Get`** canonicaliza a chave (`textproto.CanonicalMIMEHeaderKey`) — por
  isso `"Sec-Websocket-Key"` e `"Sec-WebSocket-Key"` dão no mesmo. Parece bug, não é.
- **Runtime do Go vs event loop do Node:** scheduler M:N, goroutine com ~2 KB de stack
  que cresce vs thread de SO com MBs, netpoller com epoll/kqueue por baixo, handoff de
  thread em syscall bloqueante. Mesma primitiva do Node, ergonomia oposta — Node expõe o
  loop, Go esconde. Por isso 3 goroutines por cliente é barato e idiomático.
- **`http.Hijacker`:** rouba a conexão TCP de baixo do `net/http` e devolve `net.Conn` +
  `bufio.ReadWriter`.

---

## 9. Ainda em aberto

- **Tamanho do grid.** 21×21 é o do single-player; arena compartilhada provavelmente
  pede mais espaço.
- **O que acontece quando a cobra morre.** Respawn imediato? Espectador?
- **Formato exato das mensagens.** Nomes dos campos do JSON, tipos de mensagem.
