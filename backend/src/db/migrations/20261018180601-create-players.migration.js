'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('players', {
      player_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      username: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: true
      },
      is_guest: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'active'
      },
      avatar: {
        type: Sequelize.STRING,
        allowNull: true
      },
      country: {
        type: Sequelize.STRING(2),
        allowNull: true
      },
      token_version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      last_login_at: {
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

    await queryInterface.sequelize.query(`
      ALTER TABLE players ADD CONSTRAINT players_status_check CHECK (status IN ('active', 'banned', 'inactive'));
      CREATE UNIQUE INDEX players_username_lower_unique ON players (lower(username));
      CREATE UNIQUE INDEX players_email_lower_unique ON players (lower(email)) WHERE email IS NOT NULL;
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('players')
  }
}
