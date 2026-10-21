'use strict'

// Bonus configuration; edit rows to change bonuses without a deploy.
module.exports = (sequelize, DataTypes) => {
  const Bonus = sequelize.define('Bonus', {
    bonusId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    code: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    // For DAILY this is day 1's amount; later streak days pay a multiple.
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    cooldownSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    maxClaims: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // REFILL: only claimable while the balance is below this.
    minBalanceThreshold: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    sequelize,
    tableName: 'bonuses',
    schema: 'public',
    timestamps: true,
    underscored: true
  })

  Bonus.associate = (models) => {
    Bonus.hasMany(models.PlayerBonus, { foreignKey: 'bonusId' })
  }

  return Bonus
}
