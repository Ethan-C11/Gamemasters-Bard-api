import { DataSource } from 'typeorm'
import { User } from './entities/user.entity.js'
import { Session } from './entities/session.entity.js'
import { AudioTrack } from './entities/audioTrack.entity.js'
import { ActivationToken } from './entities/activationToken.entity.js'
import { RefreshToken } from './entities/refreshToken.entity.js'

export const AppDataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [User, Session, AudioTrack, ActivationToken, RefreshToken],
    migrations: ['src/infrastructure/db/migrations/*.ts'],
    synchronize: true,
})
