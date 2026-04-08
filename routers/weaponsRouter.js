const { normalizeMentionArray } = require("../services/mentionService")
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
│ └─ Aplica 1 punição aleatória (3 min)
│    para TODOS os membros do grupo
│    (exceto overrides)
│
│ ${prefix}nagasaki
│ └─ Muta todos os membros do grupo
│    por 3 minutos (exceto overrides)
│    com efeito cósmico baseado na hora
│
│ ${prefix}chernobyl
│ └─ Muta 50% dos membros
│    e os outros 50% recebem punição
│
│ ${prefix}limparradiacao
│ └─ Remove o efeito da radiação
│    Todos podem interagir normalmente
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
      
      // Filtra membros que não são override
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

      // Seleciona alvo aleatório
      const randomTarget = targets[Math.floor(Math.random() * targets.length)]
      const targetJid = randomTarget?.id || ""

      // Aplica punição aleatória
      const punishment = getRandomPunishmentChoice()
      const punishmentName = getPunishmentNameById(punishment?.id)

      // Mensagens com delay de 1 segundo
      const senderOverrideName = (senderName || sender.split("@")).toUpperCase()  
      
      await sock.sendMessage(from, {
        text: `O CORNO DO ${senderOverrideName} TA PUTO`,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await sock.sendMessage(from, {
        text: `VAI BOTAR TODO MUNDO DE CASTIGO PQ N TÃO USANDO O BOT KKKKKKKKKKKKKKKKK`,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await sock.sendMessage(from, {
        text: `A punição aplicada foi: ${punishmentName || punishment?.id}`,
        mentions: normalizeMentionArray([targetJid]),
      })

      // Aguarda um pouco antes de aplicar punição
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Aplica punição aleatória
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

      const senderOverrideName = (senderName || sender.split("@")).toUpperCase()  
      
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

      // Muta todos por 3 minutos
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

  // Comando !chernobyl
  if (cmdName === `${prefix}chernobyl`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      })
      return true
    }

    try {
      const metadata = await sock.groupMetadata(from)
      const participants = metadata?.participants || []
      
      // Filtra membros que não são override
      const targets = participants.filter(p => {
        const jid = p?.id || ""
        return jid && jid !== sock.user?.id  
      })

      if (targets.length === 0) {
        await sock.sendMessage(from, {
          text: "Ninguém para afetar.",
        })
        return true
      }

      // Embaralha e divide em 50/50
      const shuffled = targets.sort(() => Math.random() - 0.5)
      const midpoint = Math.ceil(shuffled.length / 2)
      const toMute = shuffled.slice(0, midpoint)
      const toPunish = shuffled.slice(midpoint)

      const senderOverrideName = (senderName || sender.split("@")).toUpperCase()  
      
      await sock.sendMessage(from, {
        text: `O CORNO DO ${senderOverrideName} TA PUTO`,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await sock.sendMessage(from, {
        text: `VAI EXPLODIR CHERNOBYL E AFETAR GERAL KKKKKKKKKKKKKKKKK`,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      await sock.sendMessage(from, {
        text: `50% vai ficar mudo e 50% vai levar punição KKKKKKKKKKKKKKKK`,
      })

      // Aguarda um pouco antes de aplicar efeitos
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Muta 50%
      const mutedUsers = storage.getMutedUsers() || {}
      if (!mutedUsers[from]) mutedUsers[from] = {}
      
      const muteEndTime = Date.now() + (3 * 60 * 1000)

      for (const participant of toMute) {
        const jid = participant?.id || ""
        if (!jid || jid === sock.user?.id) continue
        mutedUsers[from] [jid] = muteEndTime  
      }

      storage.setMutedUsers(mutedUsers)

      // Aplica punição em 50%
      for (const participant of toPunish) {
        const jid = participant?.id || ""
        if (!jid || jid === sock.user?.id) continue
        
        const punishment = getRandomPunishmentChoice()
        await applyPunishment(sock, from, jid, punishment, {
          origin: "weapon",
        })
      }

      await sock.sendMessage(from, {
        text: `☢️ CHERNOBYL ATIVADO ☢️\n${toMute.length} silenciados | ${toPunish.length} punidos KKKKKKKKKKKKKKKK`,
      })

      return true
    } catch (err) {
      console.error("Erro ao executar chernobyl:", err)
      await sock.sendMessage(from, {
        text: "❌ Erro ao executar chernobyl.",
      })
      return true
    }
  }

  // Comando !limparradiacao / !limparradiação
  if (cmdName === `${prefix}limparradiacao` || cmdName === `${prefix}limparradiação`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar esse comando!",
      })
      return true
    }

    try {
      const mutedUsers = storage.getMutedUsers() || {}
      delete mutedUsers[from]
      storage.setMutedUsers(mutedUsers)

      await sock.sendMessage(from, {
        text: `ACABOU A RESENHA\nTODOS PODEM INTERAGIR NORMALMENTE`,
      })

      return true
    } catch (err) {
      console.error("Erro ao executar limparradiacao:", err)
      await sock.sendMessage(from, {
        text: "❌ Erro ao limpar radiação.",
      })
      return true
    }
  }

  return false
}

module.exports = { handleWeaponsCommand }
