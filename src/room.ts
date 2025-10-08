import type { Entity } from "./entity";
import type { Tile } from "./types/tileData";

export class Room {
    private width: number;
    private height: number;
    private grid: Array<Array<Tile>>;
    private entities: Entity[];

    constructor(height: number, width: number, grid: Array<Array<Tile>>, entities: Entity[] = []){
        this.height = height;
        this.width = width;
        this.grid = grid;
        this.entities = entities;
    }

    getWidth(): number {
        return this.width;
    }

    getHeight(): number {
        return this.height;
    }

    getGrid(): Array<Array<Tile>> {
        return this.grid;
    }
}
