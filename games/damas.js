const storage = require("../storage")

function getKey(from) {
  return `damas:${from}`
}

// =========================
// TABULEIRO
// =========================
function createBoard() {
  const board = []

  for (let i = 0; i < 8; i++) {
    board[i] = []

    for (let j = 0; j < 8; j++) {
      const dark = (i + j) % 2 === 0

      if (!dark) {
        board[i][j] = "⬜"
      } else {
        if (i < 3) board[i][j] = "⚫"
        else if (i > 4) board[i][j] = "⚪"
        else board[i][j] = "⬛"
      }
    }
  }

  return board
}

function render(board) {
  let txt = "╔══════════════════════╗\n"
  txt += "     🎮 𝑫𝑨𝑴𝑨𝑺 🎮\n"
  txt += "╚══════════════════════╝\n\n"

  for (let i = 0; i < 8; i++) {
    txt += (8 - i) + " "
    for (let j = 0; j < 8; j++) {
      txt += board[i][j] + " "
    }
    txt += "\n"
  }

  txt += "\n  a  b  c  d  e  f  g  h"
  return txt
}

// =========================
// MENU  
// =========================
function menu() {
  return `╔══════════════════════╗
   🎮 𝑫𝑨𝑴𝑨𝑺  🎮
╚══════════════════════╝

🎲 COMANDOS:

🎮 !damas criar
→ cria uma mesa

👥 !damas entrar
→ entra na mesa

🚀 !damas iniciar
→ inicia partida
(solo = vs BOT 🤖)

♟ !damas mover a3 b4
→ move peça

👁 !damas
→ ver tabuleiro

📜 !damas menu
→ ver esse menu

━━━━━━━━━━━━━━━━━━━

🎯 REGRAS:

• captura é obrigatória
• peças viram 👑 ao chegar no fim
• múltiplas capturas possíveis
• quem eliminar tudo vence

━━━━━━━━━━━━━━━━━━━

🤖 MODO SOLO:
• bot agressivo
• prioriza capturas
• tenta combar jogadas

━━━━━━━━━━━━━━━━━━━

💀 DICA:
"quem não captura… perde"
`
}

// =========================
// PARSE
// =========================
function pos(str) {
  const cols = "abcdefgh"
  return {
    x: 8 - Number(str[1]),
    y: cols.indexOf(str[0])
  }
}

// =========================
// CHECK
// =========================
function isEnemy(piece, target) {
  return (
    (piece === "⚫" && (target === "⚪" || target === "👑")) ||
    (piece === "⚪" && (target === "⚫" || target === "👑"))
  )
}

function isKing(piece) {
  return piece === "👑"
}

// =========================
// MOVES
// =========================
function getDirections(piece) {
  if (piece === "⚫") return [[1,1],[1,-1]]
  if (piece === "⚪") return [[-1,1],[-1,-1]]
  return [[1,1],[1,-1],[-1,1],[-1,-1]] // dama
}

// =========================
// GERAR JOGADAS
// =========================
function getAllMoves(board, piece) {
  const moves = []

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (board[i][j] !== piece && !(isKing(board[i][j]) && piece === "⚪")) continue

      const dirs = getDirections(board[i][j])

      for (let [dx, dy] of dirs) {
        const x1 = i + dx
        const y1 = j + dy
        const x2 = i + dx * 2
        const y2 = j + dy * 2

        if (board[x1]?.[y1] === "⬛") {
          moves.push({ type: "move", from:[i,j], to:[x1,y1] })
        }

        if (board[x2]?.[y2] === "⬛" && isEnemy(board[i][j], board[x1]?.[y1])) {
          moves.push({ type:"capture", from:[i,j], to:[x2,y2], mid:[x1,y1] })
        }
      }
    }
  }

  return moves
}

// =========================
// APLICAR
// =========================
function applyMove(board, move) {
  const piece = board[move.from[0]][move.from[1]]

  board[move.to[0]][move.to[1]] = piece
  board[move.from[0]][move.from[1]] = "⬛"

  if (move.type === "capture") {
    board[move.mid[0]][move.mid[1]] = "⬛"
  }

  // virar dama
  if (piece === "⚫" && move.to[0] === 7) {
    board[move.to[0]][move.to[1]] = "👑"
  }
  if (piece === "⚪" && move.to[0] === 0) {
    board[move.to[0]][move.to[1]] = "👑"
  }
}

// =========================
// BOT
// =========================
function botPlay(board) {
  const moves = getAllMoves(board, "⚪")

  if (!moves.length) return null

  const captures = moves.filter(m => m.type === "capture")

  return captures.length
    ? captures[Math.floor(Math.random()*captures.length)]
    : moves[Math.floor(Math.random()*moves.length)]
}

// =========================
// WIN
// =========================
function checkWin(board) {
  let w = 0, b = 0

  for (let r of board) {
    for (let c of r) {
      if (c === "⚪" || c === "👑") w++
      if (c === "⚫") b++
    }
  }

  if (w === 0) return "⚫"
  if (b === 0) return "⚪"
  return null
}

// =========================
// HANDLER
// =========================
async function handleDamas(ctx) {
  const { sock, from, sender, args } = ctx
  const action = args[0]
  const key = getKey(from)

  let game = storage.getGameState(from, key)

  if (action === "menu") {
    return sock.sendMessage(from, { text: menu() })
  }

  if (action === "criar") {
    game = {
      players: [sender],
      board: createBoard(),
      turn: 0,
      started: false,
      vsBot: false
    }

    storage.setGameState(from, key, game)

    return sock.sendMessage(from, {
      text: "🎮 Mesa criada! !damas iniciar ou !damas entrar"
    })
  }

  if (action === "entrar") {
    if (!game || game.players.length >= 2) return

    game.players.push(sender)
    storage.setGameState(from, key, game)

    return sock.sendMessage(from, { text: "👥 Player entrou!" })
  }

  if (action === "iniciar") {
    if (!game) return

    if (game.players.length === 1) game.vsBot = true
    if (!game.vsBot && game.players.length < 2) {
      return sock.sendMessage(from, { text: "❌ Precisa de 2 players." })
    }

    game.started = true
    storage.setGameState(from, key, game)

    return sock.sendMessage(from, { text: render(game.board) })
  }

  if (action === "mover") {
    if (!game || !game.started) return

    const playerIndex = game.players.indexOf(sender)
    if (playerIndex !== game.turn) {
      return sock.sendMessage(from, { text: "⏳ Não é seu turno." })
    }

    const from = pos(args[1])
    const to = pos(args[2])

    const piece = playerIndex === 0 ? "⚫" : "⚪"

    const move = getAllMoves(game.board, piece).find(m =>
      m.from[0] === from.x &&
      m.from[1] === from.y &&
      m.to[0] === to.x &&
      m.to[1] === to.y
    )

    if (!move) {
      return sock.sendMessage(from, { text: "❌ Jogada inválida." })
    }

    applyMove(game.board, move)

    let win = checkWin(game.board)
    if (win) {
      storage.deleteGameState(from, key)
      return sock.sendMessage(from, {
        text: `🏆 ${win} venceu!\n\n${render(game.board)}`
      })
    }

    // BOT
    if (game.vsBot) {
      const botMove = botPlay(game.board)
      if (botMove) applyMove(game.board, botMove)

      return sock.sendMessage(from, {
        text: `🤖 BOT jogou!\n\n${render(game.board)}`
      })
    }

    game.turn = game.turn === 0 ? 1 : 0
    storage.setGameState(from, key, game)

    return sock.sendMessage(from, {
      text: render(game.board)
    })
  }

  if (game) {
    return sock.sendMessage(from, { text: render(game.board) })
  }
}

module.exports = handleDamas
