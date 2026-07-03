/**
 * EMBARALHADO (Palavra Embaralhada)
 * O bot mostra uma palavra embaralhada. Quem desembaralhar primeiro vence.
 * O vencedor pode punir quem escolher.
 * Disparado por threshold de mensagens ou por comando.
 */

const { formatMentionTag } = require("../services/mentionService")
const gameManager = require("../gameManager")

const words = [
  "CACHORRO",
  "GATO",
  "PROGRAMADOR",
  "COMPUTADOR",
  "TELEFONE",
  "INTERNET",
  "MENSAGEM",
  "DIVERSÃO",
  "AMIGO",
  "FAMÍLIA",
  "TRABALHO",
  "ESCOLA",
  "CARRO",
  "MOTO",
  "BICICLETA",
  "LIVRO",
  "FILME",
  "MÚSICA",
  "DANÇA",
  "ESPORTE",
]

function getLevenshteinDistance(a, b) {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function shuffleWord(word) {
  let scrambled = word;
  let attempts = 0;
  const targetDistance = Math.min(3, word.length);
  while (attempts < 100) {
    const candidate = gameManager.shuffle(word.split("")).join("");
    if (getLevenshteinDistance(word, candidate) >= targetDistance) {
      scrambled = candidate;
      break;
    }
    attempts++;
  }
  if (scrambled === word && word.length > 1) {
    const arr = word.split("");
    const last = arr.pop();
    arr.unshift(last);
    scrambled = arr.join("");
  }
  return scrambled;
}

module.exports = {
  // Inicia embaralhado
  start: (groupId, triggeredBy = null) => {
    const word = gameManager.pickRandom(words)
    const state = {
      groupId,
      word,
      scrambled: shuffleWord(word),
      winner: null,
      createdAt: Date.now(),
      triggeredBy,
    }
    return state
  },

  // Verifica se a resposta está correta
  checkAnswer: (state, playerId, answer) => {
    const normalized = (answer || "").trim().toUpperCase()
    if (normalized === state.word) {
      state.winner = playerId
      return { correct: true }
    }
    return { correct: false }
  },

  // Formata mensagem do jogo
  formatGame: (state) => {
    return (
      `📝 Desembaralhador de Palavras!\n\n` +
      `${state.scrambled}\n\n` +
      `Primeira resposta correta vence!\n` +
      `Envie apenas a palavra correta (sem comando).`
    )
  },

  // Formata resultados
  formatResults: (state, includePunishmentNotice = true) => {
    if (!state.winner) {
      return `Ninguém conseguiu desembaralhar: ${state.word}`
    }
    return includePunishmentNotice
      ? `🏆 ${formatMentionTag(state.winner)} acertou: ${state.word}!\nAgora escolha quem será punido!`
      : `🏆 ${formatMentionTag(state.winner)} acertou: ${state.word}!`
  },
}
