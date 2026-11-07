import { User } from "../../src/infrastructure/db/entities/user.entity.js";
import { Session } from "../../src/infrastructure/db/entities/session.entity.js";
import { AudioTrack } from "../../src/infrastructure/db/entities/audioTrack.entity.js";
import { Role } from "../../src/shared/enums/Role.js";
import { UserStatus } from "../../src/shared/enums/UserStatus.js";
import { SoundType } from "../../src/shared/enums/SoundType.js";
import { Zone } from "../../src/shared/enums/Zone.js";
import { Ambiance } from "../../src/shared/enums/Ambiance.js";
import { PlaybackStatus } from "../../src/shared/enums/PlaybackStatus.js";

export function makeUser(overrides: Partial<User> = {}): User {
    return Object.assign(new User(), {
        id: 1,
        username: "gamemaster",
        email: "gm@gm-test.test",
        hashedPassword: "hashed",
        lastConnection: null,
        role: Role.USER,
        userStatus: UserStatus.ACTIVE,
        deletionWarningSent: false,
        ...overrides,
    });
}

export function makeSession(overrides: Partial<Session> = {}): Session {
    const owner = overrides.owner ?? makeUser();
    return Object.assign(new Session(), {
        id: 10,
        sessionName: "Campaign",
        inviteCode: "ABC123",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        owner,
        sessionMembers: [owner],
        alreadyPlayedMusic: [],
        alreadyPlayedEnvironment: [],
        currentMusic: null,
        currentEnvironment: null,
        currentZone: null,
        currentAmbiance: null,
        playbackStartedAt: null,
        playbackStatus: PlaybackStatus.STOPPED,
        playbackPositionMs: 0,
        ...overrides,
    });
}

export function makeTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
    return Object.assign(new AudioTrack(), {
        id: 100,
        name: "Forest theme",
        storageKey: "sounds/0/forest.mp3",
        mimeType: "audio/mpeg",
        sizeInBytes: 1000,
        type: SoundType.MUSIC,
        zone: Zone.FOREST,
        ambiance: Ambiance.CALM,
        uploadedBy: null,
        isUserImported: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    });
}
