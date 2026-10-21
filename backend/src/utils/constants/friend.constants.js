export const FRIENDSHIP_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED'
}

export const MAX_FRIENDS = 100
export const MAX_PENDING_REQUESTS = 30
// One invite to the same friend per this long, so an invite can't be sent over and over.
export const FRIEND_INVITE_COOLDOWN_SECONDS = 60

// Why a request or an invite was turned down (the error's details).
export const FRIEND_BLOCKS = {
  SELF: 'Self',
  ALREADY_FRIENDS: 'AlreadyFriends',
  YOU_HAVE_TOO_MANY: 'YouHaveTooMany',
  THEY_HAVE_TOO_MANY: 'TheyHaveTooMany',
  TOO_MANY_PENDING: 'TooManyPending',
  NOT_AT_THAT_TABLE: 'NotAtThatTable',
  TABLE_FULL: 'TableFull',
  ALREADY_THERE: 'AlreadyThere',
  TOO_SOON: 'TooSoon'
}
