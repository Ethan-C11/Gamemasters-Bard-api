import { AudioTrack } from "../../infrastructure/db/entities/audioTrack.entity.js";
import { AudioTrackResponse } from "../dtos/soundTrack.schema.js";

export function toAudioTrackDto(sound: AudioTrack | null): AudioTrackResponse | null {
    if (!sound)
        return null;

    return {
        key: sound.storageKey,
        name: sound.name,
        type: sound.type,
        zone: sound.zone,
        ambiance: sound.ambiance,
        isUserImported: sound.isUserImported,
    };
}
