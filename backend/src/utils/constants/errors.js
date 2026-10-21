import { StatusCodes } from 'http-status-codes'

export const ERROR_MSG = {
  SERVER_ERROR: 'Something went wrong',
  EXISTS: 'Already exists',
  NOT_FOUND: 'Record not found',
  NOT_EXISTS: 'Does not exists',
  NOT_ALLOWED: 'This action is not allowed',
  FAILED: 'Failed',
  EMITTER_ERROR: 'Failed to emit socket event'
}

// Central registry of error types. Every error a service/controller can raise
// should be declared here with a stable, unique `errorCode`, so clients can
// key off it regardless of the (i18n-able) `description` text.
export const RequestInputValidationErrorType = {
  name: 'RequestInputValidationError',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'Please check the request data',
  errorCode: 1001
}

export const ResponseValidationErrorType = {
  name: 'ResponseInputValidationError',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: false,
  description: 'Response validation failed please refer json schema of response',
  errorCode: 1002
}

export const SocketRequestInputValidationErrorType = {
  name: 'SocketRequestInputValidationError',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'Please check the request data',
  errorCode: 1003
}

export const SocketResponseValidationErrorType = {
  name: 'SocketResponseValidationError',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: false,
  description: 'Response validation of socket failed please refer json schema of response',
  errorCode: 1004
}

export const InternalServerErrorType = {
  name: 'InternalServerError',
  statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
  isOperational: true,
  description: 'Internal Server Error',
  errorCode: 1005
}

export const InvalidSocketArgumentErrorType = {
  name: 'InvalidSocketArgumentError',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'Please provide, proper arguments eventName, [payloadObject], and [callback]',
  errorCode: 1006
}

export const UnAuthorizeUserErrorType = {
  name: 'UnAuthorize',
  statusCode: StatusCodes.FORBIDDEN,
  isOperational: true,
  description: 'Unauthorized',
  errorCode: 1007
}

export const InvalidTokenErrorType = {
  name: 'InvalidToken',
  statusCode: StatusCodes.UNAUTHORIZED,
  isOperational: true,
  description: 'Either access token not passed or it is expired',
  errorCode: 1008
}

export const TokenRequiredErrorType = {
  name: 'InvalidToken',
  statusCode: StatusCodes.UNAUTHORIZED,
  isOperational: true,
  description: 'Access token is required',
  errorCode: 1009
}

export const UserNotExistsErrorType = {
  name: 'UserNotExists',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'User does not exists',
  errorCode: 1010
}

export const NotFoundErrorType = {
  name: 'NotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'Record not found',
  errorCode: 1011
}

// Example domain error — delete once you add your own.
export const DemoErrorType = {
  name: 'DemoError',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'Demo record not found',
  errorCode: 1100
}

// Players and auth
export const UsernameTakenErrorType = {
  name: 'UsernameTaken',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'That username is already taken',
  errorCode: 1200
}

export const PlayerBannedErrorType = {
  name: 'PlayerBanned',
  statusCode: StatusCodes.FORBIDDEN,
  isOperational: true,
  description: 'This account has been banned',
  errorCode: 1203
}

export const PlayerInactiveErrorType = {
  name: 'PlayerInactive',
  statusCode: StatusCodes.FORBIDDEN,
  isOperational: true,
  description: 'This account is inactive',
  errorCode: 1204
}

export const InvalidRefreshTokenErrorType = {
  name: 'InvalidRefreshToken',
  statusCode: StatusCodes.UNAUTHORIZED,
  isOperational: true,
  description: 'The refresh token is invalid or has expired',
  errorCode: 1205
}

export const InvalidIdentityTokenErrorType = {
  name: 'InvalidIdentityToken',
  statusCode: StatusCodes.UNAUTHORIZED,
  isOperational: true,
  description: 'The Google, Apple or Discord sign-in could not be verified',
  errorCode: 1207
}

export const ProviderNotConfiguredErrorType = {
  name: 'ProviderNotConfigured',
  statusCode: StatusCodes.SERVICE_UNAVAILABLE,
  isOperational: true,
  description: 'This sign-in method is not set up on the server',
  errorCode: 1208
}

export const IdentityInUseErrorType = {
  name: 'IdentityInUse',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'That Google or Apple account already belongs to another player',
  errorCode: 1209
}

// Wallet
export const WalletNotFoundErrorType = {
  name: 'WalletNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'Wallet not found',
  errorCode: 1300
}

export const InsufficientBalanceErrorType = {
  name: 'InsufficientBalance',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'Not enough chips for this transaction',
  errorCode: 1301
}

export const IdempotencyKeyConflictErrorType = {
  name: 'IdempotencyKeyConflict',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'This idempotency key was already used for a different transaction',
  errorCode: 1302
}

// Bonuses
export const BonusNotFoundErrorType = {
  name: 'BonusNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'Bonus not found',
  errorCode: 1400
}

export const BonusNotAvailableErrorType = {
  name: 'BonusNotAvailable',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'This bonus cannot be claimed right now',
  errorCode: 1401
}

// Rooms and rounds
export const RoomNotFoundErrorType = {
  name: 'RoomNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'Room not found',
  errorCode: 1500
}

export const RoomFullErrorType = {
  name: 'RoomFull',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'Every seat at this table is taken',
  errorCode: 1501
}

export const RoomEndedErrorType = {
  name: 'RoomEnded',
  statusCode: StatusCodes.GONE,
  isOperational: true,
  description: 'This room has closed',
  errorCode: 1502
}

export const NotSeatedErrorType = {
  name: 'NotSeated',
  statusCode: StatusCodes.FORBIDDEN,
  isOperational: true,
  description: 'You are not seated at this table',
  errorCode: 1503
}

export const InvalidRoomSettingsErrorType = {
  name: 'InvalidRoomSettings',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'These room settings are not allowed',
  errorCode: 1504
}

export const NotRoomHostErrorType = {
  name: 'NotRoomHost',
  statusCode: StatusCodes.FORBIDDEN,
  isOperational: true,
  description: 'Only the table’s host can do that',
  errorCode: 1505
}

export const BettingClosedErrorType = {
  name: 'BettingClosed',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'Bets are closed for this round',
  errorCode: 1510
}

export const InvalidBetErrorType = {
  name: 'InvalidBet',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'That bet is not allowed on this table',
  errorCode: 1511
}

export const BetLimitErrorType = {
  name: 'BetLimit',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'That bet is outside the table limits',
  errorCode: 1512
}

export const BetNotFoundErrorType = {
  name: 'BetNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'Bet not found',
  errorCode: 1513
}

export const ChatRateLimitedErrorType = {
  name: 'ChatRateLimited',
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  isOperational: true,
  description: 'You are sending messages too quickly',
  errorCode: 1520
}

export const ChatMessageNotFoundErrorType = {
  name: 'ChatMessageNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'That message is not at your table',
  errorCode: 1521
}

export const NoPreviousBetsErrorType = {
  name: 'NoPreviousBets',
  statusCode: StatusCodes.BAD_REQUEST,
  isOperational: true,
  description: 'There are no bets from last round to repeat',
  errorCode: 1514
}

export const AdminLoginFailedErrorType = {
  name: 'AdminLoginFailed',
  statusCode: StatusCodes.UNAUTHORIZED,
  isOperational: true,
  description: 'Wrong email or password',
  errorCode: 1600
}

export const AdminUnauthorizedErrorType = {
  name: 'AdminUnauthorized',
  statusCode: StatusCodes.UNAUTHORIZED,
  isOperational: true,
  description: 'Sign in to the admin app again',
  errorCode: 1601
}

export const AdminNotConfiguredErrorType = {
  name: 'AdminNotConfigured',
  statusCode: StatusCodes.SERVICE_UNAVAILABLE,
  isOperational: true,
  description: 'The admin app is off: set JWT_ADMIN_SECRET',
  errorCode: 1602
}

export const PlayerNotFoundErrorType = {
  name: 'PlayerNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'Player not found',
  errorCode: 1603
}

export const ReferralCodeNotFoundErrorType = {
  name: 'ReferralCodeNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'That referral code doesn\'t match any player',
  errorCode: 1700
}

export const ReferralNotAllowedErrorType = {
  name: 'ReferralNotAllowed',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'This account can\'t use a referral code',
  errorCode: 1701
}

export const FriendRequestNotAllowedErrorType = {
  name: 'FriendRequestNotAllowed',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'You can\'t send that friend request',
  errorCode: 1710
}

export const FriendRequestNotFoundErrorType = {
  name: 'FriendRequestNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'That friend request is no longer there',
  errorCode: 1711
}

export const FriendNotFoundErrorType = {
  name: 'FriendNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'That player isn\'t on your friends list',
  errorCode: 1712
}

export const FriendInviteNotAllowedErrorType = {
  name: 'FriendInviteNotAllowed',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'You can\'t invite that friend to this table right now',
  errorCode: 1713
}

export const PlayerNameNotFoundErrorType = {
  name: 'PlayerNameNotFound',
  statusCode: StatusCodes.NOT_FOUND,
  isOperational: true,
  description: 'No player has that name',
  errorCode: 1714
}

export const AnnouncementNoRecipientsErrorType = {
  name: 'AnnouncementNoRecipients',
  statusCode: StatusCodes.CONFLICT,
  isOperational: true,
  description: 'No player matches that audience: nobody has a phone set up for notifications and allows them',
  errorCode: 1604
}

export const AnnouncementLimitReachedErrorType = {
  name: 'AnnouncementLimitReached',
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  isOperational: true,
  description: 'Too many announcements have gone out today. Try again tomorrow, or send to one player',
  errorCode: 1605
}

export const PushNotConfiguredErrorType = {
  name: 'PushNotConfigured',
  statusCode: StatusCodes.SERVICE_UNAVAILABLE,
  isOperational: true,
  description: 'Push notifications are off: set FCM_SERVICE_ACCOUNT_JSON for Android or APNS_KEY, APNS_KEY_ID and APNS_TEAM_ID for iPhone on the server',
  errorCode: 1606
}
