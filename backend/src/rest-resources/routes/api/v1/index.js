import express from 'express'
import demoRoutes from './demo.routes'
import authRoutes from './auth.routes'
import playerRoutes from './player.routes'
import walletRoutes from './wallet.routes'
import bonusRoutes from './bonus.routes'
import roomRoutes from './room.routes'
import adminRoutes from './admin.routes'
import referralRoutes from './referral.routes'
import notificationRoutes from './notification.routes'
import friendRoutes from './friend.routes'
import achievementRoutes from './achievement.routes'
import linkRoutes from './link.routes'
import arcadeRoutes from './arcade.routes'

const v1Router = express.Router()

v1Router.use('/demo', demoRoutes)
v1Router.use('/auth', authRoutes)
v1Router.use('/players', playerRoutes)
v1Router.use('/wallet', walletRoutes)
v1Router.use('/bonuses', bonusRoutes)
v1Router.use('/rooms', roomRoutes)
v1Router.use('/referrals', referralRoutes)
v1Router.use('/notifications', notificationRoutes)
v1Router.use('/friends', friendRoutes)
v1Router.use('/achievements', achievementRoutes)
v1Router.use('/links', linkRoutes)
v1Router.use('/arcade', arcadeRoutes)
v1Router.use('/admin', adminRoutes)

export default v1Router
