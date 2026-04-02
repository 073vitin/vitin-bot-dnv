const { getBuffer } = require('../lib/functions');

let lobby = {
    active: false,
    players: [],
    dealerCards: [],
    playerHands: {},
    gameStarted: false
};

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function getRandomCard() {
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    return { suit, rank };
}

function getCardValue(card) {
    if (card.rank === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    return parseInt(card.rank);
}

function getHandValue(hand) {
    let value = 0;
    let aces = 0;
    for (let card of hand) {
        value += getCardValue(card);
        if (card.rank === 'A') aces++;
    }
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    return value;
}

function formatHand(hand) {
    return hand.map(c => `${c.rank}${c.suit}`).join(' ');
}

module.exports = {
    name: 'blackjack',
    description: 'Jogue Blackjack com até 4 pessoas!',
    async execute(sock, message, args, user, isGroup, groupMetadata) {
        const numero = user.split("@");
        const mention = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

        // Menu inicial
        if (args.length === 0) {
            const menu = `
🃏 *Blackjack (21)* 

✅ Comandos:
!21 ou !blackjack → Mostra este menu
!21 criar ou !blackjack criar → Cria um novo jogo
!21 entrar ou !blackjack entrar → Entra no jogo atual
!21 começar ou !blackjack começar → Inicia o jogo (2+ jogadores)
!21 pedir ou !blackjack pedir → Pede mais uma carta
!21 manter ou !blackjack manter → Para de pedir cartas
!21 status ou !blackjack status → Mostra o status do jogo

⚠️ Limite: 4 jogadores por partida.
`;
            return sock.sendMessage(message.key.remoteJid, { text: menu });
        }

        // Criar novo jogo
        if (args === 'criar' || args === 'criar') {
            if (lobby.active) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Já existe um jogo ativo. Use !21 entrar para participar.' });
            }
            lobby = {
                active: true,
                players: [numero],
                dealerCards: [],
                playerHands: {},
                gameStarted: false
            };
            return sock.sendMessage(message.key.remoteJid, { 
                text: `✅ @${numero} criou um novo jogo de Blackjack! Use !21 entrar para participar.`, 
                mentions: [user] 
            });
        }

        // Entrar no jogo
        if (args === 'entrar' || args === 'join') {
            if (!lobby.active) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Nenhum jogo ativo. Use !21 criar para começar.' });
            }
            if (lobby.players.length >= 4) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Lobby cheio! Máximo de 4 jogadores.' });
            }
            if (lobby.players.includes(numero)) {
                return sock.sendMessage(message.key.remoteJid, { text: '✅ Você já está no jogo!' });
            }
            lobby.players.push(numero);
            return sock.sendMessage(message.key.remoteJid, { 
                text: `✅ @${numero} entrou no jogo! (${lobby.players.length}/4)`, 
                mentions: [user] 
            });
        }

        // Iniciar jogo
        if (args === 'começar' || args === 'comecar' || args === 'start') {
            if (!lobby.active) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Nenhum jogo ativo para iniciar.' });
            }
            if (lobby.players.length < 2) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Precisa de pelo menos 2 jogadores para começar.' });
            }
            if (lobby.gameStarted) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ O jogo já começou!' });
            }

            lobby.gameStarted = true;
            lobby.dealerCards = [getRandomCard(), getRandomCard()];
            for (let player of lobby.players) {
                lobby.playerHands[player] = [getRandomCard(), getRandomCard()];
            }

            let msg = '🃏 *Blackjack começou!* 🃏\n\n';
            for (let player of lobby.players) {
                const hand = lobby.playerHands[player];
                const value = getHandValue(hand);
                msg += `@${player}: ${formatHand(hand)} (Valor: ${value})\n`;
            }
            msg += `\n Dealers: ${formatHand([lobby.dealerCards])} ?`;

            return sock.sendMessage(message.key.remoteJid, { 
                text: msg, 
                mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
            });
        }

        // Pedir carta
        if (args === 'pedir' || args === 'hit') {
            if (!lobby.gameStarted) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ O jogo ainda não começou.' });
            }
            if (!lobby.players.includes(numero)) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Você não está no jogo.' });
            }
            if (!lobby.playerHands[numero]) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Você já está fora do jogo.' });
            }

            const card = getRandomCard();
            lobby.playerHands[numero].push(card);
            const value = getHandValue(lobby.playerHands[numero]);

            if (value > 21) {
                delete lobby.playerHands[numero];
                return sock.sendMessage(message.key.remoteJid, { 
                    text: `💥 @${numero} estourou! (Valor: ${value})`, 
                    mentions: [user] 
                });
            }

            return sock.sendMessage(message.key.remoteJid, { 
                text: `✅ @${numero} pediu uma carta: ${card.rank}${card.suit} (Valor: ${value})`, 
                mentions: [user] 
            });
        }

        // Manter (parar)
        if (args === 'manter' || args === 'stand' || args === 'parar') {
            if (!lobby.gameStarted) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ O jogo ainda não começou.' });
            }
            if (!lobby.players.includes(numero)) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Você não está no jogo.' });
            }
            if (!lobby.playerHands[numero]) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Você já está fora do jogo.' });
            }

            delete lobby.playerHands[numero];
            return sock.sendMessage(message.key.remoteJid, { 
                text: `✅ @${numero} parou.`, 
                mentions: [user] 
            });
        }

        // Status
        if (args === 'status' || args === 'placar') {
            if (!lobby.active) {
                return sock.sendMessage(message.key.remoteJid, { text: '❌ Nenhum jogo ativo.' });
            }
            let msg = '👥 *Lobby Blackjack*\n';
            msg += `Jogadores: ${lobby.players.length}/4\n`;
            if (lobby.gameStarted) {
                msg += '🎮 Jogo em andamento!\n';
                for (let player of lobby.players) {
                    if (lobby.playerHands[player]) {
                        const value = getHandValue(lobby.playerHands[player]);
                        msg += `@${player}: ${formatHand(lobby.playerHands[player])} (${value})\n`;
                    }
                }
            } else {
                msg += '⏳ Aguardando jogadores...\n';
                for (let player of lobby.players) {
                    msg += `@${player}\n`;
                }
            }
            return sock.sendMessage(message.key.remoteJid, { 
                text: msg, 
                mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
            });
        }

        // Comando padrão: mostra menu
        const menu = `
🃏 *Blackjack (21)* 

✅ Comandos:
!21 ou !blackjack → Mostra este menu
!21 criar ou !blackjack criar → Cria um novo jogo
!21 entrar ou !blackjack entrar → Entra no jogo atual
!21 começar ou !blackjack começar → Inicia o jogo (2+ jogadores)
!21 pedir ou !blackjack pedir → Pede mais uma carta
!21 manter ou !blackjack manter → Para de pedir cartas
!21 status ou !blackjack status → Mostra o status do jogo

⚠️ Limite: 4 jogadores por partida.
`;
        return sock.sendMessage(message.key.remoteJid, { text: menu });
    }
};
