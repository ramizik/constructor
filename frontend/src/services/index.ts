import type { ConstructorService } from '../types';
import { MockService } from './mockService';
import { ButterbaseService } from './butterbaseService';

// Flip to Butterbase by setting VITE_USE_BUTTERBASE=true in .env.local.
// The SDK client is only constructed when that flag is on, so a missing
// app id / anon key never breaks the mocked demo path.
let instance: ConstructorService | null = null;

export function getService(): ConstructorService {
  if (instance) return instance;
  instance =
    import.meta.env.VITE_USE_BUTTERBASE === 'true'
      ? new ButterbaseService()
      : new MockService();
  return instance;
}
