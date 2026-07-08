import type { ConstructorService } from '../types';
import { ButterbaseService } from './butterbaseService';

// No mock/demo path — the frontend always talks to the real Butterbase
// backend. Missing config fails loudly at startup instead of silently
// falling back to fake data.
let instance: ConstructorService | null = null;

export function getService(): ConstructorService {
  if (instance) return instance;
  if (!import.meta.env.VITE_BUTTERBASE_APP_ID) {
    throw new Error(
      'VITE_BUTTERBASE_APP_ID is not set. Copy frontend/.env.example to .env.local ' +
        'and fill in the deployed Butterbase app config — see README.md Setup.',
    );
  }
  instance = new ButterbaseService();
  return instance;
}
