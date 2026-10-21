'use strict'

// Players can sign in with Discord (the Discord Activity), so Discord accounts
// may be stored in player_identities.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE player_identities
        DROP CONSTRAINT player_identities_provider_check,
        ADD CONSTRAINT player_identities_provider_check CHECK (provider IN ('google', 'apple', 'discord'));
    `)
  },

  async down (queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM player_identities WHERE provider = 'discord';
      ALTER TABLE player_identities
        DROP CONSTRAINT player_identities_provider_check,
        ADD CONSTRAINT player_identities_provider_check CHECK (provider IN ('google', 'apple'));
    `)
  }
}
