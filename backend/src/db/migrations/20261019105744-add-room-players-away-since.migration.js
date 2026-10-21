'use strict'

// When a seated player's last socket left the table. Rounds pause while
// nobody is present, and seats left empty too long are given up.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('room_players', 'away_since', { type: Sequelize.DATE, allowNull: true })
    await queryInterface.sequelize.query(
      'CREATE INDEX room_players_away ON room_players (away_since) WHERE left_at IS NULL AND away_since IS NOT NULL'
    )
  },

  async down (queryInterface) {
    await queryInterface.removeColumn('room_players', 'away_since')
  }
}
