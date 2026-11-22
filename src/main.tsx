import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Google Maps Platform quota, auth & API error listener (triggers automatic Leaflet fallback)
if (typeof window !== 'undefined') {
  const triggerMapsFallback = (reason: string, isQuota: boolean) => {
    window.dispatchEvent(
      new CustomEvent('gmp-fallback-triggered', {
        detail: { reason, isQuota },
      })
    );
    if (isQuota) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };

  (window as any).gm_authFailure = () => {
    triggerMapsFallback(
      'Google Maps authorization or key restriction failure — using fallback map',
      false
    );
  };

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    const msg = args.map((a) => String(a)).join(' ');
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      triggerMapsFallback('Google Maps Platform quota exceeded — using fallback map', true);
    } else if (
      msg.includes('RefererNotAllowedMapError') ||
      msg.includes('InvalidKeyMapError') ||
      msg.includes('ApiNotActivatedMapError') ||
      msg.includes('BillingNotEnabledMapError') ||
      msg.includes('ApiProjectMapError') ||
      msg.includes('RequestDenied') ||
      msg.includes('Google Maps JavaScript API error')
    ) {
      triggerMapsFallback(
        'Google Maps Platform key/API configuration unavailable — using fallback map',
        false
      );
    }
  };
}

createRoot(document.getElementById('root')!).render(<App />);
