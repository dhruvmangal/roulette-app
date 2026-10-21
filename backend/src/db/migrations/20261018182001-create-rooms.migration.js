'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('rooms', {
      room_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING(6),
        allowNull: false,
        unique: true
      },
      variant: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      mode: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      max_seats: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 8
      },
      total_rounds: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      min_bet: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      max_bet: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      betting_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'OPEN'
      },
      host_player_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'players', key: 'player_id' }
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
      ALTER TABLE rooms
        ADD CONSTRAINT rooms_variant_check CHECK (variant IN ('AMERICAN', 'ENGLISH')),
        ADD CONSTRAINT rooms_mode_check CHECK (mode IN ('VS_COMPUTER', 'PRIVATE', 'PUBLIC')),
        ADD CONSTRAINT rooms_status_check CHECK (status IN ('OPEN', 'ENDED')),
        ADD CONSTRAINT rooms_max_seats_check CHECK (max_seats BETWEEN 1 AND 8),
        ADD CONSTRAINT rooms_total_rounds_check CHECK (total_rounds IS NULL OR total_rounds > 0),
        ADD CONSTRAINT rooms_bet_limits_check CHECK (min_bet > 0 AND max_bet >= min_bet);
      CREATE INDEX rooms_open_public ON rooms (variant) WHERE status = 'OPEN' AND mode = 'PUBLIC';
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('rooms')
  }
}
