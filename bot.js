process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  DisconnectReason, 
  downloadMediaMessage,
  jidNormalizedUser
} = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")
const sharp = require("sharp")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegPath = require("ffmpeg-static")
ffmpeg.setFfmpegPath(ffmpegPath)
const crypto = require("crypto")

const app = express()
const logger = pino({ level: "silent" })

const prefix = "!"

let qrImage = null
let mutedUsers = {}
let coinGames = {} // [groupJid]: { [playerJid]: { resultado, createdAt } }
let coinPunishmentPending = {} // [groupJid]: { [playerJid]: { mode, target, createdAt } }
let resenhaAveriguada = {} // [groupJid]: boolean
let coinStreaks = {} // [groupJid]: { [playerJid]: number }
let coinStreakMax = {} // [groupJid]: { [playerJid]: number }
let coinHistoricalMax = {} // [groupJid]: number
let activePunishments = {} // [groupJid]: { [userJid]: punishmentState }
const LETTER_ALPHABET = "abcdefghijklmnopqrstuvwxyz"

// =========================
// HELPERS DE PUNIÇÃO
// =========================
function getPunishmentChoiceFromText(text = "") {
  const cleaned = text.toLowerCase().trim()
  if (cleaned === "1") return "1"
  if (cleaned === "2") return "2"
  if (cleaned === "3") return "3"
  if (cleaned === "4") return "4"
  if (cleaned === "5") return "5"
  return null
}

function getRandomPunishmentChoice() {
  const choices = ["1", "2", "3", "4", "5"]
  return choices[crypto.randomInt(0, choices.length)]
}

function getPunishmentNameById(punishmentId) {
  if (punishmentId === "1") return "máx. 5 caracteres (5 min)"
  if (punishmentId === "2") return "1 mensagem/20s (10 min)"
  if (punishmentId === "3") return "bloqueio por 2 letras (indefinido)"
  if (punishmentId === "4") return "somente emojis (5 min)"
  if (punishmentId === "5") return "mute total (5 min)"
  return "desconhecida"
}

function getRandomDifferentLetters() {
  const firstIndex = crypto.randomInt(0, LETTER_ALPHABET.length)
  let secondIndex = crypto.randomInt(0, LETTER_ALPHABET.length)
  while (secondIndex === firstIndex) secondIndex = crypto.randomInt(0, LETTER_ALPHABET.length)
  return [LETTER_ALPHABET[firstIndex], LETTER_ALPHABET[secondIndex]]
}

function stripWhitespaceExceptSpace(text = "") {
  // Mantém espaço comum (" ") contando no limite, ignora outros whitespaces.
  return text.replace(/[\t\n\r\f\v\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, "")
}

function isEmojiOnlyMessage(text = "") {
  const compact = text.replace(/\s+/g, "")
  if (!compact) return false
  const emojiCluster = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)+$/u
  return emojiCluster.test(compact)
}

function isUnlockLettersMessage(text = "", letters = []) {
  const normalized = text.toLowerCase().replace(/\s+/g, "")
  if (!normalized) return false
  const [a, b] = letters
  for (const ch of normalized) {
    if (ch !== a && ch !== b) return false
  }
  return true
}

function containsPunishmentLetters(text = "", letters = []) {
  const normalized = text.toLowerCase()
  return letters.some((letter) => normalized.includes(letter))
}

function getPunishmentMenuText() {
  return [
    "Escolha a punição digitando *1*, *2*, *3*, *4* ou *5*:",
    "1. Mensagens com no máximo 5 caracteres por 5 minutos.",
    "2. Máximo de 1 mensagem a cada 20 segundos por 10 minutos.",
    "3. Bloqueio por duas letras aleatórias (indefinido até cumprir condição de saída).",
    "4. Só pode enviar emojis por 5 minutos.",
    "5. Mute total por 5 minutos (tudo que enviar será apagado)."
  ].join("\n")
}

function ensureGroupMap(store, groupId) {
  if (!store[groupId]) store[groupId] = {}
}

function clearPendingPunishment(groupId, playerId) {
  if (!coinPunishmentPending[groupId]?.[playerId]) return
  delete coinPunishmentPending[groupId][playerId]
  if (Object.keys(coinPunishmentPending[groupId]).length === 0) delete coinPunishmentPending[groupId]
}

function clearPunishment(groupId, userId) {
  if (!activePunishments[groupId]?.[userId]) return
  const timerId = activePunishments[groupId][userId]?.timerId
  if (timerId) clearTimeout(timerId)
  delete activePunishments[groupId][userId]
  if (Object.keys(activePunishments[groupId]).length === 0) delete activePunishments[groupId]
}

async function applyPunishment(sock, groupId, userId, punishmentId) {
  ensureGroupMap(activePunishments, groupId)
  clearPunishment(groupId, userId)

  const mentionTag = `@${userId.split("@")[0]}`
  const now = Date.now()
  let punishmentState = null
  let warningText = ""

  if (punishmentId === "1") {
    punishmentState = {
      type: "max5chars",
      endsAt: now + 5 * 60_000
    }
    warningText = `${mentionTag}, punição ativada: suas mensagens só podem ter até *5 caracteres* por *5 minutos* (espaço conta). Mensagens fora disso serão apagadas.`
  }

  if (punishmentId === "2") {
    punishmentState = {
      type: "rate20s",
      endsAt: now + 10 * 60_000,
      lastAllowedAt: 0
    }
    warningText = `${mentionTag}, punição ativada: você só pode enviar *1 mensagem a cada 20 segundos* por *10 minutos*. Mensagens acima da taxa serão apagadas.`
  }

  if (punishmentId === "3") {
    const letters = getRandomDifferentLetters()
    punishmentState = {
      type: "lettersBlock",
      letters
    }
    warningText = `${mentionTag}, punição ativada: qualquer mensagem sua contendo ao menos 1 de 2 letras selecionadas aleatóriamente será apagada. Isso é *indefinido* e só acaba quando você enviar uma mensagem contendo apenas uma ou ambas essas letras.\nBoa sorte tentando descobrir quais letras elas são.`
  }

  if (punishmentId === "4") {
    punishmentState = {
      type: "emojiOnly",
      endsAt: now + 5 * 60_000
    }
    warningText = `${mentionTag}, punição ativada: por *5 minutos* você só pode enviar mensagens formadas apenas por emojis. Qualquer mensagem contendo texto não emoji será apagada.`
  }

  if (punishmentId === "5") {
    punishmentState = {
      type: "mute5m",
      endsAt: now + 5 * 60_000
    }
    warningText = `${mentionTag}, punição ativada: *mute total por 5 minutos*. Qualquer mensagem sua será apagada.`
  }

  if (!punishmentState) return

  activePunishments[groupId][userId] = punishmentState

  if (punishmentState?.endsAt) {
    const msRemaining = Math.max(0, punishmentState.endsAt - now)
    const timerId = setTimeout(() => {
      clearPunishment(groupId, userId)
    }, msRemaining)
    activePunishments[groupId][userId].timerId = timerId
  }

  await sock.sendMessage(groupId, {
    text: warningText,
    mentions: [userId]
  })
}

// =========================
// FISCALIZAÇÃO DE PUNIÇÕES
// =========================
async function handlePunishmentEnforcement(sock, msg, from, sender, text, isGroup, skipForCommand = false) {
  if (!isGroup) return false
  if (skipForCommand) return false
  const punishment = activePunishments[from]?.[sender]
  if (!punishment) return false

  const now = Date.now()
  if (punishment.endsAt && now >= punishment.endsAt) {
    clearPunishment(from, sender)
    return false
  }

  let shouldDelete = false

  if (punishment.type === "max5chars") {
    const measured = stripWhitespaceExceptSpace(text)
    shouldDelete = measured.length > 5
  }

  if (punishment.type === "rate20s") {
    if (punishment.lastAllowedAt && now - punishment.lastAllowedAt < 20_000) {
      shouldDelete = true
    } else {
      punishment.lastAllowedAt = now
    }
  }

  if (punishment.type === "lettersBlock") {
    const letters = punishment.letters || []
    if (isUnlockLettersMessage(text, letters)) {
      clearPunishment(from, sender)
      await sock.sendMessage(from, {
        text: `@${sender.split("@")[0]}, você cumpriu a condição e foi liberado da punição das letras (${letters[0]} / ${letters[1]}).`,
        mentions: [sender]
      })
      return false
    }
    shouldDelete = containsPunishmentLetters(text, letters)
  }

  if (punishment.type === "emojiOnly") {
    shouldDelete = !isEmojiOnlyMessage(text)
  }

  if (punishment.type === "mute5m") {
    shouldDelete = true
  }

  if (!shouldDelete) return false

  try {
    await sock.sendMessage(from, { delete: msg.key })
  } catch (e) {
    console.error("Erro ao apagar mensagem por punição", e)
  }
  return true
}

// Override
const overrideJid = jidNormalizedUser("5521995409899@s.whatsapp.net")
const overridePhoneNumber = "5521995409899"

const dddMap = {
  // Sudeste
  "11": "Sudeste","12": "Sudeste","13": "Sudeste","14": "Sudeste","15": "Sudeste",
  "16": "Sudeste","17": "Sudeste","18": "Sudeste","19": "Sudeste",
  "21": "Sudeste","22": "Sudeste","24": "Sudeste",
  "31": "Sudeste","32": "Sudeste","33": "Sudeste","34": "Sudeste","35": "Sudeste","37": "Sudeste","38": "Sudeste",

  // Sul
  "41": "Sul","42": "Sul","43": "Sul","44": "Sul","45": "Sul","46": "Sul",
  "47": "Sul","48": "Sul","49": "Sul",
  "51": "Sul","53": "Sul","54": "Sul","55": "Sul",

  // Nordeste
  "71": "Nordeste","73": "Nordeste","74": "Nordeste","75": "Nordeste","79": "Nordeste",
  "81": "Nordeste","82": "Nordeste","83": "Nordeste","84": "Nordeste","85": "Nordeste",
  "86": "Nordeste","87": "Nordeste","88": "Nordeste","89": "Nordeste",

  // Norte
  "91": "Norte","92": "Norte","93": "Norte","94": "Norte","95": "Norte","96": "Norte",
  "97": "Norte","98": "Norte","99": "Norte",

  // Centro-Oeste
  "61": "Centro-Oeste","62": "Centro-Oeste","64": "Centro-Oeste","63": "Centro-Oeste",
  "65": "Centro-Oeste","66": "Centro-Oeste","67": "Centro-Oeste",
}

app.get("/", (req,res)=>{
  if(qrImage) return res.send(`<h2>Escaneie o QR Code</h2><img src="${qrImage}">`)
  res.send("<h2>Bot conectado</h2>")
})

const PORT = process.env.PORT || 3000
app.listen(PORT,()=>console.log("Servidor rodando na porta " + PORT))

// =========================
// VIDEO PARA STICKER
// =========================
async function videoToSticker(buffer){
  const input = "./input.mp4"
  const output = "./output.webp"

  fs.writeFileSync(input, buffer)

  await new Promise((resolve,reject)=>{
    ffmpeg(input)
      .outputOptions([
        "-vcodec libwebp",
        "-vf scale=512:512:flags=lanczos", // força deformação completa para 512x512
        "-loop 0",
        "-preset default",
        "-an",
        "-vsync 0"
      ])
      .toFormat("webp")
      .save(output)
      .on("end", resolve)
      .on("error", reject)
  })

  const sticker = fs.readFileSync(output)
  fs.unlinkSync(input)
  fs.unlinkSync(output)
  return sticker
}

// =========================
// INICIAR BOT
// =========================
async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal:false,
    browser:["VitinBot","Chrome","1.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async(update)=>{
    const { connection, qr, lastDisconnect } = update

    if(qr){
      qrImage = await QRCode.toDataURL(qr)
      console.log("QR GERADO")
    }

    if(connection === "open"){
      console.log("BOT ONLINE")
      qrImage = null
    }

    if(connection === "close"){
      const reason = lastDisconnect?.error?.output?.statusCode
      if(reason !== DisconnectReason.loggedOut){
        console.log("Reconectando...")
        setTimeout(startBot,5000)
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages })=>{
    const msg = messages[0]
    if(!msg.message) return
    if(msg.key.fromMe) return

    const from = msg.key.remoteJid
    const senderRaw = msg.key.participant || msg.key.remoteJid
    const sender = jidNormalizedUser(senderRaw)
    const isGroup = from.endsWith("@g.us")

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ""

    const cmd = text.toLowerCase().trim()
    const isCommand = cmd.startsWith(prefix)
    const mentioned = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).map(jidNormalizedUser)
    let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

    // =========================
    // IDENTIFICAÇÃO DE ADMIN
    // =========================
    let senderIsAdmin = false
    if (isGroup && isCommand) {
      const metadata = await sock.groupMetadata(from)
      const admins = (metadata?.participants || []).filter(p => p.admin).map(p => p.id)
      senderIsAdmin = admins.includes(sender)
    }

    // =========================
    // ESCOLHA PENDENTE DE PUNIÇÃO
    // =========================
    if (isGroup) {
      const pending = coinPunishmentPending[from]?.[sender]
      if (pending && !(senderIsAdmin && isCommand)) {
        const punishmentChoice = getPunishmentChoiceFromText(text)
        let target = pending.target

        if (pending.mode === "target" && mentioned.length > 0) {
          target = mentioned[0]
          coinPunishmentPending[from][sender].target = target
        }

        if (pending.mode === "target" && !target) {
          await sock.sendMessage(from, {
            text: "Marque primeiro quem vai receber a punição.\n" + getPunishmentMenuText()
          })
          return
        }

        if (!punishmentChoice) {
          await sock.sendMessage(from, {
            text: "Escolha inválida.\n" + getPunishmentMenuText()
          })
          return
        }

        const punishedUser = pending.mode === "self" ? sender : target
        await applyPunishment(sock, from, punishedUser, punishmentChoice)
        clearPendingPunishment(from, sender)
        return
      }
    }

    // =========================
    // APLICAÇÃO DE PUNIÇÃO ATIVA
    // =========================
    const punishedMessageDeleted = await handlePunishmentEnforcement(sock, msg, from, sender, text, isGroup, senderIsAdmin && isCommand)
    if (punishedMessageDeleted) return

    if (cmd === prefix + "resenha"){
      if (!isGroup) {
        await sock.sendMessage(from, { text: "Esse comando só funciona em grupo." })
        return
      }

      const metadata = await sock.groupMetadata(from)
      const admins = (metadata?.participants || []).filter(p => p.admin).map(p => p.id)
      if (!admins.includes(sender)) {
        await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
        return
      }

      resenhaAveriguada[from] = !resenhaAveriguada[from]

      await sock.sendMessage(from, {
        text: resenhaAveriguada[from]
          ? "analisada possível resenha!"
          : "não há possibilidade de resenha..."
      })
      return
    }

    // =========================
    // RESPOSTA PENDENTE DO CARA OU COROA
    // =========================
    const playerGame = isGroup ? coinGames[from]?.[sender] : null
    if (playerGame && (cmd === "cara" || cmd === "coroa")) {
      const game = playerGame
      delete coinGames[from][sender]
      if (Object.keys(coinGames[from]).length === 0) delete coinGames[from]

      // Check override - flexible matching
      const isOverride = sender === overrideJid || sender.split("@")[0] === overridePhoneNumber
      const acertou = isOverride || (cmd === game.resultado)

      if (!coinStreaks[from]) coinStreaks[from] = {}

      if (acertou && resenhaAveriguada[from]) {
        coinStreaks[from][sender] = (coinStreaks[from][sender] || 0) + 1
        const streak = coinStreaks[from][sender]

        if (!coinStreakMax[from]) coinStreakMax[from] = {}
        coinStreakMax[from][sender] = Math.max(coinStreakMax[from][sender] || 0, streak)
        coinHistoricalMax[from] = Math.max(coinHistoricalMax[from] || 0, streak)

        await sock.sendMessage(from, {
          text: `Você acertou! A moeda caiu em *${game.resultado}*.\nStreak: *${streak}*\nEscolha um alvo e a punição dele em até 30 segundos.\n${getPunishmentMenuText()}\nMarque alguém para punir.`
        })

        ensureGroupMap(coinPunishmentPending, from)
        coinPunishmentPending[from][sender] = {
          mode: "target",
          target: null,
          createdAt: Date.now()
        }

        setTimeout(() => {
          if (coinPunishmentPending[from]?.[sender]) {
            clearPendingPunishment(from, sender)
          }
        }, 30_000)
      } else if (acertou) {
        coinStreaks[from][sender] = (coinStreaks[from][sender] || 0) + 1
        const streak = coinStreaks[from][sender]

        if (!coinStreakMax[from]) coinStreakMax[from] = {}
        coinStreakMax[from][sender] = Math.max(coinStreakMax[from][sender] || 0, streak)
        coinHistoricalMax[from] = Math.max(coinHistoricalMax[from] || 0, streak)

        await sock.sendMessage(from, {
          text: `Você acertou! A moeda caiu em *${game.resultado}*.\n🔥 Streak: *${streak}*`
        })
      } else {
        delete coinStreaks[from][sender]
        if (Object.keys(coinStreaks[from]).length === 0) delete coinStreaks[from]

        await sock.sendMessage(from, {
          text: `A moeda caiu em *${game.resultado}*.\nSe fudeu.\n💥 Sua streak foi resetada.`,
          mentions: [sender]
        })

        if (resenhaAveriguada[from]) {
          const randomPunishment = getRandomPunishmentChoice()
          await sock.sendMessage(from, {
            text: `Punição sorteada: *${getPunishmentNameById(randomPunishment)}*`,
            mentions: [sender]
          })
          await applyPunishment(sock, from, sender, randomPunishment)
        }
      }
      return
    }

    let media =
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      quoted?.imageMessage ||
      quoted?.videoMessage

    // =========================
    // MENU
    // =========================
    if(cmd === prefix+"menu"){
      await sock.sendMessage(from,{
        text:`
╭━━━〔 🤖 VITIN BOT 〕━━━╮
│ 👑 Status: Online
│ ⚙️ Sistema: Baileys
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎨 FIGURINHAS 〕━━━╮
│ ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎮 DIVERSÃO 〕━━━╮
│ ${prefix}roleta
│ ${prefix}bombardeio @user
│ ${prefix}gay @user
│ ${prefix}gado @user
│ ${prefix}ship @a @b
│ ${prefix}treta
│ ${prefix}moeda
│--- ${prefix}streak (para ver sua sequência)
│--- ${prefix}streakranking (para ver o ranking do grupo)
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 ⚡ ADM 〕━━━╮
│ ${prefix}mute @user
│ ${prefix}unmute @user
│ ${prefix}ban @user
│ ${prefix}punições @user
│ ${prefix}puniçõesclr @user
│ ${prefix}puniçõesadd @user
╰━━━━━━━━━━━━━━━━━━━━╯
`
      })
    }

    // =========================
    // FIGURINHA
    // =========================
    if(cmd === prefix+"s" || cmd === prefix+"fig" || cmd === prefix+"sticker" || cmd === prefix+"f"){
      if(!media) return sock.sendMessage(from,{ text:"Envie ou responda uma mídia!" })

      try{
        let buffer;
        if(msg.message?.imageMessage || msg.message?.videoMessage){
          buffer = await downloadMediaMessage(msg, "buffer", {}, { logger })
        } else if(quoted?.imageMessage || quoted?.videoMessage){
          buffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger })
        }

        let sticker;
        if(msg.message?.imageMessage || quoted?.imageMessage){
          sticker = await sharp(buffer)
            .resize({ width: 512, height: 512, fit: "fill" })
            .webp({ quality: 100 })
            .toBuffer()
        } else if(msg.message?.videoMessage || quoted?.videoMessage){
          sticker = await videoToSticker(buffer)
        }

        await sock.sendMessage(from,{ sticker })

      }catch(err){
        console.error(err)
        await sock.sendMessage(from,{ text:"Erro ao criar figurinha!" })
      }
    }

    // =========================
    // ROLETA
    // =========================
    if(cmd === prefix+"roleta" && isGroup){
      const metadata = await sock.groupMetadata(from)
      const participantes = (metadata?.participants || []).map(p => p.id)
      const alvo = participantes[Math.floor(Math.random()*participantes.length)]
      const numero = alvo.split("@")[0]

      const frases = [
        `@${numero} foi agraciado a rebolar lentinho pra todos do grupo!`,
        `@${numero} vai ter que pagar babão pro bonde`,
        `@${numero} teve os dados puxados e tivemos uma revelação triste, é adotado...`,
        `@${numero} por que no seu navegador tem pornô de femboy furry?`,
        `@${numero} gabaritou a tabela de DST! Parabéns pela conquista.`,
        `@${numero} foi encontrado na ilha do Epstein...`,
        `@${numero} foi censurado pelo Felca`,
        `@${numero} está dando pro pai de todo mundo do grupo`,
        `@${numero} foi visto numa boate gay no centro de São Paulo`,
        `@${numero} sei que te abandonaram na ilha do Epstein, mas não precisa se afundar em crack...`,
        `@${numero} foi avistado gravando um video para o onlyfans da Leandrinha...`,
        `@${numero} pare de me mandar foto da bunda no privado, ja disse que não vou avaliar!`,
        `@${numero} estava assinando o Privacy do Bluezão quando foi flagrado, você ta bem mano?`,
        `@${numero} teve o histórico do navegador vazado e achamos uma pesquisa estranha... Peppa Pig rule 34?`,
        `@${numero} foi pego pela vó enquanto batia punheta!`,
        `@${numero} teve uma foto constragedora vazada... pera, c ta vestido de empregada?`,
        `@${numero} descobrimos sua conta do OnlyFans!`,
        `@${numero} foi visto comendo o dono do grupo!`,
        `@${numero} viu a namorada beijando outro, não sobra nem o conceito de nada pro beta. Brutal`
      ]

      const frase = frases[Math.floor(Math.random()*frases.length)]
      await sock.sendMessage(from,{ text:frase, mentions:[alvo] })
    }

    // =========================
    // BOMBARDEIO
    // =========================
    if(cmd.startsWith(prefix+"bombardeio") && mentioned.length>0 && isGroup){
      const alvo = mentioned[0]

      const ip = `${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}`

      const provedores = ["Claro","Vivo","Tim","Oi","Copel","NET"]
      const provedor = provedores[Math.floor(Math.random()*provedores.length)]

      const dispositivos = ["Android","iOS","Windows PC","Linux PC"]
      const dispositivo = dispositivos[Math.floor(Math.random()*dispositivos.length)]

      // Região fake a partir do DDD
      const numero = alvo.split("@")[0]
      const ddd = numero.substring(0,2)
      const regiao = dddMap[ddd] || "desconhecida"

      const crimes = ["furto","roubo","estelionato","tráfico","lesão corporal","homicídio","contrabando","vandalismo","pirataria","crime cibernético","fraude","tráfico de animais","lavagem de dinheiro","crime ambiental","corrupção","sequestro","ameaça","falsificação","invasão de propriedade","crime eleitoral"]
      const crime = crimes[Math.floor(Math.random()*crimes.length)]

      await sock.sendMessage(from,{ text:`📡 Analisando ficha criminal... (1 crime encontrado: ${crime})`, mentions:[alvo] })

      setTimeout(async ()=>{
        await sock.sendMessage(from,{ text:`💻 IP rastreado: ${ip}`, mentions:[alvo] })
      },1500)

      setTimeout(async ()=>{
        await sock.sendMessage(from,{
          text:`🎯 Alvo identificado!\n📍 Região: ${regiao}\n💻 Provedor: ${provedor}\n📱 Dispositivo: ${dispositivo}\n⚠️ Vulnerabilidade encontrada!\n💣 Iniciando ataque em breve...`,
          mentions:[alvo]
        })
      },3000)
    }

    // =========================
    // GAY / GADO / SHIP
    // =========================
    if(cmd.startsWith(prefix+"gay") && mentioned[0]){
      const alvo = mentioned[0]
      const numero = alvo.split("@")[0]
      const p = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{ text:`@${numero} é ${p}% gay 🌈`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix+"gado") && mentioned[0]){
      const alvo = mentioned[0]
      const numero = alvo.split("@")[0]
      const p = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{ text:`@${numero} é ${p}% gado 🐂`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix+"ship") && mentioned.length >= 2){
      const p1 = mentioned[0]
      const p2 = mentioned[1]
      const n1 = p1.split("@")[0]
      const n2 = p2.split("@")[0]
      const chance = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{
        text:`💘 @${n1} + @${n2} = ${chance}%`,
        mentions:[p1,p2]
      })
    }

    // =========================
    // TRETA
    // =========================
    if(cmd === prefix+"treta" && isGroup){
      const metadata = await sock.groupMetadata(from)
      const participantes = (metadata?.participants || []).map(p => p.id)
      const p1 = participantes[Math.floor(Math.random()*participantes.length)]
      let p2 = participantes[Math.floor(Math.random()*participantes.length)]
      while(p1 === p2) p2 = participantes[Math.floor(Math.random()*participantes.length)]
      const n1 = p1.split("@")[0]
      const n2 = p2.split("@")[0]

      const motivos = [
        "brigaram por causa de comida",
        "discutiram por causa de mulher",
        `treta começou pois @${n1} tentou ver a pasta trancada de @${n2}`,
        "um chamou o outro de feio kkkkkkkkkkkk",
        "disputa de ego gigantesca",
        `treta começou pois @${n1} falou que era mais forte que @${n2}`,
        "um deve dinheiro pro outro(so tem caloteiro aqui)",
        "brigaram pra ver quem tem o maior pinto"
      ]

      const motivo = motivos[Math.floor(Math.random()*motivos.length)]

      // Evento especial do pinto
      if(motivo === "brigaram pra ver quem tem o maior pinto"){
        const vencedor = Math.random() < 0.5 ? p1 : p2
        const perdedor = vencedor === p1 ? p2 : p1
        const nv = vencedor.split("@")[0]
        const np = perdedor.split("@")[0]
        const tamanhoVencedor = (Math.random()*20 + 5).toFixed(1) // 5 a 25
        const tamanhoPerdedor = (Math.random()*23 - 20).toFixed(1) // -20 a 3
        const finais = [
          `@${np} tem o menor micro pênis já registrado da história! (${tamanhoPerdedor}cm)`,
          `@${nv} ganhou com seus incríveis ${tamanhoVencedor} centímetros!`
        ]
        const resultado = finais[Math.floor(Math.random()*finais.length)]
        await sock.sendMessage(from,{
          text:`Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
          mentions:[p1,p2]
        })
        return
      }

      const resultados = [
        `@${n1} saiu chorando`,
        `@${n2} ficou de xereca`,
        "deu empate, briguem dnv fazendo favor",
        `@${n1} ganhou`,
        `@${n2} pediu arrego`
      ]
      const resultado = resultados[Math.floor(Math.random()*resultados.length)]
      await sock.sendMessage(from,{
        text:`Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
        mentions:[p1,p2]
      })
    }
    // =========================
    // MOEDA (cara ou coroa)
    // =========================
    if (cmd === prefix + "moeda" && isGroup){
      // bloqueia nova rodada para este jogador se já houver prêmio pendente
      if (coinPunishmentPending[from]?.[sender]) {
        await sock.sendMessage(from, {
          text: "Você já tem uma escolha de punição pendente. Resolva isso antes de iniciar outra rodada."
        })
        return
      }

      // bloqueia nova rodada para este jogador se já houver jogo dele em andamento
      if (coinGames[from]?.[sender]) {
        await sock.sendMessage(from, {
          text: "Você já tem uma rodada em andamento. Responda com *cara* ou *coroa*."
        })
        return
      }

      // RNG criptográfico (já que reclamaram)
      const resultado = crypto.randomInt(0, 2) === 0 ? "cara" : "coroa"

      if (!coinGames[from]) coinGames[from] = {}
      coinGames[from][sender] = {
        player: sender,
        resultado,
        createdAt: Date.now()
      }

      await sock.sendMessage(from, {
        text: `Cara ou Coroa, ladrão?`
      })

      // expira depois de 30s (apenas a rodada deste jogador)
      setTimeout(() => {
        if (coinGames[from]?.[sender]) {
          delete coinGames[from][sender]
          if (Object.keys(coinGames[from]).length === 0) delete coinGames[from]
        }
      }, 30_000)

      return
    }

    // =========================
    // MUTE / UNMUTE / BAN / NUKE
    // =========================
    if(cmd.startsWith(prefix + "mute") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para mutar!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me mutar!" }) 
      if(!senderIsAdmin) return sock.sendMessage(from,{ text:"Apenas admins podem mutar!" })
      if (!mutedUsers[from]) mutedUsers[from] = {}
      mutedUsers[from][alvo] = true
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi mutado! Finalmente vai calar a boca.`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix + "unmute") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para desmutar!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me desmutar!" }) 
      if(!senderIsAdmin) return sock.sendMessage(from,{ text:"Apenas admins podem desmutar!" })
      if (mutedUsers[from]) {
        delete mutedUsers[from][alvo]
        if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
      }
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi desmutado! Infelizmente pode falar de novo.`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix + "ban") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para banir!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me banir!" }) 
      if(!senderIsAdmin) return sock.sendMessage(from,{ text:"Apenas admins podem banir!" })
      await sock.groupParticipantsUpdate(from,[alvo],"remove")
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi banido do grupo.`, mentions:[alvo] })
    }

    if (cmd === prefix + "nuke" && isGroup) {
      if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      try {
        await sock.sendMessage(from, { delete: msg.key })
      } catch (e) {
        console.error("Erro ao apagar mensagem do !nuke", e)
      }
      clearPunishment(from, sender)
      if (mutedUsers[from]?.[sender]) {
        delete mutedUsers[from][sender]
        if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
      }
      if (coinPunishmentPending[from]?.[sender]) clearPendingPunishment(from, sender)
      await sock.sendMessage(from, {
        text: `@${sender.split("@")[0]} teve todas as punições removidas instantaneamente.`,
        mentions: [sender]
      })
      return
    }

    // =========================
    // COMANDOS ADMIN DE PUNIÇÃO
    // =========================
    if (cmd === prefix + "punições" && isGroup) {
      if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      const alvo = mentioned[0]
      if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para listar as punições." })

      const lines = []
      if (mutedUsers[from]?.[alvo]) lines.push("- Mute admin manual (indefinido)")

      const active = activePunishments[from]?.[alvo]
      if (active) {
        if (active.type === "max5chars") lines.push("- Máx. 5 caracteres")
        if (active.type === "rate20s") lines.push("- 1 mensagem/20s")
        if (active.type === "lettersBlock") lines.push(`- Bloqueio por letras (${(active.letters || []).join("/")})`)
        if (active.type === "emojiOnly") lines.push("- Somente emojis")
        if (active.type === "mute5m") lines.push("- Mute total 5 minutos")
      }

      if (coinPunishmentPending[from]) {
        const penders = Object.keys(coinPunishmentPending[from]).filter((jid) => {
          const p = coinPunishmentPending[from][jid]
          return jid === alvo || p.target === alvo
        })
        if (penders.length > 0) lines.push(`- Escolha pendente ligada ao usuário (${penders.length})`)
      }

      await sock.sendMessage(from, {
        text: lines.length > 0
          ? `Punições de @${alvo.split("@")[0]}:\n${lines.join("\n")}`
          : `@${alvo.split("@")[0]} não possui punições ativas.`,
        mentions: [alvo]
      })
      return
    }

    if (cmd.startsWith(prefix + "puniçõesclr") && isGroup) {
      if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      const alvo = mentioned[0]
      if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para limpar as punições." })

      clearPunishment(from, alvo)
      if (mutedUsers[from]?.[alvo]) {
        delete mutedUsers[from][alvo]
        if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
      }

      if (coinPunishmentPending[from]) {
        const keys = Object.keys(coinPunishmentPending[from])
        for (const key of keys) {
          const pending = coinPunishmentPending[from][key]
          if (key === alvo || pending.target === alvo) {
            clearPendingPunishment(from, key)
          }
        }
      }

      await sock.sendMessage(from, {
        text: `Todas as punições de @${alvo.split("@")[0]} foram removidas.`,
        mentions: [alvo]
      })
      return
    }

    if (cmd.startsWith(prefix + "puniçõesadd") && isGroup) {
      if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      const alvo = mentioned[0]
      if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para aplicar punição." })

      const parts = text.trim().split(/\s+/)
      const punishmentChoice = getPunishmentChoiceFromText(parts[parts.length - 1] || "")
      if (!punishmentChoice) {
        return sock.sendMessage(from, {
          text: "Use: !puniçõesadd @user <1-5>\n" + getPunishmentMenuText(),
          mentions: [alvo]
        })
      }

      await applyPunishment(sock, from, alvo, punishmentChoice)
      return
    }

    // =========================
    // BLOQUEIO DE MENSAGENS DE USUÁRIOS MUTADOS
    // =========================
    if(mutedUsers[from]?.[sender] && isGroup && sender !== sock.user.id && !(senderIsAdmin && isCommand)){
      try{
        await sock.sendMessage(from,{ delete: msg.key })
      }catch(e){
        console.error("Erro ao apagar mensagem de usuário mutado", e)
      }
      return
    }
    // =========================
    // COMANDOS DE STREAKS
    // =========================
    if (cmd === prefix + "streakranking" && isGroup) {
      const maxMap = coinStreakMax[from] || {}
      const currentMap = coinStreaks[from] || {}

      const entries = Object.keys(maxMap).map((jid) => ({
        jid,
        max: maxMap[jid] || 0,
        current: currentMap[jid] || 0
      }))

      if (entries.length === 0) {
        await sock.sendMessage(from, { text: "Sem dados de streak neste grupo ainda." })
        return
      }

      entries.sort((a, b) => (b.max - a.max) || (b.current - a.current))
      const top = entries.slice(0, 10)
      const hist = coinHistoricalMax[from] || top[0].max || 0

      const rankingLines = top.map((u, i) =>
        `${i + 1}. @${u.jid.split("@")[0]} — max: *${u.max}* | atual: *${u.current}*`
      )

      await sock.sendMessage(from, {
        text:
          `🏆 Recorde histórico do grupo: *${hist}*\nPelo menos até o bot resetar.\n` +
          `📊 Ranking de streak (max | atual):\n` +
          rankingLines.join("\n"),
        mentions: top.map(u => u.jid)
      })
      return
    }

    if ((cmd === prefix + "streak" || cmd.startsWith(prefix + "streak ")) && isGroup) {
      const alvo = mentioned[0] || sender
      const valor = coinStreaks[from]?.[alvo] || 0
      await sock.sendMessage(from, {
        text: `Streak de @${alvo.split("@")[0]}: *${valor}*`,
        mentions: [alvo]
      })
      return
    }

  })
} 

startBot()
