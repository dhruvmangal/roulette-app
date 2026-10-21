'use strict'

// Seats taken before presence tracking have no away mark, so they would never
// be released. Mark every seated player away; anyone actually connected is
// cleared again when they next join, and the release job checks for a live
// connection before giving up any seat.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface) {
    await queryInterface.sequelize.query(
      'UPDATE room_players SET away_since = now() WHERE left_at IS NULL AND NOT is_bot AND away_since IS NULL'
    )
  },

  async down () {}
}
