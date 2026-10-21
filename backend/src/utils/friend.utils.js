import { FRIENDSHIP_STATUS } from '~/utils/constants/friend.constants'

/** The row between two players, whichever of them asked. */
export const findPair = async (Friendship, a, b, transaction) =>
  (await Friendship.findOne({ where: { requesterId: a, addresseeId: b }, transaction })) ??
  (await Friendship.findOne({ where: { requesterId: b, addresseeId: a }, transaction }))

/** How many accepted friends a player has. */
export const countFriends = async (Friendship, playerId, transaction) =>
  (await Friendship.count({ where: { requesterId: playerId, status: FRIENDSHIP_STATUS.ACCEPTED }, transaction })) +
  (await Friendship.count({ where: { addresseeId: playerId, status: FRIENDSHIP_STATUS.ACCEPTED }, transaction }))

/** The other player in a friendship row. */
export const otherPlayerId = (row, playerId) => (row.requesterId === playerId ? row.addresseeId : row.requesterId)
