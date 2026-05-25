import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { db } from './lib/db'
import '@study-rpg/theme-pixel-neurons/styles/global.css'

if (import.meta.env.DEV) {
  db.open().then(async () => {
    const count = await db.neuronVariants.count()
    console.info(
      `[neurons-tw] Dexie v${db.verno / 10} ready · ${count} neuronVariant row${count === 1 ? '' : 's'}`,
    )
  })
  ;(globalThis as unknown as { __db?: typeof db }).__db = db
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
