const storage = require("../storage")

// =========================
// KEY
// =========================
function getGameKey(from) {
  return `damas:${from}`
}

// =========================
// MENU
// =========================
function buildMenu() {
  return `╔══════════════════════════╗
        🎮 𝑫𝑨𝑴𝑨𝑺  🎮
╚══════════════════════════╝

🎲 COMANDOS:

🎮 !damas criar
👥 !damas entrar
🤖 !damas pve
🚀 !damas iniciar
♟ !damas mover a3 b4
👁 !damas tabuleiro
📜 !damas menu

━━━━━━━━━━━━━━━━━━━━━━

🎯 OBJETIVO:
Eliminar todas as peças inimigas (quem n sabe disso é burro pra krlh)

━━━━━━━━━━━━━━━━━━━━━━

⚔️ REGRAS:

❗ Captura obrigatória
🔥 Possibilidade de múltiplas capturas
👑 Promoção para rei
👑 Reis andam livre

━━━━━━━━━━━━━━━━━━━━━━

🎨 PEÇAS:

⚫ Quem criou a sala (ou seja, você)
⚪ Oponente/BOT
♛ Rei (preto)
♕ Rei (branco)

━━━━━━━━━━━━━━━━━━━━━━

💡 DICA:

"quem não captura… perde."
`
}

// =========================
// BOARD
// =========================
function createBoard() {
  const b = []
  for (let i = 0; i < 8; i++) {
    b[i] = []
    for (let j = 0; j < 8; j++) {
      const dark = (i + j) % 2 === 0

      if (!dark) b[i][j] = "⬜"
      else if (i < 3) b[i][j] = "⚫"
      else if (i > 4) b[i][j] = "⚪"
      else b[i][j] = "⬛"
    }
  }
  return b
}

// =========================
// RENDER
// =========================
function renderBoard(board) {
  let t = "╔══════════════════╗\n"
  t += "   🎮 DAMAS\n"
  t += "╚══════════════════╝\n\n"

  for (let i = 0; i < 8; i++) {
    t += (8 - i) + " "
    for (let j = 0; j < 8; j++) {
      t += board[i][j] + " "
    }
    t += "\n"
  }

  t += "\n  a b c d e f g h"
  return t
}

// =========================
// HUD
// =========================
function hud(game, sender) {
  if (!game.started) return "⌛ Jogo não iniciado"

  if (game.vsBot) {
    return game.turn === 0 ? "🎯 Sua vez" : "🤖 Bot pensando..."
  }

  return sender === game.players[game.turn]
    ? "🎯 Sua vez"
    : "⏳ Aguarde o oponente"
}

// =========================
// PARSE
// =========================
function parsePos(str) {
  if (!str || str.length < 2) return null
  const cols = "abcdefgh"
  const x = 8 - Number(str[1])
  const y = cols.indexOf(str[0])
  if (x < 0 || x > 7 || y < 0 || y > 7) return null
  return { x, y }
}

// =========================
// HELPERS
// =========================
function isEnemy(p, t) {
  return (
    (p === "⚫" || p === "♛") && (t === "⚪" || t === "♕") ||
    (p === "⚪" || p === "♕") && (t === "⚫" || t === "♛")
  )
}

function dirs(p) {
  if (p === "⚫") return [[1,1],[1,-1]]
  if (p === "⚪") return [[-1,1],[-1,-1]]
  return [[1,1],[1,-1],[-1,1],[-1,-1]]
}

// =========================
// CAPTURE EM CADEIA
// =========================
function getCaptures(board, x, y, piece, path = [], visited = []) {
  let moves = []
  let found = false

  for (let [dx, dy] of dirs(piece)) {
    const x1 = x + dx
    const y1 = y + dy
    const x2 = x + dx * 2
    const y2 = y + dy * 2

    if (
      board[x2]?.[y2] === "⬛" &&
      isEnemy(piece, board[x1]?.[y1]) &&
      !visited.some(v => v[0] === x1 && v[1] === y1)
    ) {
      found = true

      const clone = JSON.parse(JSON.stringify(board))
      clone[x][y] = "⬛"
      clone[x1][y1] = "⬛"
      clone[x2][y2] = piece

      const deeper = getCaptures(
        clone,
        x2,
        y2,
        piece,
        [...path, { from:[x,y], to:[x2,y2], mid:[x1,y1] }],
        [...visited, [x1,y1]]
      )

      if (deeper.length) moves.push(...deeper)
      else moves.push([...path, { from:[x,y], to:[x2,y2], mid:[x1,y1] }])
    }
  }

  return found ? moves : []
}

// =========================
// MOVES
// =========================
function getMoves(board, side) {
  let all = []
  let captures = []

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const p = board[i][j]

      if (side === "⚫" && p !== "⚫" && p !== "♛") continue
      if (side === "⚪" && p !== "⚪" && p !== "♕") continue

      const caps = getCaptures(board, i, j, p)

      if (caps.length) captures.push(...caps)
      else {
        for (let [dx, dy] of dirs(p)) {
          const x1 = i + dx
          const y1 = j + dy
          if (board[x1]?.[y1] === "⬛") {
            all.push([{ from:[i,j], to:[x1,y1] }])
          }
        }
      }
    }
  }

  return captures.length ? captures : all
}

// =========================
// APPLY
// =========================
function applySeq(board, seq) {
  for (let m of seq) {
    const p = board[m.from[0]][m.from[1]]
    board[m.from[0]][m.from[1]] = "⬛"
    board[m.to[0]][m.to[1]] = p
    if (m.mid) board[m.mid[0]][m.mid[1]] = "⬛"
  }

  const last = seq[seq.length - 1]
  const p = board[last.to[0]][last.to[1]]

  if (p === "⚫" && last.to[0] === 7) board[last.to[0]][last.to[1]] = "♛"
  if (p === "⚪" && last.to[0] === 0) board[last.to[0]][last.to[1]] = "♕"
}

// =========================
// AI (MINIMAX)
// =========================
function evaluate(board) {
  let score = 0

  for (let r of board) {
    for (let c of r) {
      if (c === "⚪") score += 3
      if (c === "♕") score += 6
      if (c === "⚫") score -= 3
      if (c === "♛") score -= 6
    }
  }

  return score
}

function minimax(board, depth, max) {
  if (depth === 0) return evaluate(board)

  const side = max ? "⚪" : "⚫"
  const moves = getMoves(board, side)

  if (!moves.length) return evaluate(board)

  if (max) {
    let best = -Infinity
    for (let m of moves) {
      const b = JSON.parse(JSON.stringify(board))
      applySeq(b, m)
      best = Math.max(best, minimax(b, depth - 1, false))
    }
    return best
  } else {
    let best = Infinity
    for (let m of moves) {
      const b = JSON.parse(JSON.stringify(board))
      applySeq(b, m)
      best = Math.min(best, minimax(b, depth - 1, true))
    }
    return best
  }
}

function botMove(board) {
  const moves = getMoves(board, "⚪")
  let best = null
  let score = -Infinity

  for (let m of moves) {
    const b = JSON.parse(JSON.stringify(board))
    applySeq(b, m)
    const val = minimax(b, 3, false)

    if (val > score) {
      score = val
      best = m
    }
  }

  return best
}

// =========================
// WIN
// =========================
function checkWin(board) {
  let w = 0, b = 0

  for (let r of board) {
    for (let c of r) {
      if (c === "⚪" || c === "♕") w++
      if (c === "⚫" || c === "♛") b++
    }
  }

  if (w === 0) return "⚫"
  if (b === 0) return "⚪"
  return null
}

// =========================
// HANDLER
// =========================
async function handleDamasGame(ctx) {
  const { sock, from, sender, args } = ctx
  const action = args[0]

  const key = getGameKey(from)
  let game = storage.getGameState(from, key)

  if (action === "menu") {
    return sock.sendMessage(from, { text: buildMenu() })
  }

  if (action === "pve") {
    const g = {
      players: [sender],
      board: createBoard(),
      turn: 0,
      started: true,
      vsBot: true
    }
    storage.setGameState(from, key, g)

    return sock.sendMessage(from, {
      text: `🤖 PVE iniciado\n\n🎯 Sua vez\n\n${renderBoard(g.board)}`
    })
  }

  if (action === "tabuleiro") {
    if (!game) return false

    return sock.sendMessage(from, {
      text: `${hud(game, sender)}\n\n${renderBoard(game.board)}\n\n❗ Captura obrigatória`
    })
  }

  if (action === "criar") {
    if (game) return sock.sendMessage(from, { text: "⚠️ Já existe jogo." })

    const g = {
      players: [sender],
      board: createBoard(),
      turn: 0,
      started: false,
      vsBot: false
    }

    storage.setGameState(from, key, g)

    return sock.sendMessage(from, { text: "🎮 Jogo criado!" })
  }

  if (action === "entrar") {
    if (!game) return false
    if (game.players.length >= 2) return sock.sendMessage(from, { text: "⚠️ Jogo cheio." })

    game.players.push(sender)
    storage.setGameState(from, key, game)

    return sock.sendMessage(from, { text: "👥 Jogador entrou!" })
  }

  if (action === "iniciar") {
    if (!game) return false
    if (game.players.length < 2 && !game.vsBot) {
      return sock.sendMessage(from, { text: "⚠️ Precisa de 2 jogadores." })
    }

    game.started = true
    storage.setGameState(from, key, game)

    return sock.sendMessage(from, {
      text: `${hud(game, sender)}\n\n${renderBoard(game.board)}`
    })
  }

  if (action === "mover") {
    if (!game || !game.started) return false

    if (!args[1] || !args[2]) {
      return sock.sendMessage(from, { text: "❌ Use: !damas mover a3 b4" })
    }

    const fromPos = parsePos(args[1])
    const toPos = parsePos(args[2])
    if (!fromPos || !toPos) return false

    const moves = getMoves(game.board, game.turn === 0 ? "⚫" : "⚪")

    const chosen = moves.find(seq =>
      seq[0].from[0] === fromPos.x &&
      seq[0].from[1] === fromPos.y &&
      seq[seq.length - 1].to[0] === toPos.x &&
      seq[seq.length - 1].to[1] === toPos.y
    )

    if (!chosen) {
      return sock.sendMessage(from, {
        text: "❌ Jogada inválida.\n❗ Captura obrigatória."
      })
    }

    applySeq(game.board, chosen)

    let win = checkWin(game.board)
    if (win) {
      storage.deleteGameState(from, key)
      return sock.sendMessage(from, {
        text: `🏆 Vitória de ${win}\n\n${renderBoard(game.board)}`
      })
    }

    game.turn = game.turn ? 0 : 1
    storage.setGameState(from, key, game)

    if (game.vsBot && game.turn === 1) {
      const move = botMove(game.board)
      if (move) applySeq(game.board, move)

      win = checkWin(game.board)
      if (win) {
        storage.deleteGameState(from, key)
        return sock.sendMessage(from, {
          text: `🏆 Vitória de ${win}\n\n${renderBoard(game.board)}`
        })
      }

      game.turn = 0
      storage.setGameState(from, key, game)

      return sock.sendMessage(from, {
        text: `🤖 Bot jogou\n\n🎯 Sua vez\n\n${renderBoard(game.board)}`
      })
    }

    return sock.sendMessage(from, {
      text: `${hud(game, sender)}\n\n${renderBoard(game.board)}`
    })
  }

  return false
}

module.exports = { handleDamasGame }
