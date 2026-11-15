import '@fontsource/vt323';
import '@fontsource/special-elite';
import '@fontsource/creepster';
import './styles/tokens.css';
import './styles/motion.css';
import './styles/screens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { initMotion } from './ui/hooks/useMotion';

// Set data-reduced-motion on <html> before the first render.
initMotion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
