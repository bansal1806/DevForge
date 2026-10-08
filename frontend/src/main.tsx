import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { DialogProvider, Toaster } from './components/ui'
import { CommandPaletteProvider } from './contexts/CommandPalette'
import { CommandPaletteHost } from './components/CommandPalette/CommandPaletteHost'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {/* Honour the OS "reduce motion" setting for every framer-motion animation */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <AuthProvider>
            <DialogProvider>
              <CommandPaletteProvider>
                <App />
                <CommandPaletteHost />
                <Toaster />
              </CommandPaletteProvider>
            </DialogProvider>
          </AuthProvider>
        </BrowserRouter>
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
)
