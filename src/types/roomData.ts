import type { Tile } from "./tileData";

export type RoomData = {
    width: number;
    height: number;
    grid: Array<Array<Tile>>
}
