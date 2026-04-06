// Test script to debug broadcast issues
const registrationService = require("./services/registrationService")

const users = registrationService.getRegisteredUsersForNotifications()
console.log("=== BROADCAST DEBUG INFO ===")
console.log(`Total registered users: ${users.length}`)
console.log("\nFirst 5 user JIDs:")
users.slice(0, 5).forEach((jid, i) => {
  console.log(`  ${i+1}. ${jid}`)
  const parts = jid.split("@")
  console.log(`     Phone: ${parts[0]}`)
  console.log(`     Server: ${parts[1]}`)
})

console.log("\nChecking JID validity:")
users.forEach(jid => {
  const hasServer = jid.includes("@")
  const isWhatsApp = jid.endsWith("@s.whatsapp.net")
  const digits = jid.replace(/\D/g, "")
  const isValidPhone = digits.length >= 10
  if (!hasServer || !isWhatsApp || !isValidPhone) {
    console.log(`  ⚠️  INVALID: ${jid}`)
  }
})

console.log("\nnotificationsEnabled distribution:")
const allUsers = Object.values(registrationService.cache?.users || {})
const enabled = allUsers.filter(u => u.notificationsEnabled !== false).length
const disabled = allUsers.filter(u => u.notificationsEnabled === false).length
console.log(`  Enabled: ${enabled}`)
console.log(`  Disabled: ${disabled}`)
