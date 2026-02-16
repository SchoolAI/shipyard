import { deleteConfig } from '../auth.js';
import { print } from './output.js';

export async function logoutCommand(): Promise<void> {
  const deleted = await deleteConfig();
  if (deleted) {
    print('Logged out. Token removed from ~/.shipyard/config.json');
  } else {
    print('Not logged in (no config file found).');
  }
}
