'use strict'

// Players sign in with Google or Apple (or play as guests): passwords and the
// players.email column go, and provider accounts live in player_identities.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('player_identities', {
      player_identity_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'players', key: 'player_id' },
        onDelete: 'CASCADE'
      },
      provider: {
        type: Sequelize.STRING(16),
        allowNull: false
      },
      subject: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(254),
        allowNull: true
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: false
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
      ALTER TABLE player_identities
        ADD CONSTRAINT player_identities_provider_check CHECK (provider IN ('google', 'apple')),
        ADD CONSTRAINT player_identities_one_owner UNIQUE (provider, subject),
        ADD CONSTRAINT player_identities_one_per_provider UNIQUE (player_id, provider);
      DROP INDEX IF EXISTS players_email_lower_unique;
      ALTER TABLE players DROP COLUMN password_hash, DROP COLUMN email;
    `)
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.addColumn('players', 'password_hash', { type: Sequelize.STRING, allowNull: true })
    await queryInterface.addColumn('players', 'email', { type: Sequelize.STRING, allowNull: true })
    await queryInterface.sequelize.query('CREATE UNIQUE INDEX players_email_lower_unique ON players (lower(email)) WHERE email IS NOT NULL')
    await queryInterface.dropTable('player_identities')
  }
}
