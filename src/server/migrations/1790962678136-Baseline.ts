import {
  Table,
  TableForeignKey,
  TableIndex,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';

/**
 * Schema as it was created by `synchronize` before migrations existed. Tables
 * that already exist are left alone, so databases created by the old
 * auto-sync simply record this migration as applied. Constraint names match
 * TypeORM's generated names so later `migration:generate` runs report no drift.
 */
export class Baseline1790962678136 implements MigrationInterface {
  name = 'Baseline1790962678136';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      await queryRunner.createTable(
        new Table({
          name: 'users',
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'email', type: 'varchar', length: '320' },
            { name: 'password_hash', type: 'varchar' },
            { name: 'role', type: 'varchar' },
            { name: 'created_at', type: 'varchar' },
          ],
          uniques: [{ name: 'UQ_97672ac88f789774dd47f7c8be3', columnNames: ['email'] }],
        }),
      );
    }

    if (!(await queryRunner.hasTable('sessions'))) {
      await queryRunner.createTable(
        new Table({
          name: 'sessions',
          columns: [
            { name: 'token_hash', type: 'varchar', isPrimary: true },
            { name: 'user_id', type: 'varchar' },
            { name: 'expires_at', type: 'varchar' },
            { name: 'created_at', type: 'varchar' },
          ],
        }),
      );
      await queryRunner.createIndex(
        'sessions',
        new TableIndex({ name: 'IDX_9cfe37d28c3b229a350e086d94', columnNames: ['expires_at'] }),
      );
    }

    if (!(await queryRunner.hasTable('forms'))) {
      await queryRunner.createTable(
        new Table({
          name: 'forms',
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'owner_id', type: 'varchar' },
            { name: 'document', type: 'text' },
            { name: 'created_at', type: 'varchar' },
            { name: 'updated_at', type: 'varchar' },
          ],
        }),
      );
      await queryRunner.createIndex(
        'forms',
        new TableIndex({
          name: 'IDX_68a380ed040b99428b8f1e83a9',
          columnNames: ['owner_id', 'updated_at'],
        }),
      );
      await queryRunner.createForeignKey(
        'forms',
        new TableForeignKey({
          name: 'FK_b7fa0713ef35842141009064ff1',
          columnNames: ['owner_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    if (!(await queryRunner.hasTable('submissions'))) {
      await queryRunner.createTable(
        new Table({
          name: 'submissions',
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'form_id', type: 'varchar' },
            { name: 'document', type: 'text' },
            { name: 'submitted_at', type: 'varchar' },
          ],
        }),
      );
      await queryRunner.createIndex(
        'submissions',
        new TableIndex({
          name: 'IDX_3675ac394dccf5a1a81d380734',
          columnNames: ['form_id', 'submitted_at'],
        }),
      );
      await queryRunner.createForeignKey(
        'submissions',
        new TableForeignKey({
          name: 'FK_82318f9579f8f3df8480d46990f',
          columnNames: ['form_id'],
          referencedTableName: 'forms',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  async down(): Promise<void> {
    throw new Error('Baseline migration cannot be reverted');
  }
}
