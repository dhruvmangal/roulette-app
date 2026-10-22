'use strict'

// The round runner's sweep (every 5 seconds) and the away-seat check (every minute)
// look only at open rooms and at seats marked away; small partial indexes keep
// them from reading every room and seat ever played.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS rooms_open ON rooms (room_id) WHERE status = 'OPEN';
      CREATE INDEX IF NOT EXISTS room_players_away ON room_players (away_since) WHERE away_since IS NOT NULL AND left_at IS NULL;
    `)
  },

  async down (queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS rooms_open; DROP INDEX IF EXISTS room_players_away;')
  }
}
