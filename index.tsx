import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';

const stripePromise = loadStripe(process.env.VITE_STRIPE_PUBLIC_KEY || '');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Elements stripe={stripePromise}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Elements>
    </BrowserRouter>
  </React.StrictMode>
);
