import path from "path"
import { Room } from "./room";
import type { Tile } from "./types/tileData";
import type { RoomData } from "./types/roomData";
import { Entity } from "./entity";
import { Entities } from "./entities";

export class RoomLoader {
    private room: string;
    constructor(room: string){
        this.room = room;
    }

    getRoom(): string {
        return this.room;
    }

    private async loadTileConfig(tileName: string): Promise<{ sprite: string; flags: object }> {
        // Try to load from tiles directory first, then items directory
        let tileFile;
        try {
            tileFile = await Bun.file(path.resolve(__dirname, "tiles", `${tileName}.json`)).json();
        } catch (error) {
            // If not found in tiles, try items directory
            try {
                tileFile = await Bun.file(path.resolve(__dirname, "items", `${tileName}.json`)).json();
            } catch (itemError) {
                console.error(`[LOADER] Could not find tile/item: ${tileName}`);
                throw new Error(`Tile/item '${tileName}' not found in tiles/ or items/ directories`);
            }
        }
        return {
            sprite: tileFile.sprite || "?",
            flags: tileFile.flags || {}
        };
    }

    async load(): Promise<Room> {
        const file: RoomData = await Bun.file(path.resolve(__dirname, "rooms", `${this.room}.json`)).json();

        const width: number = file.width;
        const height: number = file.height
        const grid: Array<Array<Tile>> = file.grid;
        const entities: Entities = new Entities();

        for(let i = 0; i < file.grid.length; ++i){
            for(let j = 0; j < file.grid[i]!.length; ++j){
                const tileData: Tile|undefined = file.grid[i]![j];

                if(!tileData){
                    console.error("[LOADER][LOAD] Tile is undefined");
                    process.exit(-1);
                }

                const tileConfig = await this.loadTileConfig(tileData.tile);
                const entity: Entity = new Entity(
                    tileData.tile,
                    tileConfig.sprite,
                    tileData.instanceId,
                    { ...tileConfig.flags, ...tileData.flags },
                    tileData.items || []
                );
                entities.add(entity);
            }
        }

        const room: Room = new Room(height, width, grid, entities);
        return room;
    }
}
