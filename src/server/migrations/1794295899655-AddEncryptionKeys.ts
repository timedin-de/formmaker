import { Table, type MigrationInterface, type QueryRunner } from 'typeorm';

/** Adds the per-user key pairs for end-to-end encrypted submissions. */
export class AddEncryptionKeys1794295899655 implements MigrationInterface {
  name = 'AddEncryptionKeys1794295899655';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'encryption_keys',
        columns: [
          { name: 'user_id', type: 'varchar', isPrimary: true },
          { name: 'key_id', type: 'varchar', length: '64' },
          { name: 'public_key', type: 'text' },
          { name: 'wrapped_private_key', type: 'text' },
          { name: 'created_at', type: 'varchar' },
          { name: 'updated_at', type: 'varchar' },
        ],
        foreignKeys: [
          {
            name: 'FK_ce78fd209b9c1118b9ca0a6593b',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('encryption_keys');
  }
}
