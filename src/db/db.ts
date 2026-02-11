
import { drizzle } from 'drizzle-orm/libsql';

export class Db {
  private db: ReturnType<typeof drizzle>

  constructor(filename: string) {
    this.db = drizzle(filename);
  }
}
