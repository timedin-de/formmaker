import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createDatabase } from './database.js';
import { Repository } from './repository.js';

/**
 * Closes the connection when the Nest app closes. Constructor injection uses an
 * explicit @Inject: tsx/esbuild does not emit decorator metadata, so Nest
 * cannot infer parameter types. Do the same in every injectable.
 */
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DataSource) private readonly source: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    await this.source.destroy().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    { provide: DataSource, useFactory: createDatabase },
    {
      provide: Repository,
      useFactory: (source: DataSource) => new Repository(source),
      inject: [DataSource],
    },
    DatabaseLifecycle,
  ],
  exports: [DataSource, Repository],
})
export class DatabaseModule {}
