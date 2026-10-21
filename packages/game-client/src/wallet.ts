import type { ApiClient } from '@roulette/api-client'
import { SERVER_EVENTS, type ServerEventData } from '@roulette/contracts'
import type { SocketLike } from './socket-transport.ts'

/** A chip balance the UI can show and follow, wherever the chips live. */
export interface WalletAdapter {
  /** Null until the balance is known. */
  getBalance (): number | null
  subscribe (listener: (balance: number | null) => void): () => void
  refresh (): Promise<void>
}

/** The subset of Web Storage the practice wallet needs. */
export interface StorageLike {
  getItem (key: string): string | null
  setItem (key: string, value: string): void
}

abstract class ObservableWallet implements WalletAdapter {
  protected balance: number | null = null
  #listeners = new Set<(balance: number | null) => void>()

  getBalance = (): number | null => this.balance

  subscribe = (listener: (balance: number | null) => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  abstract refresh (): Promise<void>

  protected publish (balance: number | null) {
    this.balance = balance
    for (const listener of this.#listeners) listener(balance)
  }
}

/**
 * Practice chips for offline play, kept on the device. They are separate from the online wallet
 * and never sync with it, so offline play cannot mint online chips.
 */
export class LocalWalletAdapter extends ObservableWallet {
  readonly #storage: StorageLike | null
  readonly #key: string

  constructor ({ storage, key = 'roulette.practiceChips', startingBalance = 1000 }: { storage: StorageLike | null, key?: string, startingBalance?: number }) {
    super()
    this.#storage = storage
    this.#key = key
    let stored: number | null = null
    try { stored = Number.parseInt(storage?.getItem(key) ?? '', 10) } catch { /* storage unavailable */ }
    this.balance = Number.isSafeInteger(stored) && stored! >= 0 ? stored : startingBalance
  }

  async refresh (): Promise<void> {}

  /** Records the balance a local table ended with. */
  set (balance: number) {
    try { this.#storage?.setItem(this.#key, String(balance)) } catch { /* storage unavailable */ }
    this.publish(balance)
  }
}

/** The signed-in player's server wallet: read over REST, kept current by wallet:updated events. */
export class RemoteWalletAdapter extends ObservableWallet {
  readonly #api: ApiClient
  readonly #socket: SocketLike | null
  readonly #onUpdate = (payload: { data: ServerEventData['wallet:updated'] }) => this.publish(payload.data.wallet.balance)

  constructor ({ api, socket = null }: { api: ApiClient, socket?: SocketLike | null }) {
    super()
    this.#api = api
    this.#socket = socket
    socket?.on(SERVER_EVENTS.WALLET_UPDATED, this.#onUpdate)
  }

  async refresh (): Promise<void> {
    const { wallet } = await this.#api.wallet()
    this.publish(wallet.balance)
  }

  dispose () {
    this.#socket?.off(SERVER_EVENTS.WALLET_UPDATED, this.#onUpdate)
  }
}
