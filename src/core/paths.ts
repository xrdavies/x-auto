import { homedir } from 'node:os';
import { resolve } from 'node:path';

const root = () => resolve(process.env.X_AUTO_HOME || `${homedir()}/.x-auto`);

export const paths = {
  root,
  profiles: () => resolve(root(), 'profiles'),
  profile: (id: string) => resolve(root(), 'profiles', id),
  backups: () => resolve(root(), 'backups'),
  state: () => resolve(root(), 'state'),
};
