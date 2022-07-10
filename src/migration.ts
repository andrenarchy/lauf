import pg from 'pg'

export type MigrationHandler<O> = (o: O) => Promise<unknown>

export interface MigrationOptions {
  pgClient: pg.Client
}

export interface Migration<O extends MigrationOptions = MigrationOptions> {
  id: string // needs to be unique
  description?: string
  up: MigrationHandler<O>
  down: MigrationHandler<O>
}
