'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('bets', {
      bet_id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      round_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'rounds', key: 'round_id' },
        onDelete: 'CASCADE'
      },
      room_player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'room_players', key: 'room_player_id' }
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'players', key: 'player_id' }
      },
      bet_type: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      selection: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      amount: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      payout: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'PLACED'
      },
      request_id: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      debit_transaction_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'wallet_transactions', key: 'wallet_transaction_id' }
      },
      payout_transaction_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'wallet_transactions', key: 'wallet_transaction_id' }
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    })

    await queryInterface.sequelize.query(`
      ALTER TABLE bets
        ADD CONSTRAINT bets_amount_positive CHECK (amount > 0),
        ADD CONSTRAINT bets_status_check CHECK (status IN ('PLACED', 'WON', 'LOST', 'REFUNDED')),
        ADD CONSTRAINT bets_payout_check CHECK (payout IS NULL OR payout >= 0),
        -- Real players' bets are paid for from the ledger; bots' are not.
        ADD CONSTRAINT bets_paid_for CHECK (player_id IS NULL OR debit_transaction_id IS NOT NULL);
      CREATE INDEX bets_by_round ON bets (round_id, room_player_id);
      CREATE INDEX bets_by_player ON bets (player_id, bet_id) WHERE player_id IS NOT NULL;
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('bets')
  }
}
