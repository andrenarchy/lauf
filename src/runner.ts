import pg from 'pg'

import { Migration, MigrationOptions } from './migration.js'

interface RunnerOptions {
  pgClient: pg.Client
  table: string
  logger: (msg: string) => void
}

export interface AppliedMigration<O extends MigrationOptions> {
  id: string
  timestamp: Date
  migration: Migration<O>
}

export async function initMigrations({ pgClient, table }: RunnerOptions) {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY,
      sort INTEGER GENERATED ALWAYS AS IDENTITY,
      timestamp TIMESTAMPTZ NOT NULL
    )
  `)
}

export async function compareMigrations<O extends MigrationOptions>(migrations: Migration<O>[], options: RunnerOptions) {
  const { rows } = await options.pgClient.query<{id:  string; timestamp: Date }>(`SELECT id, timestamp FROM ${options.table} ORDER BY sort`)

  // match migrations with applied migrations
  const appliedMigrations: AppliedMigration<O>[] = rows.map((row, idx) => {
    const migration = migrations[idx]
    if (!migration)
      throw new Error(`Applied migration ${row.id} not found in migrations.`)
    if (row.id !== migration.id)
      throw new Error(`Applied migration ${row.id} (index ${idx}, timestamp ${row.timestamp.toISOString()}) does not match migration ${migration.id}.`)
    return {
      ...row,
      migration,
    }
  })

  return {
    appliedMigrations,
    remainingMigrations: migrations.slice(appliedMigrations.length)
  }
}

async function transactionWrapper<T>(pgClient: pg.Client, f: () => Promise<T>): Promise<T> {
  try {
    await pgClient.query('BEGIN')
    const result = await f()
    await pgClient.query('COMMIT')
    return result
  } catch (error) {
    await pgClient.query('ROLLBACK')
    throw error
  }
}

async function migrateUp<O extends MigrationOptions>(migration: Migration<O>, options: O, { pgClient, table, logger }: RunnerOptions) {
  logger(`Applying migration ${migration.id}${migration.description ? ` (${migration.description})` : ''}...`)
  await transactionWrapper(pgClient, async () => {
    await migration.up(options)
    await pgClient.query({
      text: `INSERT INTO ${table}(id, timestamp) VALUES($1, NOW())`,
      values: [migration.id]
    })
  })
  logger(`Applied migration ${migration.id}.`)
}

async function migrateDown<O extends MigrationOptions>(migration: Migration<O>, options: O, { pgClient, table, logger }: RunnerOptions) {
  logger(`Reverting migration ${migration.id}${migration.description ? ` (${migration.description})` : ''}...`)
  await transactionWrapper(pgClient, async () => {
    await migration.down(options)
    await pgClient.query({
      text: `DELETE FROM ${table} WHERE id = $1`,
      values: [migration.id]
    })
  })
  logger(`Reverted migration ${migration.id}.`)
}

export interface RunMigrationsOptions<O extends MigrationOptions> {
  setup: () => Promise<O>
  teardown: (o: O) => Promise<void>
  migrations: Migration<O>[]
  mode: 'latest' | 'up' | 'down'
  logger: (msg: string) => void
  table: string
}

export async function runMigrations<O extends MigrationOptions>({
  setup,
  teardown,
  migrations,
  mode = 'latest',
  logger = console.log,
  table = '_migrations'
}: RunMigrationsOptions<O>) {
  const options = await setup()

  const runnerOptions: RunnerOptions = {
    pgClient: options.pgClient,
    table,
    logger,
  }

  await initMigrations(runnerOptions)

  const { appliedMigrations, remainingMigrations } = await compareMigrations(migrations, runnerOptions)

  switch (mode) {
    case 'down': {
      if (appliedMigrations.length === 0) {
        logger('No applied migrations to undo.')
        return
      }
      await migrateDown(appliedMigrations[appliedMigrations.length - 1].migration, options, runnerOptions)
      break
    }
    case 'up': {
      if (remainingMigrations.length === 0) {
        logger('No migrations to apply.')
        return
      }
      await migrateUp(remainingMigrations[0], options, runnerOptions)
      break
    }
    case 'latest': {
      if (remainingMigrations.length === 0) {
        logger('No migrations to apply.')
        return
      }
      for (const migration of remainingMigrations) {
        await migrateUp(migration, options, runnerOptions)
      }
      break
    }
  }

  await teardown(options)
}
