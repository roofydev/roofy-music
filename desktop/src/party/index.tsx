import { createRoot } from 'react-dom/client';

import { PartyApp } from './party-app';

import './party.css';

const container = document.getElementById('root')! as HTMLElement;
const root = createRoot(container);

root.render(<PartyApp />);
