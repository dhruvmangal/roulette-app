import demoNamespace from './demo.namespace'
import rouletteNamespace from './roulette.namespace'

export default function (io) {
  demoNamespace(io)
  rouletteNamespace(io)
}
