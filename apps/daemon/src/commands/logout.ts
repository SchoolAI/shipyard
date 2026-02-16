import { deleteConfig, getConfigPath } from '../auth.js';
import { print } from './output.js';

export async function logoutCommand(): Promise<void> {
  const deleted = await deleteConfig();
  if (deleted) {
    print(`Logged out. Token removed from ${getConfigPath()}`);
  } else {
    print('Not logged in (no config file found).');
  }
}
