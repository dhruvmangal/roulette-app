import type { ReactNode } from 'react'

const UPDATED = '22 October 2026'
/** Where people write to; set VITE_SUPPORT_EMAIL when building. Without it the pages say to use the contact details on the sign-in screen's app listing. */
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined

const Contact = () => (SUPPORT_EMAIL ? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> : <>the support contact shown on this app’s store or Google sign-in listing</>)

const Section = ({ title, children }: { title: string, children: ReactNode }) => (
  <section className="legal-section">
    <h2>{title}</h2>
    {children}
  </section>
)

function Privacy () {
  return (
    <>
      <p className="lede">Roulette is a free game played with chips that have no cash value. This page explains what we collect when you play, why, how long we keep it, and what you can do about it.</p>

      <Section title="What we collect">
        <ul>
          <li><b>Account.</b> If you sign in with Google or Apple we receive your name, email address and a stable account ID from them. We never see your Google or Apple password. If you play as a guest we create an account with a generated username and nothing else.</li>
          <li><b>Gameplay.</b> Your chip balance and every chip movement, your bets, rounds, results, achievements, leaderboard position, referrals, friends, and the tables you join.</li>
          <li><b>Chat.</b> Messages and reactions you send at online tables, and any reports you file about messages.</li>
          <li><b>Device and visit details.</b> When you open the game we record your IP address, a rough location worked out from it (rounded to about a kilometre), your browser or app, operating system, device model, language, screen orientation and connection type. We do not ask for your precise location, contacts, photos, microphone, camera or Wi-Fi name.</li>
          <li><b>Usage statistics.</b> We use Google Analytics to count visits and see which pages and games are used. It records the pages you open, your approximate location, and your browser and device type, using cookies or similar identifiers. We do not send it your name, email or chip balance, and we have turned off advertising features. You can opt out with <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener">Google’s opt-out add-on</a> or by blocking analytics cookies in your browser.</li>
          <li><b>Notifications.</b> If you turn on push notifications, the token your phone gives us so we can send them.</li>
          <li><b>On your device.</b> Settings such as language and sound, and practice chips for offline play, are kept in your browser or app storage. Offline play never leaves your device.</li>
        </ul>
      </Section>

      <Section title="Why we use it">
        <ul>
          <li>To run the game: sign you in, keep your chips, deal rounds, show your history and let you play with friends.</li>
          <li>To keep it fair and safe: spot duplicate or abusive accounts, stop cheating and bonus abuse, moderate chat and respond to reports.</li>
          <li>To improve it: understand which pages and games are used (through Google Analytics) and fix problems.</li>
          <li>To contact you about the game, only through notifications you have chosen to allow.</li>
        </ul>
        <p>We do not sell your data and we do not show third-party advertising.</p>
      </Section>

      <Section title="Who sees it">
        <p>Other players see your username, your chat messages, and your results on tables and leaderboards. Friends you add can see whether you are online and which table you are at. Nobody else sees your email address.</p>
        <p>We use a few service providers to operate the game: hosting and database providers, Google and Apple for sign-in, Google Analytics for usage statistics, and Firebase Cloud Messaging and Apple’s push service to deliver notifications. They process data only to provide those services. We may also share information if the law requires it or to protect the game and its players.</p>
      </Section>

      <Section title="How long we keep it">
        <ul>
          <li>Account, wallet and gameplay records: while your account exists.</li>
          <li>Device and visit details: 90 days, then they are deleted automatically.</li>
          <li>Push tokens: until you turn notifications off or sign out on that device.</li>
          <li>Guest accounts that are no longer used may be removed.</li>
        </ul>
      </Section>

      <Section title="Your choices">
        <ul>
          <li>Sign out at any time from the account menu, on this device or on all devices.</li>
          <li>Turn notifications and sounds off in Settings.</li>
          <li>Ask to see, correct or delete your data, including deleting your account, by writing to <Contact />. We will act on a request within 30 days. Deleting an account removes its chips and history permanently.</li>
          <li>You can clear the data kept on your device at any time from your browser or app settings.</li>
        </ul>
      </Section>

      <Section title="Children">
        <p>Roulette is for people aged 18 and over. We do not knowingly collect information from anyone younger. If you believe a child has an account, write to us and we will remove it.</p>
      </Section>

      <Section title="Security and changes">
        <p>Connections are encrypted and sign-in sessions can be ended from your account. No system is perfectly secure, so we cannot promise absolute protection. If we change this policy we will update the date below, and tell you in the game if the change is significant.</p>
      </Section>

      <Section title="Contact">
        <p>Questions or requests about your data: <Contact />.</p>
      </Section>
    </>
  )
}

function Terms () {
  return (
    <>
      <p className="lede">These terms are the rules for using Roulette. By signing in or playing as a guest you agree to them. If you do not agree, please do not use the game.</p>

      <Section title="Play chips only">
        <p>Roulette is a game for entertainment. Chips have no cash value, cannot be bought, sold, cashed out, withdrawn or transferred to anyone, and there are no prizes of real value. Winning chips here does not predict or imply winning anywhere else. Games on this site, including roulette, Aviator, Plinko, the Prize Wheel and the Horse Race, are not real-money gambling.</p>
      </Section>

      <Section title="Who can play">
        <p>You must be at least 18 years old, and playing a game like this must be lawful where you live. You are responsible for checking that.</p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>Keep your sign-in secure. You are responsible for what happens under your account.</li>
          <li>One person, one account. Creating many accounts to collect bonuses or referral rewards is not allowed.</li>
          <li>Guest accounts live on one device and may be lost if you clear its data or we remove inactive guests. Save your account with Google or Apple to keep it.</li>
        </ul>
      </Section>

      <Section title="Fair play and conduct">
        <ul>
          <li>Do not cheat, exploit bugs, use bots or scripts against the game, or try to interfere with the service or other players.</li>
          <li>Be respectful in chat. Do not post abuse, harassment, hate, sexual content, spam, advertising or other people’s private information.</li>
          <li>Do not try to buy, sell or trade accounts or chips for money or anything else.</li>
        </ul>
        <p>We may remove messages, adjust or remove chips gained unfairly, and suspend or close accounts that break these rules.</p>
      </Section>

      <Section title="How the games work">
        <p>Results are drawn at random on our servers (or on your device in offline practice) and the odds and payouts are shown in the game. Each game returns about 98.5 percent of chips staked on average over a very large number of plays, which means that over time the house keeps a small edge. Short-term results vary widely. Strategies and betting systems cannot change the odds. The Learn page explains this.</p>
      </Section>

      <Section title="Bonuses and rewards">
        <p>Daily bonuses, refill bonuses, achievements and referral rewards are free chips offered at our discretion. We can change, pause or end them, and can refuse or reverse rewards that were obtained through misuse.</p>
      </Section>

      <Section title="The service">
        <p>We work to keep Roulette available but it is provided as it is, without promises that it will always be uninterrupted or error-free. We may change features, reset or adjust balances after a fault, or stop the service. To the fullest extent the law allows, we are not liable for losses arising from using a free game with no real-money stakes, and nothing here limits any rights you have by law that cannot be limited.</p>
      </Section>

      <Section title="Content and ownership">
        <p>The game, its artwork and code belong to us or our licensors. You may play it for personal use, but may not copy it or resell it. Messages you post stay yours, and you allow us to show them to other players at the table.</p>
      </Section>

      <Section title="Privacy">
        <p>How we handle your information is described in our <a href="/privacy">Privacy Policy</a>.</p>
      </Section>

      <Section title="Changes and contact">
        <p>We may update these terms and will change the date below when we do. Continuing to play after a change means you accept it. Questions: <Contact />.</p>
      </Section>
    </>
  )
}

/** The privacy policy and terms of service. Plain English text, shown the same in every language. */
export function LegalScreen ({ kind }: { kind: 'privacy' | 'terms' }) {
  return (
    <main className="page legal">
      <header className="page-head">
        <p className="eyebrow">Roulette</p>
        <h1 className="page-title">{kind === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p className="legal-updated">Last updated {UPDATED}</p>
      </header>
      {kind === 'privacy' ? <Privacy /> : <Terms />}
    </main>
  )
}
