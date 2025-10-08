import { Room } from "./room";
import type { Tile } from "./types/tileData";
import type { RoomData } from "./types/roomData";
import type { Entity } from "./entity";

export class RoomLoader {
    private room: string;
    constructor(room: string){
        this.room = room;
    }

    getRoom(): string {
        return this.room;
    }

    async load(): Promise<Room> {
        const file: RoomData = await Bun.file(`${this.room}.json`).json();

        const width: number = file.width;
        const height: number = file.height
        const grid: Array<Array<Tile>> = file.grid;
        let entities: Entity[] = [];

        for(let i = 0; i < file.grid.length; ++i){
            for(let j = 0; j < file.grid[i]!.length; ++j){
                const tile: Tile|undefined = file.grid[i]![j];

                if(!tile){
                    console.error("[LOADER][LOAD] Tile is undefined");
                    process.exit(-1);
                }

                
            }
        }

        const room: Room = new Room(height, width, grid);

        return room;
    }
}
