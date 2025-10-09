import { startEditor } from './src/editor/editor';
import type { Entities } from './src/entities';
import type { Entity } from './src/entity';
import { RoomLoader } from './src/loader';
import { Player } from './src/player';
import type { Room } from './src/room';

// Run the TUI editor
// startEditor()

interface GameState {
    currRoom: string,
}

const gameState: GameState = {
    currRoom: "test_level"
};

const loader: RoomLoader = new RoomLoader(gameState.currRoom);
const room = await loader.load();
const entities: Entities = room.getEntities();

let out: string = "";
let grid = room.getGrid();
let entitiesCopy: Entities = entities;
const player: Player = new Player(10/2,10/2);

/**
 * Checks if a position is valid for movement
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @returns true if the player can move to this position
 */
const canMoveTo = (x: number, y: number): boolean => {
    // Check bounds
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0]!.length) {
        return false;
    }
    
    // Get the tile at the target position
    const tileData = grid[y]![x];
    if (!tileData) {
        return false;
    }
    
    // Get the entity for this tile
    const entity = entities.getById(tileData.instanceId);
    if (!entity) {
        return false;
    }
    
    // Check if the entity has a solid flag
    const flags = entity.getFlags() as { is_solid?: boolean };
    if (flags.is_solid === true) {
        return false;
    }
    
    return true;
};

process.stdin.setEncoding("utf-8");
process.stdin.setRawMode(true);
process.stdin.resume();

function draw(){
    let out: string = "";
    for(let y = 0; y < grid.length; y++){
        for(let x = 0; x < grid[y]!.length; x++){
            if(player.getY() === y && player.getX() === x){
                out += "@";
            } else {
                const tileData = grid[y]![x];
                const entity: Entity | undefined = entities.getById(tileData!.instanceId);
                out += entity?.getSprite() || "?";
            }
        }
        out += "\n";
    }

    console.log(out);
}
console.clear();
draw();
process.stdin.on("data", (key: string)=>{
    switch(key){
        case "q":
            process.exit(0);
            break;
        case "w":
            player.tryDecrementY(canMoveTo);
            break;
        case "d":
            player.tryIncrementX(canMoveTo);
            break;
        case "s":
            player.tryIncrementY(canMoveTo);
            break;
        case "a":
            player.tryDecrementX(canMoveTo);
            break;
    }
    console.clear();
    draw();
})
