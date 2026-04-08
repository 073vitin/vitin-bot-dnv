const { normalizeMentionArray } = require("../services/mentionService")
const { applyPunishment, getPunishmentNameById } = require("../services/punishmentService")

async function handleWeaponsCommand(ctx) {
  const {
    sock,
    from,
    sender,
    text,
    isGroup,
    participants,
    senderName,
    senderIsAdmin,
    overrideIdentifiers,
    prefix,
  } = ctx

  if (!isGroup) return false

  if (!senderIsAdmin || !overrideIdentifiers?.includes(sender)) {
    await sock.sendMessage(from, {
      text: "❌ Apenas overrides podem usar comandos envolvendo as armas!",
    })
    return true
  }

  const command = text.toLowerCase().trim().split(" ")

  if (command === `${prefix}armas`) {
    const armasMenu = `
╭━━━〔 ⚔️ MENU: ARMAS 〕━━━╮
│ Comandos exclusivos para overrides:
│
│ ${prefix}hiroshima
│ └─ Aplica 1 punição aleatória (3 min)
│    para TODOS os membros do grupo
│    (exceto overrides)
│
│ ${prefix}nagasaki
│ └─ Muta todos os membros do grupo
│    por 3 minutos (exceto overrides)
│    com efeito cósmico baseado na hora
│
│ ⚠️ Cuidado: Essas armas afetam
│    TODOS os membros simultaneamente!
╰━━━━━━━━━━━━━━━━━━━━╯
    `

    await sock.sendMessage(from, {
      text: armasMenu,
    })
    return true
  }

  // Comando !hiroshima
  if (command === `${prefix}hiroshima`) {
    const groupMembers = participants.map(p => p.id)
    const targets = groupMembers.filter(jid => !overrideIdentifiers.includes(jid))

    if (targets.length === 0) {
      await sock.sendMessage(from, {
        text: "Ninguém para punir.",
      })
      return true
    }

    const randomTarget = targets[Math.floor(Math.random() * targets.length)]
    const randomName = randomTarget.split("@")[0]

    await sock.sendMessage(from, {
      text: `💥 CUIDADO, A MÃE DO @${randomName} TA CAINDO DO CÉU, CUIDADO!!!!!\n🌠 QUEDA EMINENTE EM...`,
      mentions: normalizeMentionArray([randomTarget]),
    })

    for (let i = 5; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await sock.sendMessage(from, {
        text: `${i} ⏳`,
      })
    }

    await sock.sendMessage(from, {
      text: "💣 OLHA A SENTADA MISTERIOSA",
    })

    const punishmentChoices = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"]
    const randomPunishment = punishmentChoices[Math.floor(Math.random() * punishmentChoices.length)]

    for (const jid of targets) {
      await applyPunishment(sock, from, jid, randomPunishment, {
        severityMultiplier: 1,
        origin: "admin",
      })
    }

    const punishmentName = getPunishmentNameById(randomPunishment)
    const mentionsList = targets.map(jid => `@${jid.split("@")[0]}`).join(", ")

    await sock.sendMessage(from, {
      text: `☢️ A MÃE DE @${randomName} ESTA EMITINDO RADIAÇÃO E MUDOU O AMBIENTE EM SUA VOLTA\n🌀 A MUTAÇÃO QUE VOCES RECEBERAM FOI: *${punishmentName}* (3 minutos)\n\n👥 Afetados: ${mentionsList}`,
      mentions: normalizeMentionArray(targets),
    })

    return true
  }

  // Comando !nagasaki
  if (command === `${prefix}nagasaki`) {
    const groupMembers = participants.map(p => p.id)
    const targets = groupMembers.filter(jid => !overrideIdentifiers.includes(jid))

    if (targets.length === 0) {
      await sock.sendMessage(from, {
        text: "Ninguém para mutar.",
      })
      return true
    }

    // Verificar horário
    const now = new Date()
    const hour = now.getHours()

    let messages = []
    if (hour < 18) {
      messages = [
        "Ué, pq tem dois sóis no céu",
        "Um deles ta chegando perto...",
        "EITA PORRA"
      ]
    } else {
      messages = [
        "Ué, pq ta dando pra ver o sol de noite?",
        "Pq essa porra ta crescendo",
        "EITA CARAI"
      ]
    }

    for (const msg of messages) {
      await sock.sendMessage(from, {
        text: msg,
      })
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    for (const jid of targets) {
      await applyPunishment(sock, from, jid, "5", {
        severityMultiplier: 1,
        origin: "admin",
      })
    }

    const mentionsList = targets.map(jid => `@${jid.split("@")[0]}`).join(", ")

    await sock.sendMessage(from, {
      text: `A RADIAÇÃO ESTÁ ALTERANDO O GRUPO...\nA MUTAÇÃO FOI: MUTE POR 3 MINUTOS!\nSE FUDERAM KKKKKKKKKKKKKKKKKKKKKKKKKKKKK\n\n👥 Afetados: ${mentionsList}`,
      mentions: normalizeMentionArray(targets),
    })

    return true
  }

  return false
}

module.exports = {
  handleWeaponsCommand,
}
