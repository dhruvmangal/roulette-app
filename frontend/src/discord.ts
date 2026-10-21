/**
 * Running as a Discord Activity: the game is opened inside a voice call, in a
 * frame Discord controls. Discord opens it with `frame_id` in the address, so
 * that is how the game knows. Nothing here is loaded for anyone else: the SDK
 * is fetched only when the game is inside Discord.
 */
export const inDiscord = (() => {
  try { return new URLSearchParams(window.location.search).has('frame_id') } catch { return false }
})()

export interface DiscordLogin {
  /** One-time code the server exchanges for the player's Discord account. */
  code: string
  /** The same for everyone in this call's Activity: it names their shared table. */
  instanceId: string
}

/** Asks Discord who the player is (a prompt-free approval, as the app is already in their call). */
export async function discordLogin (clientId: string): Promise<DiscordLogin> {
  const { DiscordSDK } = await import('@discord/embedded-app-sdk')
  const sdk = new DiscordSDK(clientId)
  await sdk.ready()
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify']
  })
  return { code, instanceId: sdk.instanceId }
}
