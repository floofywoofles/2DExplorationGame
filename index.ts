import { startEditor } from './src/editor/editor';
import type { Entities } from './src/entities';
import type { Entity } from './src/entity';
import { RoomLoader } from './src/loader';
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

for(let i = 0; i < grid.length; ++i){
    for(let j = 0; j < grid[i]!.length; ++j){
        const tileData = grid[i]![j];
        const entity: Entity | undefined = entities.getById(tileData!.instanceId);
        out += entity?.getSprite() || "?";
    }
    out += "\n";
}

console.log(out);
