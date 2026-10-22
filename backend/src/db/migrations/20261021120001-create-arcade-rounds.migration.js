'use strict'

// The arcade games (crash, aviator, plinko, prize wheel, horse race): one row
// per play, for the chips staked and what came back.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('arcade_rounds', {
      arcade_round_id: { type: Sequelize.BIGINT, autoIncrement: true, allowNull: false, primaryKey: true },
      player_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      game: { type: Sequelize.STRING(16), allowNull: false },
      // ACTIVE only for a flight that is still in the air; every other game settles at once.
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'SETTLED' },
      stake: { type: Sequelize.BIGINT, allowNull: false },
      payout: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      // What the player picked and what came up (the crash point stays in here until the flight is over).
      outcome: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      request_id: { type: Sequelize.STRING(64), allowNull: false },
      started_at: { type: Sequelize.DATE, allowNull: false },
      settled_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.addConstraint('arcade_rounds', { fields: ['player_id', 'request_id'], type: 'unique', name: 'arcade_rounds_request_unique' })
    await queryInterface.addIndex('arcade_rounds', ['player_id', 'game', 'arcade_round_id'])
    await queryInterface.sequelize.query(`
      ALTER TABLE arcade_rounds
        ADD CONSTRAINT arcade_rounds_game_check CHECK (game IN ('CRASH', 'AVIATOR', 'PLINKO', 'WHEEL', 'HORSES')),
        ADD CONSTRAINT arcade_rounds_status_check CHECK (status IN ('ACTIVE', 'SETTLED')),
        ADD CONSTRAINT arcade_rounds_amounts_check CHECK (stake > 0 AND payout >= 0);
      -- One flight at a time per game.
      CREATE UNIQUE INDEX arcade_rounds_one_active ON arcade_rounds (player_id, game) WHERE status = 'ACTIVE';
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT wallet_transactions_reference_type_check,
        ADD CONSTRAINT wallet_transactions_reference_type_check CHECK (
          reference_type IS NULL OR reference_type IN ('ROUND', 'BET', 'BONUS', 'ADMIN', 'ARCADE')
        );
    `)
  },

  async down (queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE wallet_transactions
        DROP CONSTRAINT wallet_transactions_reference_type_check,
        ADD CONSTRAINT wallet_transactions_reference_type_check CHECK (
          reference_type IS NULL OR reference_type IN ('ROUND', 'BET', 'BONUS', 'ADMIN')
        );
    `)
    await queryInterface.dropTable('arcade_rounds')
  }
}
