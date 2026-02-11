import type { GlobalConfig } from "./config.js";
import { drizzle } from 'drizzle-orm/libsql';

// DI to pass global context / config items around classes
export class Context {
  public db: ReturnType<typeof drizzle>

  constructor(public cliConfig: GlobalConfig) {
    this.db = drizzle(cliConfig["db-filename"]);
  }
}
