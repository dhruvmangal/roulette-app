'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('rounds', {
      round_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      room_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'rooms', key: 'room_id' },
        onDelete: 'CASCADE'
      },
      round_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      winning_pocket: {
        type: Sequelize.STRING(2),
        allowNull: true
      },
      phase_ends_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      result_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      seed_hash: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      seed: {
        type: Sequelize.STRING(64),
        allowNull: true
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
      ALTER TABLE rounds
        ADD CONSTRAINT rounds_status_check CHECK (status IN ('BETTING', 'BETS_CLOSED', 'SPINNING', 'SETTLED', 'CANCELLED')),
        ADD CONSTRAINT rounds_pocket_once_spun CHECK (
          (status IN ('SPINNING', 'SETTLED')) = (winning_pocket IS NOT NULL) OR status = 'CANCELLED'
        ),
        ADD CONSTRAINT rounds_one_per_number UNIQUE (room_id, round_number);
      -- At most one round in play per room.
      CREATE UNIQUE INDEX rounds_one_live_per_room ON rounds (room_id) WHERE status IN ('BETTING', 'BETS_CLOSED', 'SPINNING');
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('rounds')
  }
}
