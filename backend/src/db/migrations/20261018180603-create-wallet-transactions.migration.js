'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('wallet_transactions', {
      wallet_transaction_id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      wallet_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'wallets', key: 'wallet_id' }
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'players', key: 'player_id' }
      },
      type: {
        type: Sequelize.STRING(32),
        allowNull: false
      },
      direction: {
        type: Sequelize.STRING(8),
        allowNull: false
      },
      amount: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      balance_before: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      balance_after: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      reference_type: {
        type: Sequelize.STRING(16),
        allowNull: true
      },
      reference_id: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      idempotency_key: {
        type: Sequelize.STRING(128),
        allowNull: false,
        unique: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    })

    await queryInterface.addIndex('wallet_transactions', ['wallet_id', 'wallet_transaction_id'])

    // The ledger is append-only: every row must add up, and nothing may be
    // rewritten or removed afterwards.
    await queryInterface.sequelize.query(`
      ALTER TABLE wallet_transactions
        ADD CONSTRAINT wallet_transactions_amount_positive CHECK (amount > 0),
        ADD CONSTRAINT wallet_transactions_direction_check CHECK (direction IN ('CREDIT', 'DEBIT')),
        ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN (
          'SIGNUP_BONUS', 'DAILY_BONUS', 'REFILL_BONUS', 'PROMO_BONUS', 'BET', 'WIN', 'REFUND', 'ADMIN_ADJUST'
        )),
        ADD CONSTRAINT wallet_transactions_reference_type_check CHECK (
          reference_type IS NULL OR reference_type IN ('ROUND', 'BET', 'BONUS', 'ADMIN')
        ),
        ADD CONSTRAINT wallet_transactions_balance_math CHECK (
          balance_after = balance_before + CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END
          AND balance_after >= 0
        );

      CREATE FUNCTION wallet_transactions_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_transactions is append-only (% is not allowed)', TG_OP;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER wallet_transactions_append_only
        BEFORE UPDATE OR DELETE ON wallet_transactions
        FOR EACH ROW EXECUTE FUNCTION wallet_transactions_append_only();
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('wallet_transactions')
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS wallet_transactions_append_only()')
  }
}
