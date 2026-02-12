import { GlobalConfig } from "./config.js";
import { drizzle } from 'drizzle-orm/libsql';

// DI to pass global context / config items around classes
export class Context {
  public db: ReturnType<typeof drizzle>

  constructor(public opts: unknown) {
    const dbFilename = 'file:' + GlobalConfig.parse(opts)["db-filename"]

    this.db = drizzle(dbFilename)
  }
}
