'use strict'

// A shared link tapped before the app was installed, kept for a day so the app can pick it up
// on its first launch. Matched by IP address and phone type, so it is only ever a best guess.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('deferred_links', {
      deferred_link_id: { type: Sequelize.BIGINT, autoIncrement: true, allowNull: false, primaryKey: true },
      ip: { type: Sequelize.STRING(45), allowNull: false },
      platform: { type: Sequelize.STRING(8), allowNull: false },
      kind: { type: Sequelize.STRING(8), allowNull: false },
      code: { type: Sequelize.STRING(12), allowNull: false },
      consumed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
    await queryInterface.sequelize.query(`
      ALTER TABLE deferred_links
        ADD CONSTRAINT deferred_links_platform_check CHECK (platform IN ('ios', 'android')),
        ADD CONSTRAINT deferred_links_kind_check CHECK (kind IN ('join', 'ref'));
    `)
    await queryInterface.addIndex('deferred_links', ['ip', 'platform', 'created_at'])
  },

  async down (queryInterface) {
    await queryInterface.dropTable('deferred_links')
  }
}
