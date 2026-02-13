import id128 from 'id128'
import logfmt from 'logfmt'
import type { Context } from './ctx.js'
import { logs } from './db/schema.js'

// severity aligns to https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
// 1-4	TRACE	A fine-grained debugging event. Typically disabled in default configurations.
// 5-8	DEBUG	A debugging event.
// 9-12	INFO	An informational event. Indicates that an event happened.
// 13-16	WARN	A warning event. Not an error but is likely more important than an informational event.
// 17-20	ERROR	An error event. Something went wrong.
// 21-24	FATAL	A fatal error such as application or system crash.

export enum Severity {
  TRC = 1,
  DBG = 5,
  INF = 9,
  ERR = 17,
  FTL = 21,
}

export class Logs {
  constructor(protected ctx: Context) {}

  protected log(sev: Severity, desc: string) {
    const id = id128.Ulid.generate()
    const data = logfmt.stringify({
      ts: id.time.toLocaleString(),
      sev,
      id: id.toCanonical(),
      desc
    })

    console.log(data)

    // save to db
    this.ctx.db.insert(logs).values({
      id: id.toCanonical(),
      severity: sev,
      data: desc,
    }).run()
  }
}
