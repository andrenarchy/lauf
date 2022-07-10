import pg from 'pg'

export type MigrationHandler<O> = (o: O) => Promise<void>

export interface MigrationOptions {
  pgClient: pg.Client
}

export interface Migration<O extends MigrationOptions> {
  id: string // needs to be unique
  description?: string
  up: MigrationHandler<O>
  down: MigrationHandler<O>
}
