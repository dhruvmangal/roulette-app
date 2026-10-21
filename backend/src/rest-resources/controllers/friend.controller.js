import { InviteFriendService, ListFriendsService, RemoveFriendService, RespondFriendRequestService, SendFriendRequestService } from '~/services/friend'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

const respond = (Service, argsFrom) => catchAsync(async (req, res, next) => {
  const { result, successful, errors } = await Service.execute({ playerId: req.user.playerId, ...argsFrom(req) }, req.context)
  sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
})

export default class FriendController {
  static list = respond(ListFriendsService, () => ({}))
  static request = respond(SendFriendRequestService, (req) => ({ username: req.body.username }))
  static accept = respond(RespondFriendRequestService, (req) => ({ friendshipId: Number(req.params.friendshipId), accept: true }))
  static decline = respond(RespondFriendRequestService, (req) => ({ friendshipId: Number(req.params.friendshipId), accept: false }))
  static remove = respond(RemoveFriendService, (req) => ({ friendPlayerId: Number(req.params.playerId) }))
  static invite = respond(InviteFriendService, (req) => ({ friendPlayerId: Number(req.params.playerId), code: req.body.code.toUpperCase() }))
}
