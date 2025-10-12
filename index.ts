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

let loader: RoomLoader = new RoomLoader(gameState.currRoom);
let room = await loader.load();
let entities: Entities = room.getEntities();

let out: string = "";
let grid = room.getGrid();
let entitiesCopy: Entities = entities;
let player: Player = new Player(10 / 2, 10 / 2);

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

/**
 * Checks if a position contains a door and handles room transition
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @param direction - Direction the player is moving
 * @returns true if a door was found and room transition occurred
 */
const checkForDoor = async (x: number, y: number, direction: string): Promise<boolean> => {
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

    // Check if the entity has a door destination
    const doorFlags = entity.getFlags() as { to?: string };
    if (doorFlags.to && doorFlags.to.trim() !== "") {
        await goToDoorLocation(x, y, direction);
        return true;
    }

    return false;
};

process.stdin.setEncoding("utf-8");
if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
}
process.stdin.resume();

function draw() {
    let out: string = "";
    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y]!.length; x++) {
            if (player.getY() === y && player.getX() === x) {
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

/**
 * Finds the corresponding door in the destination room that connects back to the original room
 * @param destinationRoom - The room name to search for the door
 * @param destinationGrid - The grid of the destination room
 * @param destinationEntities - The entities of the destination room
 * @param originalRoomName - The room name we came from (what the return door should point to)
 * @returns The position of the destination door or null if not found
 */
function findDestinationDoor(destinationRoom: string, destinationGrid: any[][], destinationEntities: Entities, originalRoomName: string): { x: number; y: number } | null {
    for (let y = 0; y < destinationGrid.length; y++) {
        for (let x = 0; x < destinationGrid[y]!.length; x++) {
            const tileData = destinationGrid[y]![x];
            if (!tileData) continue;

            const entity = destinationEntities.getById(tileData.instanceId);
            if (!entity) continue;

            const doorFlags = entity.getFlags() as { to?: string };
            if (doorFlags.to === originalRoomName) {
                return { x, y };
            }
        }
    }
    return null;
}

/**
 * Calculates the position one block ahead of a door in the specified direction
 * @param doorX - X coordinate of the door
 * @param doorY - Y coordinate of the door
 * @param direction - Direction the player was moving ('w', 'a', 's', 'd')
 * @returns The position one block ahead of the door
 */
function getPositionAheadOfDoor(doorX: number, doorY: number, direction: string): { x: number; y: number } {
    switch (direction) {
        case 'w': // Moving up, so place player above the door
            return { x: doorX, y: doorY - 1 };
        case 's': // Moving down, so place player below the door
            return { x: doorX, y: doorY + 1 };
        case 'a': // Moving left, so place player to the left of the door
            return { x: doorX - 1, y: doorY };
        case 'd': // Moving right, so place player to the right of the door
            return { x: doorX + 1, y: doorY };
        default:
            return { x: doorX, y: doorY };
    }
}

async function goToDoorLocation(x: number, y: number, direction: string): Promise<void> {
    const tileData = grid[y]![x];
    const entity: Entity | undefined = entities.getById(tileData!.instanceId);
    const doorFlags = entity?.getFlags() as { to?: string };

    if (doorFlags?.to && doorFlags.to.trim() !== "") {
        // Store the current room name before changing it
        const currentRoomName = gameState.currRoom;
        
        // Load the destination room first
        const destinationLoader = new RoomLoader(doorFlags.to);
        const destinationRoom = await destinationLoader.load();
        const destinationEntities = destinationRoom.getEntities();
        const destinationGrid = destinationRoom.getGrid();

        // Find the corresponding door in the destination room that points back to current room
        const destinationDoor = findDestinationDoor(doorFlags.to, destinationGrid, destinationEntities, currentRoomName);
        
        if (destinationDoor) {
            // Place player one block in the same direction from the destination door
            const newPosition = getPositionAheadOfDoor(destinationDoor.x, destinationDoor.y, direction);
            player = new Player(newPosition.x, newPosition.y);
        } else {
            // Fallback to center if door not found
            player = new Player(Math.floor(destinationRoom.getWidth() / 2), Math.floor(destinationRoom.getHeight() / 2));
        }

        // Now update the game state to the destination room
        gameState.currRoom = doorFlags.to;
        loader = destinationLoader;
        room = destinationRoom;
        entities = destinationEntities;
        grid = destinationGrid;
        entitiesCopy = entities;
    }
}

console.clear();
draw();
process.stdin.on("data", async (key: string) => {
    let doorFound = false;

    // Trim whitespace and newlines from input
    const trimmedKey = key.trim();

    switch (trimmedKey) {
        case "q":
            process.exit(0);
            break;
        case "w":
            doorFound = await checkForDoor(player.getX(), player.getY() - 1, "w");
            if (!doorFound) {
                player.tryDecrementY(canMoveTo);
            }
            break;
        case "d":
            doorFound = await checkForDoor(player.getX() + 1, player.getY(), "d");
            if (!doorFound) {
                player.tryIncrementX(canMoveTo);
            }
            break;
        case "s":
            doorFound = await checkForDoor(player.getX(), player.getY() + 1, "s");
            if (!doorFound) {
                player.tryIncrementY(canMoveTo);
            }
            break;
        case "a":
            doorFound = await checkForDoor(player.getX() - 1, player.getY(), "a");
            if (!doorFound) {
                player.tryDecrementX(canMoveTo);
            }
            break;
    }
    console.clear();
    draw();
})
