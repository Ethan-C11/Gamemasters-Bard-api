import {PlaybackAction} from "../../shared/enums/PlaybackAction.js";

export interface SessionTarget {
    sessionId: number;
}

export interface PlaybackCommand extends SessionTarget {
    action: PlaybackAction;
}

export function isSessionTarget(payload: unknown): payload is SessionTarget {
    if (typeof payload !== "object" || payload === null)
        return false;

    return Number.isInteger((payload as SessionTarget).sessionId);
}

export function isPlaybackCommand(payload: unknown): payload is PlaybackCommand {
    if (!isSessionTarget(payload))
        return false;

    return Object.values(PlaybackAction).includes((payload as PlaybackCommand).action);
}
