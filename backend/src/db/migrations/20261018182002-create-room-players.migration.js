'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('room_players', {
      room_player_id: {
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
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'players', key: 'player_id' }
      },
      seat: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      is_bot: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      bot_profile: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      joined_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      left_at: {
        type: Sequelize.DATE,
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

    // A seat, and a player, can only be taken once among the people still
    // at the table; rows for players who left are kept for history.
    await queryInterface.sequelize.query(`
      ALTER TABLE room_players
        ADD CONSTRAINT room_players_seat_check CHECK (seat BETWEEN 1 AND 8),
        ADD CONSTRAINT room_players_bot_check CHECK (
          (is_bot AND player_id IS NULL AND bot_profile IS NOT NULL) OR (NOT is_bot AND player_id IS NOT NULL)
        );
      CREATE UNIQUE INDEX room_players_one_per_seat ON room_players (room_id, seat) WHERE left_at IS NULL;
      CREATE UNIQUE INDEX room_players_seated_once ON room_players (room_id, player_id) WHERE left_at IS NULL AND player_id IS NOT NULL;
      CREATE INDEX room_players_by_player ON room_players (player_id) WHERE left_at IS NULL;
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('room_players')
  }
}
