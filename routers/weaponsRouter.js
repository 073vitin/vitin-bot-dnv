const { normalizeMentionArray, formatMentionTag, getMentionHandleFromJid } = require("../services/mentionService");
const { applyPunishment, getPunishmentNameById, getRandomPunishmentChoice } = require("../services/punishmentService");

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
  } = ctx;

  if (!isGroup) return false;

  const cmd = (text || "").toLowerCase().trim();
  const cmdParts = cmd.split(/\s+/);
  const cmdName = cmdParts[0];

  // Menu de armas
  if (cmdName === `${prefix}armas`) {
    const armasMenu = `
╭━━━〔 ⚔️ MENU: ARMAS 〕━━━╮
│ Comandos exclusivos para overrides
│
│ ${prefix}hiroshima
│ └─ Aplica 1 punição aleatória
│    para TODOS os membros do grupo
│    (afeta overrides)
│
│ ${prefix}nagasaki
│ └─ Muta todos os membros do grupo
│    por 3 minutos (afeta overrides)
│
│ ${prefix}chernobyl
│ └─ Muta metade do grupo e aplica
│    punição aleatória na outra metade
│
│ ${prefix}removerradiacao
│ └─ Desfaz efeitos de !chernobyl
│
│ ⚠️ Cuidado: Essas armas afetam
│    TODOS os membros simultaneamente!
╰━━━━━━━━━━━━━━━━━━━━╯
    `;

    await sock.sendMessage(from, { text: armasMenu });
    return true;
  }

  // Comando !hiroshima
  if (cmdName === `${prefix}hiroshima`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      });
      return true;
    }

    try {
      const metadata = await sock.groupMetadata(from);
      const participants = metadata?.participants || [];

      const targets = participants.filter(p => {
        const jid = p?.id || "";
        return jid && jid !== sock.user?.id;
      });

      if (targets.length === 0) {
        await sock.sendMessage(from, {
          text: "Ninguém para punir.",
        });
        return true;
      }

      const randomTarget = targets[Math.floor(Math.random() * targets.length)];
      const targetJid = randomTarget?.id || "";

      const punishment = getRandomPunishmentChoice();
      const punishmentName = getPunishmentNameById(punishment?.id);

      const senderHandle = getMentionHandleFromJid(sender);
      const senderOverrideName = (senderName || senderHandle || "CORNO").toUpperCase();

      await sock.sendMessage(from, {
        text: `O CORNO DO ${senderOverrideName} TA PUTO`,
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      await sock.sendMessage(from, {
        text: `VAI BOTAR TODO MUNDO DE CASTIGO PQ N TÃO USANDO OS OUTROS COMANDOS DO BOT KKKKKKKKKKKKKKKKK`,
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      await sock.sendMessage(from, {
        text: `A punição aplicada foi: ${punishmentName || punishment?.id}\n${formatMentionTag(targetJid)}`,
        mentions: normalizeMentionArray([targetJid]),
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      await applyPunishment(sock, from, targetJid, punishment, {
        origin: "weapon",
      });

      return true;
    } catch (err) {
      console.error("Erro ao executar hiroshima:", err);
      await sock.sendMessage(from, {
        text: "❌ Erro ao executar hiroshima.",
      });
      return true;
    }
  }

  // Comando !nagasaki
  if (cmdName === `${prefix}nagasaki`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      });
      return true;
    }

    try {
      const metadata = await sock.groupMetadata(from);
      const participants = metadata?.participants || [];

      const senderHandle = getMentionHandleFromJid(sender);
      const senderOverrideName = (senderName || senderHandle || "CORNO").toUpperCase();

      await sock.sendMessage(from, {
        text: `O CORNO DO ${senderOverrideName} TA PUTO`,
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      await sock.sendMessage(from, {
        text: `VAI CALAR A BOCA DE TODO MUNDO QUE MAMOU ELE KKKKKKKKKKKKKKKKKK`,
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      await sock.sendMessage(from, {
        text: `Geral com a boca calada por 3 minutos KKKKKKKKKKKKKKKK`,
      });

      const mutedUsers = storage.getMutedUsers() || {};
      if (!mutedUsers[from]) mutedUsers[from] = {};

      const muteEndTime = Date.now() + (3 * 60 * 1000);

      for (const participant of participants) {
        const jid = participant?.id || "";
        if (!jid || jid === sock.user?.id) continue;
        mutedUsers[from][jid] = muteEndTime;
      }

      storage.setMutedUsers(mutedUsers);

      return true;
    } catch (err) {
      console.error("Erro ao executar nagasaki:", err);
      await sock.sendMessage(from, {
        text: "❌ Erro ao executar nagasaki.",
      });
      return true;
    }
  }

  // Comando !chernobyl
  if (cmdName === `${prefix}chernobyl`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      });
      return true;
    }

    try {
      const metadata = await sock.groupMetadata(from);
      const participants = metadata?.participants || [];

      const targets = participants.filter(p => {
        const jid = p?.id || "";
        return jid && jid !== sock.user?.id;
      });

      if (targets.length < 2) {
        await sock.sendMessage(from, {
          text: "Precisa de pelo menos 2 membros para usar !chernobyl.",
        });
        return true;
      }

      const senderHandle = getMentionHandleFromJid(sender);
      const senderOverrideName = (senderName || senderHandle || "CORNO").toUpperCase();

      await sock.sendMessage(from, {
        text: `O CORNO DO ${senderOverrideName} TA PUTO`,
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      await sock.sendMessage(from, {
        text: `VAI CONTAMINAR METADE DO GRUPO E PUNIR A OUTRA METADE KKKKKKKKKKKKKKKKK`,
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      await sock.sendMessage(from, {
        text: `CHERNOBYL ATIVADO!`,
      });

      const shuffled = [...targets].sort(() => 0.5 - Math.random());
      const half = Math.ceil(shuffled.length / 2);
      const mutedHalf = shuffled.slice(0, half);
      const punishedHalf = shuffled.slice(half);

      const mutedUsers = storage.getMutedUsers() || {};
      if (!mutedUsers[from]) mutedUsers[from] = {};
      const muteEndTime = Date.now() + (3 * 60 * 1000);

      for (const participant of mutedHalf) {
        const jid = participant?.id || "";
        if (jid) mutedUsers[from][jid] = muteEndTime;
      }

      for (const participant of punishedHalf) {
        const jid = participant?.id || "";
        if (!jid) continue;

        const punishment = getRandomPunishmentChoice();
        const punishmentName = getPunishmentNameById(punishment?.id);

        await sock.sendMessage(from, {
          text: `Punição aplicada em ${formatMentionTag(jid)}: ${punishmentName || punishment?.id}`,
          mentions: normalizeMentionArray([jid]),
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        await applyPunishment(sock, from, jid, punishment, {
          origin: "weapon",
        });
      }

      storage.setMutedUsers(mutedUsers);

      return true;
    } catch (err) {
      console.error("Erro ao executar chernobyl:", err);
      await sock.sendMessage(from, {
        text: "❌ Erro ao executar chernobyl.",
      });
      return true;
    }
  }

  // Comando !removerradiacao
  if (cmdName === `${prefix}removerradiacao`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      });
      return true;
    }

    try {
      const mutedUsers = storage.getMutedUsers() || {};
      const groupMuted = mutedUsers[from] || {};

      for (const jid in groupMuted) {
        delete groupMuted[jid];
      }

      await sock.sendMessage(from, {
        text: "☢️ RADIAÇÃO REMOVIDA! Todos voltaram ao normal(eu acho).",
      });

      storage.setMutedUsers(mutedUsers);

      return true;
    } catch (err) {
      console.error("Erro ao executar removerradiacao:", err);
      await sock.sendMessage(from, {
        text: "❌ Erro ao executar removerradiacao.",
      });
      return true;
    }
  }

  return false;
}

module.exports = { handleWeaponsCommand };
