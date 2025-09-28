import type { Context } from 'hono';
import type { AuthenticatedUser, MarbleBindings } from './types';

export interface AppEnv {
  Bindings: MarbleBindings;
  Variables: {
    user: AuthenticatedUser;
  };
}

export type AppContext = Context<AppEnv>;
