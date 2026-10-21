'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface) {
    await queryInterface.bulkInsert('demos', [
      { name: 'Sample demo record', is_active: true, created_at: new Date(), updated_at: new Date() }
    ])
  },

  async down (queryInterface) {
    await queryInterface.bulkDelete('demos', null, {})
  }
}
