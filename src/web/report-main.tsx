import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReportApp } from './ReportApp';
import type { ReportEnvelope } from '../core/types';
import './report.css';

declare global {
  interface Window {
    __CTXMAP_DATA__?: ReportEnvelope;
  }
}

const envelope = window.__CTXMAP_DATA__ ?? null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReportApp envelope={envelope} />
  </React.StrictMode>
);
