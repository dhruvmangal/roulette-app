'use strict'

// A friend who joined with a player's referral code, and whether they have
// qualified for the reward yet.
module.exports = (sequelize, DataTypes) => {
  const Referral = sequelize.define('Referral', {
    referralId: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    referrerId: { type: DataTypes.INTEGER, allowNull: false },
    refereeId: { type: DataTypes.INTEGER, allowNull: false },
    code: { type: DataTypes.STRING(12), allowNull: false },
    // PENDING until the friend qualifies; then REWARDED, or REJECTED if it looks like the same person.
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PENDING' },
    rejectReason: { type: DataTypes.STRING(32), allowNull: true },
    referrerReward: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    refereeReward: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    rewardedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    tableName: 'referrals',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Referral.associate = (models) => {
    Referral.belongsTo(models.Player, { as: 'referrer', foreignKey: 'referrerId' })
    Referral.belongsTo(models.Player, { as: 'referee', foreignKey: 'refereeId' })
  }

  return Referral
}
