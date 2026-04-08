const { normalizeMentionArray, formatMentionTag, getMentionHandleFromJid } = require("../services/mentionService")
const { applyPunishment, getPunishmentNameById, getRandomPunishmentChoice } = require("../services/punishmentService")

async function handleWeaponsCommand(ctx) {
  const {
    sock,
    from,
    sender,
    text,
    isGroup,
    senderName,
    isOverrideSender,
    prefix,
    storage,
  } = ctx

  if (!isGroup) return false

  const cmd = text.toLowerCase().trim()
  const cmdName = cmd.split(/\s+/) || ""  

  // Menu de armas
  if (cmdName === `${prefix}armas`) {
    const armasMenu = `
╭━━━〔 ⚔️ MENU: ARMAS 〕━━━╮
│ Comandos exclusivos para overrides:
│
│ ${prefix}hiroshima
│ └─ Aplica 1 punição aleatória
│    para TODOS os membros do grupo
│    (exceto overrides)
│
│ ${prefix}nagasaki
│ └─ Muta todos os membros do grupo
│    por 3 minutos (exceto overrides)
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
  if (cmdName === `${prefix}hiroshima`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      })
      return true
    }

    try {
      const metadata = await sock.groupMetadata(from)
      const participants = metadata?.participants || []
      
      const targets = participants.filter(p => {
        const jid = p?.id || ""
        return jid && jid !== sock.user?.id  
      })

      if (targets.length === 0) {
        await sock.sendMessage(from, {
          text: "Ninguém para punir.",
        })
        return true
      }

      const randomTarget = targets[Math.floor(Math.random() * targets.length)]
      const targetJid = randomTarget?.id || ""

      const punishment = getRandomPunishmentChoice()
      const punishmentName = getPunishmentNameById(punishment?.id)

      const senderHandle = getMentionHandleFromJid(sender)
      const senderOverrideName = (senderName || senderHandle || "CORNO").toUpperCase()
      
      await sock.sendMessage(from, {
        text: `O CORNO DO ${senderOverrideName} TA PUTO`,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await sock.sendMessage(from, {
        text: `VAI BOTAR TODO MUNDO DE CASTIGO PQ N TÃO USANDO O BOT KKKKKKKKKKKKKKKKK`,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await sock.sendMessage(from, {
        text: `A punição aplicada foi: ${punishmentName || punishment?.id}\n${formatMentionTag(targetJid)}`,
        mentions: normalizeMentionArray([targetJid]),
      })

      await new Promise(resolve => setTimeout(resolve, 2000))

      await applyPunishment(sock, from, targetJid, punishment, {
        origin: "weapon",
      })

      return true
    } catch (err) {
      console.error("Erro ao executar hiroshima:", err)
      await sock.sendMessage(from, {
        text: "❌ Erro ao executar hiroshima.",
      })
      return true
    }
  }

  // Comando !nagasaki
  if (cmdName === `${prefix}nagasaki`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      })
      return true
    }

    try {
      const metadata = await sock.groupMetadata(from)
      const participants = metadata?.participants || []

      const senderHandle = getMentionHandleFromJid(sender)
      const senderOverrideName = (senderName || senderHandle || "CORNO").toUpperCase()
      
      await sock.sendMessage(from, {
        text: `O CORNO DO ${senderOverrideName} TA PUTO`,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await sock.sendMessage(from, {
        text: `VAI CALAR A BOCA DE TODO MUNDO QUE MAMOU ELE KKKKKKKKKKKKKKKKKK`,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await sock.sendMessage(from, {
        text: `Geral com a boca calada por 3 minutos KKKKKKKKKKKKKKKK`,
      })

      const mutedUsers = storage.getMutedUsers() || {}
      if (!mutedUsers[from]) mutedUsers[from] = {}
      
      const muteEndTime = Date.now() + (3 * 60 * 1000)

      for (const participant of participants) {
        const jid = participant?.id || ""
        if (!jid || jid === sock.user?.id) continue
        mutedUsers[from] [jid] = muteEndTime
      }

      storage.setMutedUsers(mutedUsers)

      return true
    } catch (err) {
      console.error("Erro ao executar nagasaki:", err)
      await sock.sendMessage(from, {
        text: "❌ Erro ao executar nagasaki.",
      })
      return true
    }
  }

  return false
}

module.exports = { handleWeaponsCommand }
