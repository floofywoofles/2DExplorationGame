import { startEditor } from './src/editor/editor';
import type { Entities } from './src/entities';
import type { Entity } from './src/entity';
import { RoomLoader } from './src/loader';
import { Player } from './src/player';
import type { Room } from './src/room';
import { PersistenceManager } from './src/persistence';

// Run the TUI editor
// startEditor()

interface GameState {
    currRoom: string,
}

const gameState: GameState = {
    currRoom: "test_level"
};

const persistenceManager = new PersistenceManager();
let loader: RoomLoader = new RoomLoader(gameState.currRoom, persistenceManager);
let room = await loader.load();
let entities: Entities = room.getEntities();

let out: string = "";
let grid = room.getGrid();
let entitiesCopy: Entities = entities;
let player: Player = new Player(10 / 2, 10 / 2);
let playerDirection: string = "d"; // Track which direction player is facing (w, a, s, d)
let playerInventory: string[] = []; // Track items player has collected
let currentDialogue: string[] = []; // Current dialogue being displayed
let dialogueIndex: number = 0; // Current line of dialogue being shown
let isInDialogue: boolean = false; // Whether we're currently in a dialogue
let interactingEntityId: string | null = null; // Instance ID of entity being interacted with

/**
 * Checks if a position is valid for movement
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @returns boolean - true if the player can move to this position
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
                out += " @ ";
            } else {
                const tileData = grid[y]![x];
                const entity: Entity | undefined = entities.getById(tileData!.instanceId);
                out += ` ${entity?.getSprite() || "? "} `;
            }
        }
        out += "\n";
    }

    console.log(out);

    // Display dialogue if active
    if (isInDialogue) {
        console.log("\n" + "=".repeat(40));
        // Display all dialogue lines
        for (let i = 0; i < currentDialogue.length; i++) {
            console.log(currentDialogue[i]);
            if (i < currentDialogue.length - 1) {
                console.log(""); // Add blank line between dialogue entries
            }
        }
        console.log("=".repeat(40));
        console.log(`[Press SPACE to close]`);
    }
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

/**
 * Attempts to pick up an item at the specified position
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @returns true if an item was picked up
 */
function pickupItem(x: number, y: number): boolean {
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

    // Check if the entity is an item
    const flags = entity.getFlags() as { is_solid?: boolean; to?: string };
    const entityName = entity.getName();
    const dialogue = entity.getDialogue();

    // Don't pick up ground, walls, or doors
    if (flags.to || entityName === "ground" || entityName === "wall" || entityName === "door") {
        return false;
    }

    // Don't pick up items that have dialogue (they should be interacted with instead)
    if (dialogue && dialogue.length > 0) {
        return false;
    }

    // Check if this is a pickable item (coin, boogers, etc.)
    if (entityName === "coin" || entityName === "boogers") {
        console.log(`Picked up: ${entityName}`);
        playerInventory.push(entityName);

        // Mark as consumed for persistence only if persistent flag is true (default true)
        const entityFlags = entity.getFlags() as { persistent?: boolean };
        const isPersistent = entityFlags.persistent !== false; // Default to true if not set
        if (isPersistent) {
            persistenceManager.markAsConsumed(tileData.instanceId);
        }

        // Replace the item with ground
        const groundEntities = entities.getByName("ground");
        if (groundEntities.length > 0) {
            tileData.instanceId = groundEntities[0]!.getId();
        }

        return true;
    }

    return false;
}

/**
 * Starts dialogue with an entity at the specified position
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @returns true if dialogue was started
 */
function startDialogue(x: number, y: number): boolean {
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

    // Check if entity has dialogue
    const dialogue = entity.getDialogue();
    if (dialogue && dialogue.length > 0) {
        currentDialogue = dialogue;
        dialogueIndex = 0;
        isInDialogue = true;
        interactingEntityId = tileData.instanceId; // Track which entity we're interacting with
        return true;
    }

    return false;
}

/**
 * Advances to the next line of dialogue
 * @returns true if there's more dialogue, false if dialogue ended
 */
function advanceDialogue(): boolean {
    if (!isInDialogue || currentDialogue.length === 0) {
        return false;
    }

    dialogueIndex++;

    if (dialogueIndex >= currentDialogue.length) {
        // End of dialogue
        isInDialogue = false;
        currentDialogue = [];
        dialogueIndex = 0;
        return false;
    }

    return true;
}

/**
 * Gets the current dialogue line to display
 * @returns the current dialogue line or empty string
 */
function getCurrentDialogueLine(): string {
    if (!isInDialogue || currentDialogue.length === 0) {
        return "";
    }

    return currentDialogue[dialogueIndex] || "";
}

/**
 * Handles item pickup when space is pressed
 * Tries current position first, then facing direction
 */
function handleItemPickup(): void {
    // Try to pick up item at current position
    let pickedUp = pickupItem(player.getX(), player.getY());

    if (!pickedUp) {
        // Try to pick up item in facing direction
        let targetX = player.getX();
        let targetY = player.getY();

        switch (playerDirection) {
            case 'w':
                targetY--;
                break;
            case 's':
                targetY++;
                break;
            case 'a':
                targetX--;
                break;
            case 'd':
                targetX++;
                break;
        }

        pickedUp = pickupItem(targetX, targetY);
    }

    if (pickedUp) {
        console.log(`Inventory: ${playerInventory.join(", ")}`);
    } else {
        console.log("Nothing to pick up here!");
    }
}

/**
 * Handles space key press - either closes dialogue or tries to interact/pickup
 */
function handleSpacePress(): void {
    if (isInDialogue) {
        // If in dialogue, close it
        isInDialogue = false;
        
        // Check if we were interacting with a chest - mark it as consumed only if persistent
        if (interactingEntityId) {
            const entity = entities.getById(interactingEntityId);
            if (entity && entity.getName() === "chest") {
                const entityFlags = entity.getFlags() as { persistent?: boolean };
                const isPersistent = entityFlags.persistent !== false; // Default to true if not set
                if (isPersistent) {
                    persistenceManager.markAsConsumed(interactingEntityId);
                }
            }
            interactingEntityId = null;
        }
        
        currentDialogue = [];
        dialogueIndex = 0;
        console.log("[Dialogue ended]");
    } else {
        // Try to start dialogue at current position first
        let dialogueStarted = startDialogue(player.getX(), player.getY());

        if (!dialogueStarted) {
            // Try facing direction
            let targetX = player.getX();
            let targetY = player.getY();

            switch (playerDirection) {
                case 'w':
                    targetY--;
                    break;
                case 's':
                    targetY++;
                    break;
                case 'a':
                    targetX--;
                    break;
                case 'd':
                    targetX++;
                    break;
            }

            dialogueStarted = startDialogue(targetX, targetY);
        }

        // If no dialogue, try to pick up item
        if (!dialogueStarted) {
            handleItemPickup();
        }
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
        const destinationLoader = new RoomLoader(doorFlags.to, persistenceManager);
        const destinationRoom = await destinationLoader.load();
        const destinationEntities = destinationRoom.getEntities();
        const destinationGrid = destinationRoom.getGrid();

        // Find the corresponding door in the destination room that points back to current room
        const destinationDoor = findDestinationDoor(doorFlags.to, destinationGrid, destinationEntities, currentRoomName);

        if (destinationDoor) {
            // Place player one block in the same direction from the destination door
            const newPosition = getPositionAheadOfDoor(destinationDoor.x, destinationDoor.y, direction);
            switch (direction) {
                case "w":
                    player = new Player(destinationDoor.y - 1, destinationDoor.x);
                    break;
                case "s":
                    player = new Player(destinationDoor.y + 1, destinationDoor.x);
                    break;
                case "a":
                    player = new Player(destinationDoor.y, destinationDoor.x - 1);
                    break;
                case "d":
                    player = new Player(destinationDoor.y, destinationDoor.x + 1);
                    break;
            }
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
            if (!isInDialogue) {
                doorFound = await checkForDoor(player.getX(), player.getY() - 1, "w");
                if (!doorFound) {
                    player.tryDecrementY(canMoveTo);
                }
                playerDirection = "w";
            }
            break;
        case "d":
            if (!isInDialogue) {
                doorFound = await checkForDoor(player.getX() + 1, player.getY(), "d");
                if (!doorFound) {
                    player.tryIncrementX(canMoveTo);
                }
                playerDirection = "d";
            }
            break;
        case "s":
            if (!isInDialogue) {
                doorFound = await checkForDoor(player.getX(), player.getY() + 1, "s");
                if (!doorFound) {
                    player.tryIncrementY(canMoveTo);
                }
                playerDirection = "s";
            }
            break;
        case "a":
            if (!isInDialogue) {
                doorFound = await checkForDoor(player.getX() - 1, player.getY(), "a");
                if (!doorFound) {
                    player.tryDecrementX(canMoveTo);
                }
                playerDirection = "a";
            }
            break;
        case " ":
            handleSpacePress();
            break;
        default:
            // Check if it's space with different encoding
            if (key === " " || key.includes(" ")) {
                handleSpacePress();
            }
            break;
    }
    console.clear();
    draw();
})
