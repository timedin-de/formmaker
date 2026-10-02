import type { MigrationInterface } from 'typeorm';
import { Baseline1790962678136 } from './1790962678136-Baseline.js';

/**
 * Listed explicitly (no glob): the server is bundled with ncc, which cannot
 * resolve migration files from disk at runtime. Append new migrations here.
 */
export const migrations: (new () => MigrationInterface)[] = [Baseline1790962678136];
