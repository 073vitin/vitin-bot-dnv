const storage = require("../storage");
const economyService = require("../services/economyService");
const { normalizeMentionArray } = require("../services/mentionService");

const APOSTA_BASE = 25;
const TURN_TIMEOUT = 30000;

function getKey(from) {
  return `blackjack:lobby:${from}`;
}

// =========================
// DEALER PERSONALIDADE
// =========================
const dealerLines = {
  normal: {
    start: [
      "🎩 *Dealer:* Façam suas apostas...",
      "🎩 *Dealer:* Hoje alguém vai sair rico.",
      "🎩 *Dealer:* Vamos ver quem sabe jogar.",
      "🎩 *Dealer:* Sem piedade na mesa.",
      "🎩 *Dealer:* A casa está aberta."
    ],
    win: [
      "🎩 *Dealer:* Hm... sorte de iniciante.",
      "🎩 *Dealer:* Nada mal.",
      "🎩 *Dealer:* Jogada aceitável.",
      "🎩 *Dealer:* Você escapou dessa.",
      "🎩 *Dealer:* Interessante..."
    ],
    lose: [
      "🎩 *Dealer:* A casa agradece kkkkkkkkkk",
      "🎩 *Dealer:* Volte com mais dinheiro.",
      "🎩 *Dealer:* Previsível.",
      "🎩 *Dealer:* Já vi piores.",
      "🎩 *Dealer:* Isso foi fácil."
    ],
    bust: [
      "🎩 *Dealer:* Estourou... patético.",
      "🎩 *Dealer:* 21 não é pra qualquer um.",
      "🎩 *Dealer:* Exagerou.",
      "🎩 *Dealer:* Controle é tudo.",
      "🎩 *Dealer:* Você se destruiu sozinho."
    ]
  },

  pobreza: {
    start: [
      "🪙 *Dealer:* Mesa dos quebrados aberta.",
      "🪙 *Dealer:* Sem dinheiro? Joga assim mesmo.",
      "🪙 *Dealer:* Aqui ninguém tem nada a perder... literalmente.",
      "🪙 *Dealer:* Apostando vento hoje?",
      "🪙 *Dealer:* Vamos brincar de rico sem ser."
    ],
    win: [
      "🪙 *Dealer:* Parabéns... não ganhou nada.",
      "🪙 *Dealer:* Vitória simbólica 😂",
      "🪙 *Dealer:* Orgulho não paga conta.",
      "🪙 *Dealer:* Ganhou... emocionalmente.",
      "🪙 *Dealer:* Quer um troféu imaginário?"
    ],
    lose: [
      "🪙 *Dealer:* Perdeu o quê? Não tinha nada.",
      "🪙 *Dealer:* Quebrou mais? impossível.",
      "🪙 *Dealer:* Nem isso você conseguiu.",
      "🪙 *Dealer:* Triste até sem aposta.",
      "🪙 *Dealer:* Derrota gratuita."
    ],
    bust: [
      "🪙 *Dealer:* Estourou... impressionante.",
      "🪙 *Dealer:* Nem sem dinheiro você acerta.",
      "🪙 *Dealer:* Talento raro... pra perder.",
      "🪙 *Dealer:* Isso aqui é dom.",
      "🪙 *Dealer:* Incrível como piora."
    ]
  }
};

function line(mode, type) {
  const arr = dealerLines[mode][type];
  return arr[Math.floor(Math.random() * arr.length)];
}

// =========================
// CARTAS
// =========================
function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  let deck = [];

  for (let s of suits) {
    for (let r of ranks) {
      deck.push({ suit: s, rank: r });
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

function card(deck) {
  return deck.pop();
}

function handValue(hand) {
  let value = 0;
  let aces = 0;

  for (let c of hand) {
    if (["J","Q","K"].includes(c.rank)) value += 10;
    else if (c.rank === "A") {
      value += 11;
      aces++;
    } else value += Number(c.rank);
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

function formatHand(hand) {
  return hand.map(c => `${c.rank}${c.suit}`).join(" ");
}

function dealerHidden(hand) {
  return `🂠 ${hand.slice(1).map(c => `${c.rank}${c.suit}`).join(" ")}`;
}

// =========================
// MESA
// =========================
function renderTable(lobby) {
  let msg =
`╔══════════════════════╗
   🎰 BLACKJACK 🎰
╚══════════════════════╝

🎩 Dealer
${dealerHidden(lobby.dealer)}

━━━━━━━━━━━━━━━━━━━

`;

  for (let p of lobby.players) {
    const hand = lobby.playerHands[p] || [];
    const val = handValue(hand);

    let status = "";
    if (val > 21) status = " 💀";
    else if (val === 21 && hand.length === 2) status = " 🃏 BJ";
    else if (lobby.stood?.[p]) status = " 🛑";

    msg +=
`👤 @${p}
🃏 ${formatHand(hand)}
📊 ${val}${status}

`;
  }

  return msg;
}

// =========================
// FINAL
// =========================
async function finalize(ctx, lobby, key) {
  const mode = lobby.mode;

  await ctx.sock.sendMessage(ctx.from, {
    text: "🎩 *Dealer:* Revelando..."
  });

  while (handValue(lobby.dealer) < 17) {
    lobby.dealer.push(card(lobby.deck));
  }

  const dealerVal = handValue(lobby.dealer);

  let msg =
`🎰 RESULTADO FINAL

🎩 Dealer
🃏 ${formatHand(lobby.dealer)}
📊 ${dealerVal}

━━━━━━━━━━━━━━━━━━━

`;

  const mentions = [];

  for (let p of lobby.players) {
    const jid = `${p}@s.whatsapp.net`;
    mentions.push(jid);

    const hand = lobby.playerHands[p];
    const val = handValue(hand);
    const bet = lobby.bets[p] || 0;

    if (val > 21) {
      msg += `💀 @${p}\n${line(mode,"bust")}\n\n`;
    } else if (dealerVal > 21 || val > dealerVal) {
      if (mode === "normal") {
        let win = bet * 2;
        if (val === 21 && hand.length === 2) win = Math.floor(bet * 2.5);
        economyService.creditCoins(p, win);
        msg += `🔥 @${p} +${win}\n${line(mode,"win")}\n\n`;
      } else {
        msg += `🔥 @${p}\n${line(mode,"win")}\n\n`;
      }
    } else if (val === dealerVal) {
      if (mode === "normal") economyService.creditCoins(p, bet);
      msg += `🤝 @${p} empate\n\n`;
    } else {
      msg += `❌ @${p}\n${line(mode,"lose")}\n\n`;
    }
  }

  await ctx.sock.sendMessage(ctx.from, {
    text: msg,
    mentions: normalizeMentionArray(mentions)
  });

  storage.setGameState(ctx.from, key, null);
}

// =========================
// TURNO
// =========================
async function nextTurn(ctx, lobby, key) {
  clearTimeout(lobby.timeout);

  lobby.turnIndex++;

  if (lobby.turnIndex >= lobby.players.length) {
    return finalize(ctx, lobby, key);
  }

  const current = lobby.players[lobby.turnIndex];

  await ctx.sock.sendMessage(ctx.from, {
    text:
`${renderTable(lobby)}

🎯 Turno de @${current}

• pedir
• manter
• dobrar`,
    mentions: normalizeMentionArray([`${current}@s.whatsapp.net`])
  });

  lobby.timeout = setTimeout(() => {
    lobby.stood[current] = true;
    nextTurn(ctx, lobby, key);
  }, TURN_TIMEOUT);

  storage.setGameState(ctx.from, key, lobby);
}

// =========================
// MAIN
// =========================
module.exports = async function blackjack(ctx) {
  const { sock, from, sender, args } = ctx;

  const action = (args[0] || "").toLowerCase();
  const key = getKey(from);
  let lobby = storage.getGameState(from, key);

  const player = sender.split("@")[0];

  // =========================
  // CRIAR NORMAL
  // =========================
  if (action === "criar") {
    lobby = {
      players: [],
      bets: {},
      playerHands: {},
      deck: createDeck(),
      dealer: [],
      started: false,
      turnIndex: -1,
      stood: {},
      mode: "normal"
    };

    storage.setGameState(from, key, lobby);

    await sock.sendMessage(from, { text: line("normal","start") });
    return true;
  }

  // =========================
  // CRIAR POBREZA
  // =========================
  if (action === "pobreza") {
    lobby = {
      players: [],
      bets: {},
      playerHands: {},
      deck: createDeck(),
      dealer: [],
      started: false,
      turnIndex: -1,
      stood: {},
      mode: "pobreza"
    };

    storage.setGameState(from, key, lobby);

    await sock.sendMessage(from, { text: line("pobreza","start") });
    return true;
  }

  // =========================
  // ENTRAR
  // =========================
  if (action === "entrar") {
    if (!lobby) return;

    if (lobby.players.includes(player)) return;

    if (lobby.mode === "normal") {
      const profile = economyService.getProfile(sender);

      if (profile.coins < APOSTA_BASE) {
        await sock.sendMessage(from, { text: "❌ Sem saldo." });
        return true;
      }

      economyService.debitCoins(sender, APOSTA_BASE);
      lobby.bets[player] = APOSTA_BASE;
    }

    lobby.players.push(player);

    storage.setGameState(from, key, lobby);

    await sock.sendMessage(from, {
      text: `✅ @${player} entrou`,
      mentions: normalizeMentionArray([sender])
    });

    return true;
  }

  // =========================
  // COMEÇAR
  // =========================
  if (action === "começar") {
    if (!lobby || lobby.started) return;

    lobby.started = true;

    for (let p of lobby.players) {
      lobby.playerHands[p] = [card(lobby.deck), card(lobby.deck)];
    }

    lobby.dealer = [card(lobby.deck), card(lobby.deck)];

    storage.setGameState(from, key, lobby);

    return nextTurn(ctx, lobby, key);
  }

  // =========================
  // AÇÕES
  // =========================
  if (!lobby || !lobby.started) return;

  const current = lobby.players[lobby.turnIndex];
  if (current !== player) return;

  clearTimeout(lobby.timeout);

  if (action === "pedir") {
    const c = card(lobby.deck);
    lobby.playerHands[player].push(c);

    const val = handValue(lobby.playerHands[player]);

    await sock.sendMessage(from, {
      text: `🃏 @${player} puxou ${c.rank}${c.suit} (${val})`,
      mentions: normalizeMentionArray([sender])
    });

    if (val > 21) return nextTurn(ctx, lobby, key);
  }

  if (action === "manter") {
    lobby.stood[player] = true;
    return nextTurn(ctx, lobby, key);
  }

  if (action === "dobrar" && lobby.mode === "normal") {
    const bet = lobby.bets[player];
    const profile = economyService.getProfile(sender);

    if (profile.coins < bet) {
      await sock.sendMessage(from, { text: "❌ Sem saldo" });
      return true;
    }

    economyService.debitCoins(sender, bet);
    lobby.bets[player] *= 2;

    const c = card(lobby.deck);
    lobby.playerHands[player].push(c);

    lobby.stood[player] = true;

    await sock.sendMessage(from, {
      text: `💥 @${player} DOBROU e puxou ${c.rank}${c.suit}`,
      mentions: normalizeMentionArray([sender])
    });

    return nextTurn(ctx, lobby, key);
  }

  storage.setGameState(from, key, lobby);
};
