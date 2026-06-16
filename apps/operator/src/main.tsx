import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { OperatorPage } from './OperatorPage';
import './styles/global.scss';

document.documentElement.classList.add('tablet');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OperatorPage />
  </React.StrictMode>,
);
