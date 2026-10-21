'use strict'

// Private tables wait in a lobby (WAITING) until their host starts the game.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE rooms
        DROP CONSTRAINT rooms_status_check,
        ADD CONSTRAINT rooms_status_check CHECK (status IN ('WAITING', 'OPEN', 'ENDED'));
    `)
  },

  async down (queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE rooms SET status = 'OPEN' WHERE status = 'WAITING';
      ALTER TABLE rooms
        DROP CONSTRAINT rooms_status_check,
        ADD CONSTRAINT rooms_status_check CHECK (status IN ('OPEN', 'ENDED'));
    `)
  }
}
