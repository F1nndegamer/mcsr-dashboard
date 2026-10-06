import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import StreamStatsOverlay from './overlay/StreamStatsOverlay';
import StreamInfoOverlay from './overlay/StreamInfoOverlay';
import reportWebVitals from './reportWebVitals';

// OBS Browser Source entry point: open /overlay, #/overlay or ?overlay=1
// to get the transparent stream stats overlay instead of the dashboard.
const isOverlayMode = () => {
  const { pathname, hash, search } = window.location;
  const params = new URLSearchParams(search);
  return (
    pathname.startsWith('/overlay') ||
    hash.startsWith('#/overlay') ||
    params.get('overlay') === '1' ||
    params.get('stream') === '1'
  );
};

const overlayMode = isOverlayMode();

if (overlayMode) {
  document.body.classList.add('overlay-active');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {overlayMode ? (
      <StreamStatsOverlay />
    ) : (
      <App />
    )}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
