'use strict'

// Settings an admin can change without a deploy: one row per setting, the value as JSON.
// A missing row means the setting's default.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('app_settings', {
      key: { type: Sequelize.STRING(48), allowNull: false, primaryKey: true },
      value: { type: Sequelize.JSONB, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
  },

  async down (queryInterface) {
    await queryInterface.dropTable('app_settings')
  }
}
