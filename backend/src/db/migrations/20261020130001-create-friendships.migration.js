'use strict'

// Friends: a request from one player to another, which becomes a friendship when accepted.
// One row per pair, whichever way it was asked.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('friendships', {
      friendship_id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      requester_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      addressee_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'players', key: 'player_id' }, onDelete: 'CASCADE' },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'PENDING' },
      responded_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.sequelize.query(`
      ALTER TABLE friendships
        ADD CONSTRAINT friendships_status_check CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
        ADD CONSTRAINT friendships_not_self CHECK (requester_id <> addressee_id);
      CREATE UNIQUE INDEX friendships_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
      CREATE INDEX friendships_addressee ON friendships (addressee_id, status);
      CREATE INDEX friendships_requester ON friendships (requester_id, status);
    `)
  },

  async down (queryInterface) {
    await queryInterface.dropTable('friendships')
  }
}
