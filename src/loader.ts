import path from "path"
import { Room } from "./room";
import type { Tile } from "./types/tileData";
import type { RoomData } from "./types/roomData";
import { Entity } from "./entity";

export class RoomLoader {
    private room: string;
    constructor(room: string){
        this.room = room;
    }

    getRoom(): string {
        return this.room;
    }

    async load(): Promise<Room> {
        const file: RoomData = await Bun.file(path.resolve(__dirname, "rooms", `${this.room}.json`)).json();

        const width: number = file.width;
        const height: number = file.height
        const grid: Array<Array<Tile>> = file.grid;
        let entities: Entity[] = [];

        for(let i = 0; i < file.grid.length; ++i){
            for(let j = 0; j < file.grid[i]!.length; ++j){
                const entity: Tile|undefined = file.grid[i]![j];

                if(!entity){
                    console.error("[LOADER][LOAD] Tile is undefined");
                    process.exit(-1);
                }

                switch(entity.tile){
                    case "wall":
                        const wallTile: Entity = new Entity(entity.tile, "#", entity.instanceId, entity.flags, entity.items);
                        entities.push(wallTile);
                        break;
                    case "ground":
                        const wallTile: Entity = new 
                }
            }
        }

        const room: Room = new Room(height, width, grid);
        return room;
    }
}
