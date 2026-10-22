import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n'
import { registerServiceWorker } from './pwa'
import './style.css'

const container = document.getElementById('root')!
const root = import.meta.hot?.data.root ?? createRoot(container)

if (import.meta.hot) import.meta.hot.data.root = root

root.render(
  <React.StrictMode><I18nProvider><App /></I18nProvider></React.StrictMode>
)

registerServiceWorker()
