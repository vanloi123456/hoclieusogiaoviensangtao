import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initAntiCopyGuard } from './utils/antiCopyGuard';

initAntiCopyGuard();

createRoot(document.getElementById('root')!).render(<App />);
