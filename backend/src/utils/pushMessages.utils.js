import { PUSH_LANGUAGES } from '~/utils/constants/notification.constants'

// What a notification says, in the languages the app speaks. {name}, {amount} and {reward} are filled in.
const MESSAGES = {
  dailyReady: {
    en: ['Your daily chips are ready', 'Claim {amount} chips and keep your streak going.'],
    hi: ['आपके रोज़ाना चिप्स तैयार हैं', '{amount} चिप्स लें और अपनी स्ट्रीक बनाए रखें।'],
    es: ['Tus fichas diarias están listas', 'Reclama {amount} fichas y mantén tu racha.'],
    fr: ['Vos jetons quotidiens sont prêts', 'Récupérez {amount} jetons et gardez votre série.']
  },
  friendRequest: {
    en: ['New friend request', '{name} wants to be your friend.'],
    hi: ['नया दोस्ती अनुरोध', '{name} आपके दोस्त बनना चाहते हैं।'],
    es: ['Nueva solicitud de amistad', '{name} quiere ser tu amigo.'],
    fr: ['Nouvelle demande d’ami', '{name} souhaite devenir votre ami.']
  },
  friendAccepted: {
    en: ['{name} accepted your request', 'You can now see when they’re playing.'],
    hi: ['{name} ने आपका अनुरोध स्वीकार किया', 'अब आप देख सकते हैं कि वे कब खेल रहे हैं।'],
    es: ['{name} aceptó tu solicitud', 'Ahora puedes ver cuándo está jugando.'],
    fr: ['{name} a accepté votre demande', 'Vous pouvez maintenant voir quand il joue.']
  },
  friendInvite: {
    en: ['{name} invited you to play', 'Tap to take a seat at their table.'],
    hi: ['{name} ने आपको खेलने बुलाया है', 'उनकी मेज़ पर बैठने के लिए टैप करें।'],
    es: ['{name} te invitó a jugar', 'Toca para sentarte en su mesa.'],
    fr: ['{name} vous invite à jouer', 'Touchez pour prendre place à sa table.']
  },
  achievement: {
    en: ['Achievement unlocked', 'You earned {reward} chips.'],
    hi: ['उपलब्धि अनलॉक हुई', 'आपने {reward} चिप्स कमाए।'],
    es: ['¡Logro desbloqueado!', 'Ganaste {reward} fichas.'],
    fr: ['Succès débloqué', 'Vous avez gagné {reward} jetons.']
  },
  referralRewarded: {
    en: ['Referral reward', '{name} qualified: you earned {reward} chips.'],
    hi: ['रेफ़रल इनाम', '{name} योग्य हुए: आपने {reward} चिप्स कमाए।'],
    es: ['Recompensa por invitar', '{name} cumplió los requisitos: ganaste {reward} fichas.'],
    fr: ['Récompense de parrainage', '{name} est qualifié : vous avez gagné {reward} jetons.']
  }
}

export const PUSH_TYPES = Object.fromEntries(Object.keys(MESSAGES).map(type => [type, type]))

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole))

/** { title, body } for a kind of notification, in the language (English when it isn't one we have). */
export const pushText = (type, language, vars = {}) => {
  const entry = MESSAGES[type]
  if (!entry) throw new Error(`Unknown push type "${type}"`)
  const [title, body] = entry[PUSH_LANGUAGES.includes(language) ? language : 'en']
  return { title: fill(title, vars), body: fill(body, vars) }
}
