import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository} from "typeorm";
import {AudioTrack} from "../../../infrastructure/db/entities/audioTrack.entity.js";
import {MinioStorageService} from "../../../infrastructure/storage/MinioStorageService.js";

export class DeleteUserUseCase {

    private static _instance: DeleteUserUseCase;

    private _audioTrackRepository: Repository<AudioTrack>;
    private _userRepository: Repository<User>;

    private constructor() {
        this._audioTrackRepository = AppDataSource.getRepository(AudioTrack);
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): DeleteUserUseCase {
        if (!DeleteUserUseCase._instance) {
            DeleteUserUseCase._instance = new DeleteUserUseCase();
        }
        return DeleteUserUseCase._instance;
    }

    async execute(userId: number, newUsername: string | undefined = undefined, newEmail : string | undefined = undefined, newPassword: string | undefined = undefined): Promise<User> {
        const user: User | null = await this._userRepository.findOneBy({ id: userId });
        if (!user)
            throw Error("User not found");

        try{
            const userSounds = await this._audioTrackRepository.findBy({ uploadedBy: {id: user.id}, isUserImported: true });
            let folders : string[] = []

            for (const soundTrack of userSounds) {
                await MinioStorageService.getInstance().delete(soundTrack.storageKey);
                await this._audioTrackRepository.remove(soundTrack)
                const folderArray = soundTrack.storageKey.split("/")
                const folder = folderArray[0] + "/" + folderArray[1] + "/" + folderArray[2];
                folders.push(folder)
            }

            folders = [...new Set(folders)]
            for (const folder of folders)
            {
                await MinioStorageService.getInstance().delete(folder);
            }

            const removedUser = await this._userRepository.remove(user);
            removedUser.id = userId;
            return removedUser;
        } catch(err) {
            throw err;
        }
    }
}
