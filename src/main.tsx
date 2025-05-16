import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DEFAULT_THEME, MantineProvider } from '@mantine/core'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={DEFAULT_THEME}>
      <App />
    </MantineProvider>
  </StrictMode>,
)
