import convict from 'convict'
import dotenv from 'dotenv'
import fs from 'fs'

if (fs.existsSync('.env')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env'))

  for (const key in envConfig) {
    process.env[key] = envConfig[key]
  }
}

const config = convict({
  app: {
    name: {
      doc: 'Name of the service',
      format: String,
      default: 'BackendBoilerplate',
      env: 'APP_NAME'
    },
    url: {
      doc: 'URL of the service',
      format: String,
      default: 'backend-boilerplate:8080',
      env: 'APP_URL'
    }
  },

  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'staging', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },

  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 8080,
    env: 'PORT'
  },

  origin: {
    doc: 'cors origin',
    format: String,
    default: '*',
    env: 'ORIGIN'
  },

  db: {
    name: {
      doc: 'Database Name',
      format: String,
      default: 'backend_boilerplate',
      env: 'DB_NAME'
    },
    username: {
      doc: 'Database user',
      format: String,
      default: 'postgres',
      env: 'DB_USERNAME'
    },
    password: {
      doc: 'Database password',
      format: '*',
      default: 'postgres',
      env: 'DB_PASSWORD'
    },
    readHost: {
      doc: 'DB read host',
      format: String,
      default: '127.0.0.1',
      env: 'DB_READ_HOST'
    },
    writeHost: {
      doc: 'DB write host',
      format: String,
      default: '127.0.0.1',
      env: 'DB_WRITE_HOST'
    },
    port: {
      doc: 'DB PORT',
      format: 'port',
      default: 5432,
      env: 'DB_PORT'
    }
  },

  redis_db: {
    password: {
      doc: 'Redis Database password',
      format: '*',
      default: '',
      env: 'REDIS_DB_PASSWORD'
    },
    host: {
      doc: 'Redis DB host',
      format: String,
      default: '127.0.0.1',
      env: 'REDIS_DB_HOST'
    },
    port: {
      doc: 'Redis DB PORT',
      format: 'port',
      default: 6379,
      env: 'REDIS_DB_PORT'
    }
  },

  log_level: {
    doc: 'level of logs to show',
    format: String,
    default: 'debug',
    env: 'LOG_LEVEL'
  },

  jwt: {
    loginTokenSecret: {
      doc: 'Secret used to sign login JWTs',
      format: '*',
      default: '',
      env: 'JWT_LOGIN_SECRET'
    },
    loginTokenExpiry: {
      doc: 'Access token expiry; short, because clients refresh it silently',
      format: String,
      default: '15m',
      env: 'JWT_LOGIN_TOKEN_EXPIRY'
    },
    refreshTokenSecret: {
      doc: 'Secret used to sign refresh JWTs; must differ from loginTokenSecret',
      format: '*',
      default: '',
      env: 'JWT_REFRESH_SECRET'
    },
    refreshTokenExpiry: {
      doc: 'Refresh JWT expiry; also how long a guest stays signed in without playing',
      format: String,
      default: '30d',
      env: 'JWT_REFRESH_TOKEN_EXPIRY'
    }
  },

  auth: {
    googleClientIds: {
      doc: 'Comma-separated Google OAuth client IDs whose ID tokens are accepted (web, Android, iOS); empty disables Google sign-in',
      format: String,
      default: '',
      env: 'GOOGLE_CLIENT_IDS'
    },
    appleClientIds: {
      doc: 'Comma-separated Apple audiences accepted (the iOS bundle ID and the web Services ID); empty disables Apple sign-in',
      format: String,
      default: '',
      env: 'APPLE_CLIENT_IDS'
    },
    discordClientId: {
      doc: 'Application ID of the Discord app that hosts the game as an Activity; empty turns Discord off',
      format: String,
      default: '',
      env: 'DISCORD_CLIENT_ID'
    },
    discordClientSecret: {
      doc: 'That Discord app\'s OAuth2 client secret, used to exchange the login code for the player\'s identity',
      format: '*',
      default: '',
      env: 'DISCORD_CLIENT_SECRET'
    }
  },

  admin: {
    tokenSecret: {
      doc: 'Secret used to sign admin app JWTs; must differ from the player secrets',
      format: '*',
      default: '',
      env: 'JWT_ADMIN_SECRET'
    },
    tokenExpiry: {
      doc: 'How long an admin stays signed in',
      format: String,
      default: '8h',
      env: 'JWT_ADMIN_TOKEN_EXPIRY'
    },
    bootstrapEmail: {
      doc: 'At startup, create this admin if no admin has this email yet',
      format: String,
      default: '',
      env: 'ADMIN_BOOTSTRAP_EMAIL'
    },
    bootstrapPassword: {
      doc: 'Password for the bootstrap admin; used only when it is first created',
      format: '*',
      default: '',
      env: 'ADMIN_BOOTSTRAP_PASSWORD'
    }
  },

  game: {
    awayUnseatSeconds: {
      doc: 'How long a seated player can be gone from a table before their seat is given up',
      format: 'nat',
      default: 600,
      env: 'GAME_AWAY_UNSEAT_SECONDS'
    }
  },

  socket: {
    encryptionKey: {
      doc: 'Key used to encrypt socket handshake payloads',
      format: '*',
      default: '',
      env: 'SOCKET_ENCRYPTION_KEY'
    },
    maxPerUserConnection: {
      doc: 'Max concurrent socket connections allowed per user',
      format: Number,
      default: 2,
      env: 'SOCKET_MAX_PER_USER_CONNECTION'
    }
  },

  frontendUrl: {
    doc: 'Frontend Url',
    format: String,
    default: '',
    env: 'FRONTEND_URL'
  },

  // What lets https invite and referral links open the mobile app (App Links on Android,
  // Universal Links on iOS): the site vouches for the app at /.well-known/. Empty serves nothing.
  appLinks: {
    appleTeamId: {
      doc: 'Apple Developer Team ID that signs the iOS app, e.g. ABCDE12345',
      format: String,
      default: '',
      env: 'APPLE_TEAM_ID'
    },
    androidCertSha256: {
      doc: 'Comma-separated SHA-256 fingerprints of the certificates that sign the Android app (Play App Signing key and upload key)',
      format: String,
      default: '',
      env: 'ANDROID_CERT_SHA256'
    }
  },

  push: {
    fcmServiceAccount: {
      doc: 'A Firebase service account key as JSON (or base64 of it), for sending push notifications; empty turns push off',
      format: String,
      default: '',
      env: 'FCM_SERVICE_ACCOUNT_JSON',
      sensitive: true
    },
    apns: {
      key: {
        doc: 'The Apple push key (.p8 file) as text or base64, for notifications to iPhones; empty turns them off',
        format: String,
        default: '',
        env: 'APNS_KEY',
        sensitive: true
      },
      keyId: { doc: 'The Apple push key\'s ID', format: String, default: '', env: 'APNS_KEY_ID' },
      teamId: { doc: 'The Apple Developer Team ID', format: String, default: '', env: 'APNS_TEAM_ID' },
      bundleId: { doc: 'The iOS app\'s bundle ID', format: String, default: '', env: 'APNS_BUNDLE_ID' },
      production: { doc: 'True for App Store and TestFlight builds; false for builds run from Xcode', format: Boolean, default: false, env: 'APNS_PRODUCTION' }
    }
  },

  trustProxy: {
    doc: 'How many proxies sit in front of the app (nginx, Railway\'s edge), so req.ip is the client, not the proxy',
    format: 'nat',
    default: 0,
    env: 'TRUST_PROXY'
  },

  rate_limit_opt_timewindow: {
    doc: 'Rate limit time window (in minutes)',
    format: Number,
    default: 2,
    env: 'RATE_LIMIT_OPT_TIMEWINDOW'
  },

  rate_limit_opt_max_requests: {
    doc: 'Rate limit max requests within the time window',
    format: Number,
    default: 5,
    env: 'RATE_LIMIT_OPT_MAX_REQUESTS'
  }
})

config.validate({ allowed: 'strict' })

export default config
