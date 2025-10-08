/**
 * TUI (Text User Interface) Editor for 10x10 Room Grid System
 * 
 * This editor allows you to:
 * - Create and edit 10x10 room grids
 * - Place tiles (ground, walls, doors) and items (chests, etc.)
 * - Manage entity instances with unique IDs
 * - Link entities across different rooms
 * - Create and edit item definitions
 * 
 * Architecture:
 * - Uses stdin in raw mode for immediate keypress handling
 * - ANSI escape codes for terminal rendering
 * - Async file operations for loading/saving
 * - State-based rendering system
 */

/**
 * TileData represents a tile or item definition loaded from JSON files.
 * These are the base templates that get placed in the grid as instances.
 */
interface TileData {
  name: string;                                      // Unique identifier (e.g., "door", "chest")
  sprite: string;                                    // Single character displayed in grid
  id: string;                                        // Base ID (usually empty, instances get unique IDs)
  flags: Record<string, boolean | string | number>; // Default properties (e.g., is_solid, locked)
  items?: string[];                                  // Default items array for containers
}

/**
 * GridCell represents a single cell in the 10x10 room grid.
 * Each cell contains a tile/item instance with its own unique ID and properties.
 */
interface GridCell {
  tile: TileData;                                    // Reference to the base tile/item definition
  instanceId: string;                                // Unique ID for this specific instance (e.g., "instance_5")
  instanceFlags?: Record<string, boolean | string | number>; // Instance-specific flag overrides
  instanceItems?: string[];                          // Instance-specific items (can differ from template)
}

/**
 * EditorState holds the complete state of the editor.
 * This is the single source of truth for all editor data and UI state.
 */
interface EditorState {
  // === Grid State ===
  grid: GridCell[][];              // 10x10 array of cells, [y][x] indexing
  cursorX: number;                 // Current cursor X position (0-9)
  cursorY: number;                 // Current cursor Y position (0-9)
  
  // === Selection State ===
  selectedIndex: number;           // Index into allPlaceables array for current selection
  tiles: TileData[];              // All loaded tiles from src/tiles/
  items: TileData[];              // All loaded items from src/items/
  allPlaceables: TileData[];      // Combined tiles + items array
  
  // === Cell Edit Mode ===
  editMode: boolean;              // True when editing a placed entity's properties
  editingCell: { x: number; y: number } | null; // Position of cell being edited
  editMenuCursor: number;         // Cursor position in edit menu
  editMenuItems: string[];        // List of editable fields in current menu
  
  // === Input State ===
  inputMode: boolean;             // True when collecting text input
  inputBuffer: string;            // Current text being typed
  inputField: string;             // Name of field being edited
  
  // === Room Management ===
  roomName: string;               // Current room name (used as filename)
  roomMenuMode: boolean;          // True when room menu is open
  roomMenuCursor: number;         // Cursor in room menu
  availableRooms: string[];       // List of saved room files
  
  // === Entity Browser (for linking entities) ===
  entityBrowserMode: boolean;     // True when browsing entities across rooms
  entityBrowserCursor: number;    // Cursor in entity list
  entityBrowserList: Array<{      // All entities of same type across all rooms
    instanceId: string;           // Entity's unique ID
    name: string;                 // Entity type name
    x: number;                    // Grid X position
    y: number;                    // Grid Y position
    roomName: string;             // Room containing this entity
  }>;
  
  // === Instance ID Management ===
  nextInstanceId: number;         // Counter for generating unique instance IDs
  lastSaveTime: number;           // Timestamp of last save (for "saved!" notification)
  
  // === Item Creator ===
  itemCreatorMode: boolean;       // True when creating new item
  itemCreatorStep: number;        // Current step in creation wizard (0-2)
  newItemData: {                  // Data for item being created
    name: string;
    sprite: string;
    flags: Record<string, boolean | string | number>;
    items: string[];
  };
  
  // === Item Editor ===
  itemEditorMode: boolean;        // True when editing item definitions
  itemEditorListMode: boolean;    // True when showing item list vs editing item
  itemEditorCursor: number;       // Cursor in item list
  editingItemIndex: number;       // Index of item being edited
  editingItemMenuCursor: number;  // Cursor in item edit menu
  editingItemMenuItems: string[]; // List of editable fields in item

  // === Item Browser ===
  itemBrowserMode: boolean;        // True when browsing items to add to an entity
  itemBrowserCursor: number;       // Cursor position in item browser
}

/**
 * Load all tile definitions from src/tiles/ directory.
 * Tiles are base terrain/structure elements like ground, walls, doors.
 * 
 * @returns Array of TileData parsed from JSON files
 */
async function loadTiles(): Promise<TileData[]> {
  const tiles: TileData[] = [];
  const tilesDir = './src/tiles';
  
  const fs = await import('fs/promises');
  const files = await fs.readdir(tilesDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = `${tilesDir}/${file}`;
      const content = await Bun.file(filePath).text();
      const tileData = JSON.parse(content) as TileData;
      tiles.push(tileData);
    }
  }
  
  return tiles;
}

/**
 * Load all item definitions from src/items/ directory.
 * Items are placeable objects like chests, keys, potions, etc.
 * Uses same TileData structure as tiles.
 * 
 * @returns Array of TileData parsed from JSON files
 */
async function loadItems(): Promise<TileData[]> {
  const items: TileData[] = [];
  const itemsDir = './src/items';
  
  try {
    const fs = await import('fs/promises');
    const files = await fs.readdir(itemsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = `${itemsDir}/${file}`;
        const content = await Bun.file(filePath).text();
        const itemData = JSON.parse(content) as TileData;
        items.push(itemData);
      }
    }
  } catch (error) {
    // Items folder might not exist, that's okay
    console.warn('No items folder found or error loading items');
  }
  
  return items;
}

/**
 * Generate a unique instance ID for a placed entity.
 * Each placed tile/item gets its own ID for referencing (e.g., for door linking).
 * 
 * Format: "instance_N" where N is an incrementing counter.
 * IDs are preserved across save/load operations.
 * 
 * @param state - Editor state containing nextInstanceId counter
 * @returns Unique instance ID string
 */
function generateInstanceId(state: EditorState): string {
  const id = `instance_${state.nextInstanceId}`;
  state.nextInstanceId++;
  return id;
}

/**
 * Generate a unique ID for a new item/tile definition.
 * Uses timestamp and random string for uniqueness.
 * 
 * Format: "item_TIMESTAMP_RANDOM" (e.g., "item_1696523456789_a3f2")
 * 
 * @returns Unique item ID string
 */
function generateItemId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6);
  return `item_${timestamp}_${random}`;
}

/**
 * Initialize a 10x10 grid filled with the default ground tile.
 * Each cell gets its own unique instance ID.
 * 
 * @param groundTile - The base tile to fill the grid with
 * @param state - Editor state for generating instance IDs
 * @returns 10x10 GridCell array
 */
function initializeGrid(groundTile: TileData, state: EditorState): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < 10; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < 10; x++) {
      row.push({ 
        tile: groundTile,
        instanceId: generateInstanceId(state),
      });
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Clear the terminal screen using ANSI escape codes.
 * \x1b[2J = Clear entire screen
 * \x1b[H = Move cursor to home (0,0)
 */
function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

/**
 * Render the 10x10 room grid with box-drawing characters.
 * 
 * Display format:
 *   ┌────────────────────┐
 *   │ - - # # - - - - - -│
 *   │ - - # # - - - - - -│
 *   ...
 *   └────────────────────┘
 * 
 * The cursor position is shown with inverted colors (\x1b[7m).
 * 
 * @param state - Editor state containing grid and cursor position
 */
function renderGrid(state: EditorState): void {
  
  let output = '\n  ┌' + '─'.repeat(20) + '┐\n';
  
  for (let y = 0; y < 10; y++) {
    output += '  │ ';
    for (let x = 0; x < 10; x++) {
      const cell = state.grid[y]?.[x];
      const sprite = cell?.tile.sprite || ' ';
      
      if (x === state.cursorX && y === state.cursorY) {
        output += `\x1b[7m${sprite}\x1b[0m `; // Inverted colors for cursor
      } else {
        output += `${sprite} `;
      }
    }
    output += '│\n';
  }
  
  output += '  └' + '─'.repeat(20) + '┘\n';
  process.stdout.write(output);
}

/**
 * Render the info box below the grid showing:
 * - Current room name
 * - Selected tile/item info
 * - Available controls
 * - "saved!" notification (for 2 seconds after save)
 * 
 * @param state - Editor state containing selection and room info
 */
function renderInfoBox(state: EditorState): void {
  
  const selected = state.allPlaceables[state.selectedIndex];
  if (!selected) return;
  
  // Check if recently saved (within last 2 seconds)
  const recentlySaved = state.lastSaveTime && (Date.now() - state.lastSaveTime) < 2000;
  
  let output = '\n  ┌' + '─'.repeat(50) + '┐\n';
  const roomLine = recentlySaved 
    ? `  │ Room: ${state.roomName} (saved!)` 
    : `  │ Room: ${state.roomName}`;
  output += roomLine.padEnd(53) + '│\n';
  output += '  ├' + '─'.repeat(50) + '┤\n';
  output += `  │ Selected: ${selected.name} [${selected.sprite}]`.padEnd(53) + '│\n';
  
  if (Object.keys(selected.flags).length > 0) {
    const flagsStr = Object.entries(selected.flags)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    output += `  │ Flags: ${flagsStr}`.padEnd(53) + '│\n';
  }
  
  if (selected.items && selected.items.length > 0) {
    output += `  │ Items: ${selected.items.join(', ')}`.padEnd(53) + '│\n';
  }
  
  output += '  ├' + '─'.repeat(50) + '┤\n';
  output += '  │ WASD=move  E/Q=cycle  1-9=items  R=room  I/L   │\n';
  output += '  │ Space=place/edit  Ctrl+S=save  Ctrl+C=exit    │\n';
  output += '  └' + '─'.repeat(50) + '┘\n';
  
  process.stdout.write(output);
}

// Render edit popup menu
function renderEditMenu(state: EditorState): void {
  // PSEUDOCODE:
  // 1. Get cell being edited
  // 2. Draw popup box in center of screen
  // 3. List all flags with current values
  // 4. List all items if items array exists
  // 5. Show controls: arrows=navigate Enter=toggle/edit ESC=close
  
  if (!state.editingCell) return;
  
  const cell = state.grid[state.editingCell.y]?.[state.editingCell.x];
  if (!cell) return;
  
  let output = '\n\n  ┌' + '─'.repeat(50) + '┐\n';
  output += `  │ Editing: ${cell.tile.name} [${cell.tile.sprite}]`.padEnd(53) + '│\n';
  output += `  │ Instance ID: ${cell.instanceId}`.padEnd(53) + '│\n';
  output += '  ├' + '─'.repeat(50) + '┤\n';
  
  let itemIndex = 0;
  
  if (cell.instanceFlags && Object.keys(cell.instanceFlags).length > 0) {
    output += '  │ FLAGS:'.padEnd(53) + '│\n';
    for (const [key, value] of Object.entries(cell.instanceFlags)) {
      const cursor = itemIndex === state.editMenuCursor ? '► ' : '  ';
      const line = `  │ ${cursor}${key}: ${value}`;
      output += line.padEnd(53) + '│\n';
      itemIndex++;
    }
  }
  
  if (cell.instanceItems) {
    output += '  │ ITEMS:'.padEnd(53) + '│\n';
    for (let i = 0; i < cell.instanceItems.length; i++) {
      const cursor = itemIndex === state.editMenuCursor ? '► ' : '  ';
      const line = `  │ ${cursor}[${i}] ${cell.instanceItems[i]}`;
      output += line.padEnd(53) + '│\n';
      itemIndex++;
    }
    // Add new item option
    const cursor = itemIndex === state.editMenuCursor ? '► ' : '  ';
    output += `  │ ${cursor}+ Add item`.padEnd(53) + '│\n';
  }
  
  output += '  ├' + '─'.repeat(50) + '┤\n';
  
  if (state.inputMode) {
    output += `  │ Input: ${state.inputBuffer}_`.padEnd(53) + '│\n';
    output += '  │ Enter=confirm  Tab=browse  ESC=cancel         │\n';
  } else {
    output += '  │ W/S=navigate  Enter=edit  D=delete  ESC=close │\n';
  }
  
  output += '  └' + '─'.repeat(50) + '┘\n';
  
  process.stdout.write(output);
}

/**
 * Render a list of available items to add to an entity.
 * This menu opens when "+ Add item" is selected in an edit menu.
 *
 * @param state - Editor state containing the list of all items
 */
function renderItemBrowser(state: EditorState): void {
  let output = '\n\n  ┌' + '─'.repeat(60) + '┐\n';
  output += '  │ Select Item to Add'.padEnd(63) + '│\n';
  output += '  ├' + '─'.repeat(60) + '┤\n';
  
  if (state.items.length === 0) {
    output += '  │   (no items found in src/items/)'.padEnd(63) + '│\n';
  } else {
    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      if (!item) continue;
      const cursor = i === state.itemBrowserCursor ? '► ' : '  ';
      const line = `  │ ${cursor}${item.name} [${item.sprite}]`;
      output += line.padEnd(63) + '│\n';
    }
  }
  
  output += '  ├' + '─'.repeat(60) + '┤\n';
  output += '  │ W/S=navigate  Enter=select  ESC=cancel                   │\n';
  output += '  └' + '─'.repeat(60) + '┘\n';
  
  process.stdout.write(output);
}

// Render entity browser
function renderEntityBrowser(state: EditorState): void {
  // PSEUDOCODE:
  // Show list of all placed entities of the same type across all rooms
  
  if (!state.editingCell) return;
  const cell = state.grid[state.editingCell.y]?.[state.editingCell.x];
  if (!cell) return;
  
  let output = '\n\n  ┌' + '─'.repeat(60) + '┐\n';
  output += `  │ Select Entity (type: ${cell.tile.name})`.padEnd(63) + '│\n';
  output += '  ├' + '─'.repeat(60) + '┤\n';
  
  if (state.entityBrowserList.length === 0) {
    output += '  │   (no entities of this type in any room)'.padEnd(63) + '│\n';
  } else {
    for (let i = 0; i < state.entityBrowserList.length; i++) {
      const entity = state.entityBrowserList[i];
      if (!entity) continue;
      const cursor = i === state.entityBrowserCursor ? '► ' : '  ';
      const line = `  │ ${cursor}${entity.instanceId} [${entity.roomName}] (${entity.x},${entity.y})`;
      output += line.padEnd(63) + '│\n';
    }
  }
  
  output += '  ├' + '─'.repeat(60) + '┤\n';
  output += '  │ W/S=navigate  Enter=select  ESC=cancel                 │\n';
  output += '  └' + '─'.repeat(60) + '┘\n';
  
  process.stdout.write(output);
}

// Render room menu
function renderRoomMenu(state: EditorState): void {
  // PSEUDOCODE:
  // 1. Draw menu box
  // 2. List available rooms
  // 3. Show options: Rename, New Room, Load Room
  
  let output = '\n\n  ┌' + '─'.repeat(50) + '┐\n';
  output += `  │ Room Menu - Current: ${state.roomName}`.padEnd(53) + '│\n';
  output += '  ├' + '─'.repeat(50) + '┤\n';
  
  let itemIndex = 0;
  
  // Rename current room option
  const renameCursor = itemIndex === state.roomMenuCursor ? '► ' : '  ';
  output += `  │ ${renameCursor}Rename current room`.padEnd(53) + '│\n';
  itemIndex++;
  
  // New room option
  const newCursor = itemIndex === state.roomMenuCursor ? '► ' : '  ';
  output += `  │ ${newCursor}New room`.padEnd(53) + '│\n';
  itemIndex++;
  
  // Separator
  output += '  ├' + '─'.repeat(50) + '┤\n';
  output += '  │ Load Room:'.padEnd(53) + '│\n';
  
  if (state.availableRooms.length === 0) {
    output += '  │   (no saved rooms)'.padEnd(53) + '│\n';
  } else {
    for (const room of state.availableRooms) {
      const cursor = itemIndex === state.roomMenuCursor ? '► ' : '  ';
      const roomNameWithoutExt = room.replace('.json', '');
      output += `  │ ${cursor}${roomNameWithoutExt}`.padEnd(53) + '│\n';
      itemIndex++;
    }
  }
  
  output += '  ├' + '─'.repeat(50) + '┤\n';
  
  if (state.inputMode) {
    output += `  │ Input: ${state.inputBuffer}_`.padEnd(53) + '│\n';
    output += '  │ Enter=confirm  ESC=cancel                     │\n';
  } else {
    output += '  │ W/S=navigate  Enter=select  ESC=close         │\n';
  }
  
  output += '  └' + '─'.repeat(50) + '┘\n';
  
  process.stdout.write(output);
}

// Render item creator menu
function renderItemCreator(state: EditorState): void {
  // PSEUDOCODE:
  // Multi-step item creator interface
  
  let output = '\n\n  ┌' + '─'.repeat(60) + '┐\n';
  output += '  │ Item Creator'.padEnd(63) + '│\n';
  output += '  ├' + '─'.repeat(60) + '┤\n';
  
  const steps = [
    'Enter item name:',
    'Enter sprite (single character):',
    'Create complete!'
  ];
  
  output += `  │ Step ${state.itemCreatorStep + 1}/3: ${steps[state.itemCreatorStep]}`.padEnd(63) + '│\n';
  output += '  │'.padEnd(63) + '│\n';
  
  if (state.itemCreatorStep === 0) {
    output += `  │ Name: ${state.inputBuffer}_`.padEnd(63) + '│\n';
  } else if (state.itemCreatorStep === 1) {
    output += `  │ Name: ${state.newItemData.name}`.padEnd(63) + '│\n';
    output += `  │ Sprite: ${state.inputBuffer}_`.padEnd(63) + '│\n';
  } else if (state.itemCreatorStep === 2) {
    output += `  │ Name: ${state.newItemData.name}`.padEnd(63) + '│\n';
    output += `  │ Sprite: ${state.newItemData.sprite}`.padEnd(63) + '│\n';
    output += '  │'.padEnd(63) + '│\n';
    output += `  │ Item will be saved to: src/items/${state.newItemData.name}.json`.padEnd(63) + '│\n';
  }
  
  output += '  ├' + '─'.repeat(60) + '┤\n';
  output += '  │ Enter=confirm  ESC=cancel                              │\n';
  output += '  └' + '─'.repeat(60) + '┘\n';
  
  process.stdout.write(output);
}

// Render item editor list
function renderItemEditorList(state: EditorState): void {
  // PSEUDOCODE:
  // Show list of all items to edit
  
  let output = '\n\n  ┌' + '─'.repeat(60) + '┐\n';
  output += '  │ Item Editor - Select Item to Edit'.padEnd(63) + '│\n';
  output += '  ├' + '─'.repeat(60) + '┤\n';
  
  if (state.items.length === 0) {
    output += '  │   (no items)'.padEnd(63) + '│\n';
  } else {
    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      if (!item) continue;
      const cursor = i === state.itemEditorCursor ? '► ' : '  ';
      const line = `  │ ${cursor}${item.name} [${item.sprite}]`;
      output += line.padEnd(63) + '│\n';
    }
  }
  
  output += '  ├' + '─'.repeat(60) + '┤\n';
  output += '  │ W/S=navigate  Enter=edit  ESC=close                   │\n';
  output += '  └' + '─'.repeat(60) + '┘\n';
  
  process.stdout.write(output);
}

// Render item editor
function renderItemEditor(state: EditorState): void {
  // PSEUDOCODE:
  // Edit selected item's properties
  
  const item = state.items[state.editingItemIndex];
  if (!item) return;
  
  let output = '\n\n  ┌' + '─'.repeat(60) + '┐\n';
  output += `  │ Editing Item: ${item.name} [${item.sprite}]`.padEnd(63) + '│\n';
  output += '  ├' + '─'.repeat(60) + '┤\n';
  
  let itemIndex = 0;
  
  // Name
  const nameCursor = itemIndex === state.editingItemMenuCursor ? '► ' : '  ';
  output += `  │ ${nameCursor}name: ${item.name}`.padEnd(63) + '│\n';
  itemIndex++;
  
  // Sprite
  const spriteCursor = itemIndex === state.editingItemMenuCursor ? '► ' : '  ';
  output += `  │ ${spriteCursor}sprite: ${item.sprite}`.padEnd(63) + '│\n';
  itemIndex++;
  
  // Flags
  if (Object.keys(item.flags).length > 0) {
    output += '  │ FLAGS:'.padEnd(63) + '│\n';
    for (const [key, value] of Object.entries(item.flags)) {
      const cursor = itemIndex === state.editingItemMenuCursor ? '► ' : '  ';
      const line = `  │ ${cursor}${key}: ${value}`;
      output += line.padEnd(63) + '│\n';
      itemIndex++;
    }
  }
  
  // Add flag option
  const addFlagCursor = itemIndex === state.editingItemMenuCursor ? '► ' : '  ';
  output += `  │ ${addFlagCursor}+ Add flag`.padEnd(63) + '│\n';
  itemIndex++;
  
  // Items
  if (item.items && item.items.length > 0) {
    output += '  │ ITEMS:'.padEnd(63) + '│\n';
    for (let i = 0; i < item.items.length; i++) {
      const cursor = itemIndex === state.editingItemMenuCursor ? '► ' : '  ';
      const line = `  │ ${cursor}[${i}] ${item.items[i]}`;
      output += line.padEnd(63) + '│\n';
      itemIndex++;
    }
  }
  
  // Add item option
  const addItemCursor = itemIndex === state.editingItemMenuCursor ? '► ' : '  ';
  output += `  │ ${addItemCursor}+ Add item`.padEnd(63) + '│\n';
  
  output += '  ├' + '─'.repeat(60) + '┤\n';
  
  if (state.inputMode) {
    output += `  │ Input: ${state.inputBuffer}_`.padEnd(63) + '│\n';
    output += '  │ Enter=confirm  ESC=cancel                              │\n';
  } else {
    output += '  │ W/S=navigate  Enter=edit  D=delete  ESC=close          │\n';
  }
  
  output += '  └' + '─'.repeat(60) + '┘\n';
  
  process.stdout.write(output);
}

// Full render
function render(state: EditorState): void {
  clearScreen();
  if (state.itemBrowserMode) {
    renderItemBrowser(state);
  } else if (state.itemEditorMode) {
    if (state.itemEditorListMode) {
      renderItemEditorList(state);
    } else {
      renderItemEditor(state);
    }
  } else if (state.itemCreatorMode) {
    renderItemCreator(state);
  } else if (state.entityBrowserMode) {
    renderEntityBrowser(state);
  } else if (state.roomMenuMode) {
    renderRoomMenu(state);
  } else if (state.editMode && state.editingCell) {
    renderEditMenu(state);
  } else {
    renderGrid(state);
    renderInfoBox(state);
  }
}

/**
 * Move the cursor in the grid, clamping to 0-9 range.
 * 
 * @param state - Editor state containing cursor position
 * @param dx - Horizontal movement (-1 = left, +1 = right)
 * @param dy - Vertical movement (-1 = up, +1 = down)
 */
function moveCursor(state: EditorState, dx: number, dy: number): void {
  state.cursorX = Math.max(0, Math.min(9, state.cursorX + dx));
  state.cursorY = Math.max(0, Math.min(9, state.cursorY + dy));
}

/**
 * Cycle through available tiles/items for placement.
 * E key cycles forward, Q key cycles backward.
 * Wraps around at the ends of the list.
 * 
 * @param state - Editor state containing selection index
 * @param direction - +1 for forward, -1 for backward
 */
function cycleSelection(state: EditorState, direction: number): void {
  const newIndex = state.selectedIndex + direction;
  if (newIndex < 0) {
    state.selectedIndex = state.allPlaceables.length - 1;
  } else if (newIndex >= state.allPlaceables.length) {
    state.selectedIndex = 0;
  } else {
    state.selectedIndex = newIndex;
  }
}

/**
 * Select an item directly using number keys 1-9.
 * Number keys select items (not tiles), so we offset by tiles.length.
 * 
 * Example: If there are 3 tiles, pressing "1" selects items[0] (index 3 in allPlaceables).
 * 
 * @param state - Editor state containing items and selection
 * @param itemIndex - Zero-based index into items array (0 = first item)
 */
function selectItem(state: EditorState, itemIndex: number): void {
  const actualIndex = state.tiles.length + itemIndex;
  if (actualIndex < state.allPlaceables.length) {
    state.selectedIndex = actualIndex;
  }
}

/**
 * Place the currently selected tile/item at the cursor position.
 * Creates a new instance with:
 * - Unique instance ID
 * - Copy of base flags (can be edited independently)
 * - Copy of base items array (can be edited independently)
 * 
 * @param state - Editor state containing grid, cursor, and selection
 */
function placeSelected(state: EditorState): void {
  const selected = state.allPlaceables[state.selectedIndex];
  if (!selected) {
    return;
  }
  const row = state.grid[state.cursorY];
  if (!row) {
    return;
  }
  row[state.cursorX] = {
    tile: selected,
    instanceId: generateInstanceId(state),
    instanceFlags: { ...selected.flags },
    instanceItems: selected.items ? [...selected.items] : undefined,
  };
}

// Open edit menu for current cell
function openEditMenu(state: EditorState): void {
  // PSEUDOCODE:
  // 1. Check if current cell has editable content
  // 2. Set editMode = true
  // 3. Set editingCell to current cursor position
  const cell = state.grid[state.cursorY]?.[state.cursorX];
  if (!cell) return;
  
  state.editMode = true;
  state.editingCell = { x: state.cursorX, y: state.cursorY };
  state.editMenuCursor = 0;
  state.inputMode = false;
  state.inputBuffer = '';
  state.inputField = '';
  
  // Build list of editable items
  state.editMenuItems = [];
  if (cell.instanceFlags) {
    state.editMenuItems.push(...Object.keys(cell.instanceFlags));
  }
  if (cell.instanceItems) {
    for (let i = 0; i < cell.instanceItems.length; i++) {
      state.editMenuItems.push(`item_${i}`);
    }
    state.editMenuItems.push('add_item');
  }
}

// Handle keypress in normal mode
async function handleNormalModeKey(state: EditorState, key: string): Promise<void> {
  // PSEUDOCODE:
  // Switch on key:
  //   'w' → moveCursor(state, 0, -1)
  //   'a' → moveCursor(state, -1, 0)
  //   's' → moveCursor(state, 0, 1)
  //   'd' → moveCursor(state, 1, 0)
  //   'e' → cycleSelection(state, 1)
  //   'q' → cycleSelection(state, -1)
  //   '1'-'9' → selectItem(state, parseInt(key) - 1)
  //   ' ' → check if cell has item with flags/items, then openEditMenu or placeSelected
  //   '\x03' (Ctrl+C) → saveAndExit(state)
  
  switch (key) {
    case 'w':
      moveCursor(state, 0, -1);
      break;
    case 'a':
      moveCursor(state, -1, 0);
      break;
    case 's':
      moveCursor(state, 0, 1);
      break;
    case 'd':
      moveCursor(state, 1, 0);
      break;
    case 'e':
      cycleSelection(state, 1);
      break;
    case 'q':
      cycleSelection(state, -1);
      break;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      selectItem(state, parseInt(key) - 1);
      break;
    case ' ':
      // Check if current cell has editable content
      const cell = state.grid[state.cursorY]?.[state.cursorX];
      const hasEditableFlags = cell?.instanceFlags && Object.keys(cell.instanceFlags).length > 0;
      const hasEditableItems = cell?.instanceItems && cell.instanceItems.length > 0;
      
      if (cell && (hasEditableFlags || hasEditableItems)) {
        openEditMenu(state);
      } else {
        placeSelected(state);
      }
      break;
    case '\x13': // Ctrl+S - Save without exit
      await saveRoom(state);
      break;
    case '\x03': // Ctrl+C
      cleanupAndExit(state);
      break;
    case 'r':
      openRoomMenu(state);
      break;
    case 'i':
      openItemCreator(state);
      break;
    case 'l':
      openItemEditorList(state);
      break;
  }
}

// Open item editor list
function openItemEditorList(state: EditorState): void {
  // PSEUDOCODE:
  // Open list of items to edit
  state.itemEditorMode = true;
  state.itemEditorListMode = true;
  state.itemEditorCursor = 0;
}

// Build item editor menu items
function buildItemEditorMenuItems(state: EditorState): void {
  // PSEUDOCODE:
  // Build list of editable fields
  const item = state.items[state.editingItemIndex];
  if (!item) return;
  
  state.editingItemMenuItems = ['name', 'sprite'];
  
  // Add flags
  for (const key of Object.keys(item.flags)) {
    state.editingItemMenuItems.push(`flag_${key}`);
  }
  state.editingItemMenuItems.push('add_flag');
  
  // Add items
  if (item.items) {
    for (let i = 0; i < item.items.length; i++) {
      state.editingItemMenuItems.push(`item_${i}`);
    }
  }
  state.editingItemMenuItems.push('add_item');
}

// Save edited item to JSON
async function saveEditedItem(state: EditorState): Promise<void> {
  // PSEUDOCODE:
  // Save item changes to JSON file
  const item = state.items[state.editingItemIndex];
  if (!item) return;
  
  const itemData = {
    name: item.name,
    sprite: item.sprite,
    id: item.id,
    flags: item.flags,
    items: item.items,
  };
  
  const filename = `${item.name}.json`;
  const filepath = `./src/items/${filename}`;
  
  try {
    await Bun.write(filepath, JSON.stringify(itemData, null, 2));
    state.lastSaveTime = Date.now();
  } catch (error) {
    console.error(`Error saving item: ${error}`);
  }
}

// Handle keypress in item editor list
function handleItemEditorListKey(state: EditorState, key: string): void {
  // PSEUDOCODE:
  // Navigate and select items
  
  if (key === '\x1b') { // ESC - close
    state.itemEditorMode = false;
    state.itemEditorListMode = false;
    
  } else if (key === 'w') { // Up
    state.itemEditorCursor = Math.max(0, state.itemEditorCursor - 1);
    
  } else if (key === 's') { // Down
    state.itemEditorCursor = Math.min(state.items.length - 1, state.itemEditorCursor + 1);
    
  } else if (key === '\r' || key === '\n' || key === ' ') { // Enter - edit item
    state.editingItemIndex = state.itemEditorCursor;
    state.itemEditorListMode = false;
    state.editingItemMenuCursor = 0;
    buildItemEditorMenuItems(state);
  }
}

// Handle keypress in item editor
async function handleItemEditorKey(state: EditorState, key: string): Promise<void> {
  // PSEUDOCODE:
  // Edit item properties
  
  const item = state.items[state.editingItemIndex];
  if (!item) return;
  
  // Input mode
  if (state.inputMode) {
    if (key === '\r' || key === '\n') { // Enter - confirm
      const menuItem = state.editingItemMenuItems[state.editingItemMenuCursor];
      if (!menuItem) return;
      
      if (menuItem === 'name') {
        // Rename the file
        const oldName = item.name;
        item.name = state.inputBuffer;
        // Delete old file and create new one
        try {
          const oldPath = `./src/items/${oldName}.json`;
          const newPath = `./src/items/${item.name}.json`;
          await Bun.write(newPath, JSON.stringify(item, null, 2));
          // Try to delete old file
          await import('fs/promises').then(fs => fs.unlink(oldPath));
        } catch (error) {
          console.error('Error renaming item file:', error);
        }
      } else if (menuItem === 'sprite') {
        item.sprite = state.inputBuffer.charAt(0) || '?';
      } else if (menuItem.startsWith('flag_')) {
        const flagKey = menuItem.replace('flag_', '');
        const value = state.inputBuffer;
        if (value === 'true') {
          item.flags[flagKey] = true;
        } else if (value === 'false') {
          item.flags[flagKey] = false;
        } else if (!isNaN(Number(value))) {
          item.flags[flagKey] = Number(value);
        } else {
          item.flags[flagKey] = value;
        }
      } else if (menuItem === 'add_flag') {
        // Format: key=value
        const parts = state.inputBuffer.split('=');
        // Always try to add the flag, even if format isn't perfect
        const key = parts[0]?.trim() || '';
        const value = parts.length > 1 ? parts.slice(1).join('=').trim() : '';
        
        if (key) { // Only need a non-empty key
          // Parse the value
          if (value === 'true') {
            item.flags[key] = true;
          } else if (value === 'false') {
            item.flags[key] = false;
          } else if (value && !isNaN(Number(value))) {
            item.flags[key] = Number(value);
          } else {
            item.flags[key] = value; // Empty string is okay
          }
          
          await saveEditedItem(state);
          // Force a re-read of the item to ensure fresh data
          state.items = await loadItems();
          state.allPlaceables = [...state.tiles, ...state.items];
          // Rebuild menu to show new flag
          buildItemEditorMenuItems(state);
          // Move cursor to the newly added flag
          const updatedItem = state.items[state.editingItemIndex];
          if (updatedItem) {
            const flagKeys = Object.keys(updatedItem.flags);
            const newFlagIndex = flagKeys.indexOf(key);
            if (newFlagIndex >= 0) {
              state.editingItemMenuCursor = 2 + newFlagIndex; // 2 for name and sprite
            }
          }
          // Exit input mode to show the updated menu
          state.inputMode = false;
          state.inputBuffer = '';
          return; // Don't process further
        }
      } else if (menuItem.startsWith('item_') && item.items) {
        const itemIdx = parseInt(menuItem.split('_')[1] || '0');
        item.items[itemIdx] = state.inputBuffer;
        await saveEditedItem(state);
      } else if (menuItem === 'add_item') {
        // This is now handled by the item browser.
      }
      
      // Save if not already saved above
      if (menuItem !== 'add_flag' && !menuItem.startsWith('item_')) {
        await saveEditedItem(state);
      }
      state.inputMode = false;
      state.inputBuffer = '';
      
    } else if (key === '\x1b') { // ESC - cancel
      state.inputMode = false;
      state.inputBuffer = '';
      
    } else if (key === '\x7f' || key === '\b') { // Backspace
      state.inputBuffer = state.inputBuffer.slice(0, -1);
      
    } else if (key.length === 1 && key >= ' ') { // Regular character
      state.inputBuffer += key;
    }
    return;
  }
  
  // Normal navigation mode
  if (key === '\x1b') { // ESC - back to list
    state.itemEditorListMode = true;
    state.editingItemMenuCursor = 0;
    
  } else if (key === 'w') { // Up
    state.editingItemMenuCursor = Math.max(0, state.editingItemMenuCursor - 1);
    
  } else if (key === 's') { // Down
    state.editingItemMenuCursor = Math.min(state.editingItemMenuItems.length - 1, state.editingItemMenuCursor + 1);
    
  } else if (key === '\r' || key === '\n' || key === ' ') { // Enter - edit field
    const menuItem = state.editingItemMenuItems[state.editingItemMenuCursor];
    if (!menuItem) return;
    
    if (menuItem === 'add_item') {
      // Special case: open item browser instead of input mode
      state.itemBrowserMode = true;
      state.itemBrowserCursor = 0;
    } else {
      // For all other menu items, enter input mode
      state.inputMode = true;
      if (menuItem === 'name') {
        state.inputBuffer = item.name;
      } else if (menuItem === 'sprite') {
        state.inputBuffer = item.sprite;
      } else if (menuItem.startsWith('flag_')) {
        const flagKey = menuItem.replace('flag_', '');
        state.inputBuffer = String(item.flags[flagKey]);
      } else if (menuItem === 'add_flag') {
        state.inputBuffer = '';
      } else if (menuItem.startsWith('item_') && item.items) {
        const itemIdx = parseInt(menuItem.split('_')[1] || '0');
        state.inputBuffer = item.items[itemIdx] || '';
      }
    }
    
  } else if (key === 'd' || key === 'D') { // Delete
    const menuItem = state.editingItemMenuItems[state.editingItemMenuCursor];
    if (!menuItem) return;
    
    if (menuItem.startsWith('flag_')) {
      const flagKey = menuItem.replace('flag_', '');
      delete item.flags[flagKey];
      await saveEditedItem(state);
      // Reload items to ensure fresh data
      state.items = await loadItems();
      state.allPlaceables = [...state.tiles, ...state.items];
      // Rebuild menu after deletion
      buildItemEditorMenuItems(state);
      // Adjust cursor to stay in bounds
      state.editingItemMenuCursor = Math.min(state.editingItemMenuCursor, state.editingItemMenuItems.length - 1);
    } else if (menuItem.startsWith('item_') && item.items) {
      const itemIdx = parseInt(menuItem.split('_')[1] || '0');
      item.items.splice(itemIdx, 1);
      await saveEditedItem(state);
      // Reload items to ensure fresh data
      state.items = await loadItems();
      state.allPlaceables = [...state.tiles, ...state.items];
      // Rebuild menu after deletion
      buildItemEditorMenuItems(state);
      // Adjust cursor to stay in bounds
      state.editingItemMenuCursor = Math.min(state.editingItemMenuCursor, state.editingItemMenuItems.length - 1);
    }
  }
}

// Open item creator
function openItemCreator(state: EditorState): void {
  // PSEUDOCODE:
  // Initialize item creator mode
  state.itemCreatorMode = true;
  state.itemCreatorStep = 0;
  state.inputBuffer = '';
  state.inputMode = true;
  state.newItemData = {
    name: '',
    sprite: '',
    flags: {},
    items: [],
  };
}

// Create item JSON file
async function createItemFile(state: EditorState): Promise<void> {
  // PSEUDOCODE:
  // Save new item as JSON file
  const itemData = {
    name: state.newItemData.name,
    sprite: state.newItemData.sprite,
    id: generateItemId(), // Generate unique ID for new item
    flags: state.newItemData.flags,
    items: state.newItemData.items,
  };
  
  const filename = `${state.newItemData.name}.json`;
  const filepath = `./src/items/${filename}`;
  
  try {
    await Bun.write(filepath, JSON.stringify(itemData, null, 2));
    state.lastSaveTime = Date.now();
    // Reload items
    state.items = await loadItems();
    state.allPlaceables = [...state.tiles, ...state.items];
  } catch (error) {
    console.error(`Error creating item: ${error}`);
  }
}

// Handle keypress in item creator mode
async function handleItemCreatorKey(state: EditorState, key: string): Promise<void> {
  // PSEUDOCODE:
  // Multi-step input handling
  
  if (key === '\x1b') { // ESC - cancel
    state.itemCreatorMode = false;
    state.inputBuffer = '';
    state.inputMode = false;
    return;
  }
  
  if (key === '\r' || key === '\n') { // Enter - next step
    if (state.itemCreatorStep === 0) {
      // Save name
      state.newItemData.name = state.inputBuffer;
      state.inputBuffer = '';
      state.itemCreatorStep = 1;
    } else if (state.itemCreatorStep === 1) {
      // Save sprite (only first character)
      state.newItemData.sprite = state.inputBuffer.charAt(0) || '?';
      state.inputBuffer = '';
      state.itemCreatorStep = 2;
    } else if (state.itemCreatorStep === 2) {
      // Create the item
      await createItemFile(state);
      state.itemCreatorMode = false;
      state.inputBuffer = '';
      state.inputMode = false;
    }
    return;
  }
  
  if (key === '\x7f' || key === '\b') { // Backspace
    state.inputBuffer = state.inputBuffer.slice(0, -1);
  } else if (key.length === 1 && key >= ' ') { // Regular character
    state.inputBuffer += key;
  }
}

// Open room menu
async function openRoomMenu(state: EditorState): Promise<void> {
  // PSEUDOCODE:
  // Load available rooms and open menu
  state.availableRooms = await loadAvailableRooms();
  state.roomMenuMode = true;
  state.roomMenuCursor = 0;
  state.inputMode = false;
  state.inputBuffer = '';
}

// Handle keypress in room menu mode
async function handleRoomMenuKey(state: EditorState, key: string): Promise<void> {
  // PSEUDOCODE:
  // Handle navigation, rename, new room, load room
  
  const totalItems = 2 + state.availableRooms.length; // Rename + New + rooms
  
  // Input mode for renaming or new room
  if (state.inputMode) {
    if (key === '\r' || key === '\n') { // Enter - confirm
      if (state.inputField === 'rename') {
        state.roomName = state.inputBuffer;
      } else if (state.inputField === 'new_room') {
        // Create new room
        state.roomName = state.inputBuffer;
        const groundTile = state.tiles[0];
        if (groundTile) {
          state.grid = initializeGrid(groundTile, state);
        }
      }
      state.inputMode = false;
      state.inputBuffer = '';
      state.roomMenuMode = false;
      
    } else if (key === '\x1b') { // ESC - cancel
      state.inputMode = false;
      state.inputBuffer = '';
      
    } else if (key === '\x7f' || key === '\b') { // Backspace
      state.inputBuffer = state.inputBuffer.slice(0, -1);
      
    } else if (key.length === 1 && key >= ' ') { // Regular character
      state.inputBuffer += key;
    }
    return;
  }
  
  // Normal room menu navigation
  if (key === '\x1b') { // ESC - close menu
    state.roomMenuMode = false;
    state.roomMenuCursor = 0;
    
  } else if (key === 'w') { // Up
    state.roomMenuCursor = Math.max(0, state.roomMenuCursor - 1);
    
  } else if (key === 's') { // Down
    state.roomMenuCursor = Math.min(totalItems - 1, state.roomMenuCursor + 1);
    
  } else if (key === '\r' || key === '\n' || key === ' ') { // Enter/Space - select
    if (state.roomMenuCursor === 0) {
      // Rename current room
      state.inputMode = true;
      state.inputBuffer = state.roomName;
      state.inputField = 'rename';
      
    } else if (state.roomMenuCursor === 1) {
      // New room
      state.inputMode = true;
      state.inputBuffer = 'new_room';
      state.inputField = 'new_room';
      
    } else {
      // Load room
      const roomIndex = state.roomMenuCursor - 2;
      const roomFile = state.availableRooms[roomIndex];
      if (roomFile) {
        await loadRoom(state, roomFile);
        state.roomMenuMode = false;
      }
    }
  }
}

/**
 * Handle keypresses when the item browser is open.
 * This allows navigating and selecting an item to add.
 *
 * @param state - The current editor state
 * @param key - The key pressed by the user
 */
async function handleItemBrowserKey(state: EditorState, key: string): Promise<void> {
  if (key === '\x1b') { // ESC - close
    state.itemBrowserMode = false;
    state.itemBrowserCursor = 0;
    
  } else if (key === 'w') { // Up
    state.itemBrowserCursor = Math.max(0, state.itemBrowserCursor - 1);
    
  } else if (key === 's') { // Down
    state.itemBrowserCursor = Math.min(state.items.length - 1, state.itemBrowserCursor + 1);
    
  } else if (key === '\r' || key === '\n' || key === ' ') { // Enter - select item
    const selectedItem = state.items[state.itemBrowserCursor];
    if (selectedItem) {
      // Check if we are editing an entity in the grid or an item definition
      if (state.editMode && state.editingCell) {
        const cell = state.grid[state.editingCell.y]?.[state.editingCell.x];
        if (cell) {
          if (!cell.instanceItems) cell.instanceItems = [];
          cell.instanceItems.push(selectedItem.name);
          openEditMenu(state); // Refresh edit menu
        }
      } else if (state.itemEditorMode) {
        const item = state.items[state.editingItemIndex];
        if (item) {
          if (!item.items) item.items = [];
          item.items.push(selectedItem.name);
          await saveEditedItem(state);
          buildItemEditorMenuItems(state); // Refresh item editor menu
        }
      }
    }
    state.itemBrowserMode = false;
    state.itemBrowserCursor = 0;
  }
}

// Cleanup and exit function
async function cleanupAndExit(state: EditorState): Promise<void> {
  await saveRoom(state);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  clearScreen();
  console.log('\nEditor closed. Room saved!\n');
  process.exit(0);
}

/**
 * Build a list of all entities of a specific type across ALL saved rooms.
 * Used when Tab is pressed in input mode to browse/link entities.
 * 
 * Example: When editing a door's "to" flag, this shows all other doors
 * in all rooms so you can link them by selecting an instance ID.
 * 
 * @param state - Editor state to populate entityBrowserList
 * @param entityName - Type of entity to search for (e.g., "door")
 */
async function buildEntityListFromAllRooms(state: EditorState, entityName: string): Promise<void> {
  state.entityBrowserList = [];
  
  // Load all available rooms
  const roomFiles = await loadAvailableRooms();
  
  for (const roomFile of roomFiles) {
    try {
      const filepath = `./src/rooms/${roomFile}`;
      const content = await Bun.file(filepath).text();
      const roomData = JSON.parse(content) as {
        width: number;
        height: number;
        grid: Array<Array<{
          tile: string;
          instanceId?: string;
          flags?: Record<string, boolean | string | number>;
          items?: string[];
        }>>;
      };
      
      const roomName = roomFile.replace('.json', '');
      
      // Scan grid for matching entities
      for (let y = 0; y < roomData.grid.length; y++) {
        const row = roomData.grid[y];
        if (!row) continue;
        
        for (let x = 0; x < row.length; x++) {
          const cell = row[x];
          if (cell && cell.tile === entityName && cell.instanceId) {
            state.entityBrowserList.push({
              instanceId: cell.instanceId,
              name: cell.tile,
              x,
              y,
              roomName,
            });
          }
        }
      }
    } catch (error) {
      // Skip rooms that can't be loaded
      console.error(`Error loading room ${roomFile}:`, error);
    }
  }
}

/**
 * Auto-create an item JSON file if it doesn't already exist.
 * Called when adding an item to an entity's items array.
 * Creates a minimal valid item file with:
 * - name from parameter
 * - sprite = '?'
 * - empty flags and items
 * 
 * This allows quick item creation without leaving the editor.
 * 
 * @param itemName - Name of the item (becomes filename)
 */
async function createItemFileIfNotExists(itemName: string): Promise<void> {
  const filepath = `./src/items/${itemName}.json`;
  
  try {
    // Try to read the file
    await Bun.file(filepath).text();
    // File exists, do nothing
  } catch (error) {
    // File doesn't exist, create it
    const itemData = {
      name: itemName,
      sprite: '?',
      id: generateItemId(), // Generate unique ID for new item
      flags: {},
      items: [],
    };
    
    try {
      await Bun.write(filepath, JSON.stringify(itemData, null, 2));
    } catch (writeError) {
      console.error(`Error creating item file: ${writeError}`);
    }
  }
}

// Handle keypress in entity browser mode
function handleEntityBrowserKey(state: EditorState, key: string): void {
  // PSEUDOCODE:
  // Navigate and select entities
  
  if (key === '\x1b') { // ESC - cancel
    state.entityBrowserMode = false;
    state.entityBrowserCursor = 0;
    
  } else if (key === 'w') { // Up
    state.entityBrowserCursor = Math.max(0, state.entityBrowserCursor - 1);
    
  } else if (key === 's') { // Down
    state.entityBrowserCursor = Math.min(state.entityBrowserList.length - 1, state.entityBrowserCursor + 1);
    
  } else if (key === '\r' || key === '\n' || key === ' ') { // Enter - select
    const selected = state.entityBrowserList[state.entityBrowserCursor];
    if (selected) {
      state.inputBuffer = selected.instanceId;
      state.entityBrowserMode = false;
      state.entityBrowserCursor = 0;
    }
  }
}

// Handle keypress in edit mode
async function handleEditModeKey(state: EditorState, key: string): Promise<void> {
  // PSEUDOCODE:
  // Handle navigation within edit menu
  // Toggle flags with Enter
  // Edit items array
  // ESC to close edit menu
  
  if (!state.editingCell) return;
  const cell = state.grid[state.editingCell.y]?.[state.editingCell.x];
  if (!cell) return;
  
  // Input mode - collecting text input
  if (state.inputMode) {
    if (key === '\t') { // Tab - browse entities from all rooms
      await buildEntityListFromAllRooms(state, cell.tile.name);
      state.entityBrowserMode = true;
      state.entityBrowserCursor = 0;
      return;
      
    } else if (key === '\r' || key === '\n') { // Enter - confirm input
      // Apply the input
      const menuItem = state.editMenuItems[state.editMenuCursor];
      if (!menuItem) return;
      
      if (menuItem === 'add_item' && cell.instanceItems) {
        // This is now handled by the item browser, so this path shouldn't be taken for input.
        // Kept for safety, but the primary logic is moved.
      } else if (menuItem.startsWith('item_') && cell.instanceItems) {
        const itemIdx = parseInt(menuItem.split('_')[1] || '0');
        cell.instanceItems[itemIdx] = state.inputBuffer;
      } else if (cell.instanceFlags && menuItem in cell.instanceFlags) {
        // Try to parse as number or boolean, otherwise string
        const value = state.inputBuffer;
        if (value === 'true') {
          cell.instanceFlags[menuItem] = true;
        } else if (value === 'false') {
          cell.instanceFlags[menuItem] = false;
        } else if (!isNaN(Number(value))) {
          cell.instanceFlags[menuItem] = Number(value);
        } else {
          cell.instanceFlags[menuItem] = value;
        }
      }
      
      state.inputMode = false;
      state.inputBuffer = '';
      openEditMenu(state); // Refresh menu
      
    } else if (key === '\x1b') { // ESC - cancel input
      state.inputMode = false;
      state.inputBuffer = '';
      
    } else if (key === '\x7f' || key === '\b') { // Backspace
      state.inputBuffer = state.inputBuffer.slice(0, -1);
      
    } else if (key.length === 1 && key >= ' ') { // Regular character
      state.inputBuffer += key;
    }
    return;
  }
  
  // Normal edit menu navigation
  if (key === '\x1b') { // ESC - close menu
    state.editMode = false;
    state.editingCell = null;
    state.editMenuCursor = 0;
    
  } else if (key === 'w') { // Up
    state.editMenuCursor = Math.max(0, state.editMenuCursor - 1);
    
  } else if (key === 's') { // Down
    state.editMenuCursor = Math.min(state.editMenuItems.length - 1, state.editMenuCursor + 1);
    
  } else if (key === '\r' || key === '\n' || key === ' ') { // Enter/Space - edit current item
    const menuItem = state.editMenuItems[state.editMenuCursor];
    if (!menuItem) return;
    
    if (menuItem === 'add_item') {
      state.itemBrowserMode = true;
      state.itemBrowserCursor = 0;
    } else if (menuItem.startsWith('item_') && cell.instanceItems) {
      const itemIdx = parseInt(menuItem.split('_')[1] || '0');
      state.inputMode = true;
      state.inputBuffer = cell.instanceItems[itemIdx] || '';
      state.inputField = menuItem;
    } else if (cell.instanceFlags && menuItem in cell.instanceFlags) {
      const currentValue = cell.instanceFlags[menuItem];
      // Toggle boolean, or enter input mode for string/number
      if (typeof currentValue === 'boolean') {
        cell.instanceFlags[menuItem] = !currentValue;
      } else {
        state.inputMode = true;
        state.inputBuffer = String(currentValue);
        state.inputField = menuItem;
      }
    }
    
  } else if (key === 'd' || key === 'D') { // Delete item
    const menuItem = state.editMenuItems[state.editMenuCursor];
    if (!menuItem) return;
    
    if (menuItem.startsWith('item_') && cell.instanceItems) {
      const itemIdx = parseInt(menuItem.split('_')[1] || '0');
      if (itemIdx >= 0 && itemIdx < cell.instanceItems.length) {
        cell.instanceItems.splice(itemIdx, 1);
        openEditMenu(state); // Refresh menu
        state.editMenuCursor = Math.min(state.editMenuCursor, state.editMenuItems.length - 1);
      }
    }
  }
}

/**
 * Load list of all saved room files from src/rooms/ directory.
 * Returns just the filenames (e.g., ["dungeon.json", "treasure_room.json"])
 * 
 * @returns Array of room filenames
 */
async function loadAvailableRooms(): Promise<string[]> {
  try {
    const fs = await import('fs/promises');
    const files = await fs.readdir('./src/rooms');
    return files.filter(f => f.endsWith('.json'));
  } catch (error) {
    return [];
  }
}

/**
 * Load a room from a JSON file and rebuild the grid.
 * 
 * Process:
 * 1. Read and parse room JSON
 * 2. Find highest instance ID to continue numbering
 * 3. Rebuild grid by matching tile names to loaded definitions
 * 4. Restore instance IDs, flags, and items
 * 5. Update room name
 * 
 * If a tile type isn't found, falls back to ground tile.
 * 
 * @param state - Editor state to populate with loaded room
 * @param filename - Room file to load (e.g., "dungeon.json")
 */
async function loadRoom(state: EditorState, filename: string): Promise<void> {
  
  try {
    const filepath = `./src/rooms/${filename}`;
    const content = await Bun.file(filepath).text();
    const roomData = JSON.parse(content) as {
      width: number;
      height: number;
      grid: Array<Array<{
        tile: string;
        instanceId?: string;
        flags?: Record<string, boolean | string | number>;
        items?: string[];
      }>>;
    };
    
    // Rebuild grid
    const newGrid: GridCell[][] = [];
    const defaultTile = state.tiles[0] || state.allPlaceables[0];
    if (!defaultTile) return;
    
    // Create a fast lookup map for tiles by name
    const tileMap = new Map<string, TileData>();
    for (const tile of state.allPlaceables) {
      tileMap.set(tile.name, tile);
    }
    
    // Find max instance ID to continue numbering
    let maxId = 0;
    for (const row of roomData.grid) {
      for (const cell of row) {
        if (cell?.instanceId) {
          const match = cell.instanceId.match(/instance_(\d+)/);
          if (match) {
            const num = parseInt(match[1] || '0');
            maxId = Math.max(maxId, num);
          }
        }
      }
    }
    state.nextInstanceId = maxId + 1;
    
    for (let y = 0; y < 10; y++) {
      const row: GridCell[] = [];
      for (let x = 0; x < 10; x++) {
        const cellData = roomData.grid?.[y]?.[x];
        if (cellData) {
          // Find matching tile using fast map lookup
          const tile = tileMap.get(cellData.tile);
          if (tile) {
            row.push({
              tile,
              instanceId: cellData.instanceId || generateInstanceId(state),
              instanceFlags: cellData.flags ?? {},
              instanceItems: cellData.items ?? [],
            });
          } else {
            // Fallback to ground tile
            row.push({ 
              tile: defaultTile,
              instanceId: generateInstanceId(state),
            });
          }
        } else {
          row.push({ 
            tile: defaultTile,
            instanceId: generateInstanceId(state),
          });
        }
      }
      newGrid.push(row);
    }
    
    state.grid = newGrid;
    state.roomName = filename.replace('.json', '');
  } catch (error) {
    console.error(`Error loading room: ${error}`);
  }
}

/**
 * Save the current room to a JSON file.
 * 
 * Saved data includes:
 * - Grid dimensions (10x10)
 * - Complete grid with tile names, instance IDs, flags, and items
 * 
 * Filename is based on roomName (e.g., "dungeon" -> "dungeon.json")
 * Sets lastSaveTime for showing "(saved!)" notification.
 * 
 * @param state - Editor state containing grid and room name
 */
async function saveRoom(state: EditorState): Promise<void> {
  
  const roomData = {
    width: 10,
    height: 10,
    grid: state.grid.map(row =>
      row.map(cell => ({
        tile: cell.tile.name,
        instanceId: cell.instanceId,
        flags: cell.instanceFlags || {},
        items: cell.instanceItems || [],
      }))
    ),
  };
  
  const filename = `${state.roomName}.json`;
  const filepath = `./src/rooms/${filename}`;
  
  try {
    await Bun.write(filepath, JSON.stringify(roomData, null, 2));
    // Save was successful - notification will be shown in next render
    state.lastSaveTime = Date.now();
  } catch (error) {
    console.error(`\nError saving room: ${error}`);
  }
}

/**
 * Main entry point for the TUI editor.
 * 
 * Initialization:
 * 1. Load all tiles from src/tiles/
 * 2. Load all items from src/items/
 * 3. Initialize editor state with default room
 * 4. Set stdin to raw mode for immediate keypress handling
 * 
 * Event Loop:
 * - Routes keypresses to appropriate handler based on current mode
 * - Re-renders after each keypress
 * - Ctrl+C saves and exits
 * 
 * Cleanup:
 * - Restores terminal to normal mode
 * - Saves room before exit
 * 
 * @throws Error if tiles directory is empty
 */
export async function startEditor(): Promise<void> {
  
  console.log("Loading editor...");
  
  const tiles = await loadTiles();
  const items = await loadItems();
  
  if (tiles.length === 0) {
    console.error("No tiles found! Please add tiles to src/tiles/");
    return;
  }
  
  const groundTile = tiles[0];
  if (!groundTile) {
    console.error("Failed to load ground tile!");
    return;
  }
  
  const state: EditorState = {
    grid: [],
    cursorX: 0,
    cursorY: 0,
    selectedIndex: 0,
    tiles,
    items,
    allPlaceables: [...tiles, ...items],
    editMode: false,
    editingCell: null,
    editMenuCursor: 0,
    editMenuItems: [],
    inputMode: false,
    inputBuffer: '',
    inputField: '',
    roomName: 'untitled_room',
    roomMenuMode: false,
    roomMenuCursor: 0,
    availableRooms: [],
    entityBrowserMode: false,
    entityBrowserCursor: 0,
    entityBrowserList: [],
    nextInstanceId: 0,
    lastSaveTime: 0,
    itemCreatorMode: false,
    itemCreatorStep: 0,
    newItemData: {
      name: '',
      sprite: '',
      flags: {},
      items: [],
    },
    itemEditorMode: false,
    itemEditorListMode: false,
    itemEditorCursor: 0,
    editingItemIndex: 0,
    editingItemMenuCursor: 0,
    editingItemMenuItems: [],
    itemBrowserMode: false,
    itemBrowserCursor: 0,
  };
  
  // Initialize grid after state is created
  state.grid = initializeGrid(groundTile, state);
  
  // Set stdin to raw mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  
  // Initial render
  render(state);
  
  // Handle keypresses
  process.stdin.on('data', async (key: string) => {
    if (state.itemBrowserMode) {
      await handleItemBrowserKey(state, key);
    } else if (state.itemEditorMode) {
      if (state.itemEditorListMode) {
        handleItemEditorListKey(state, key);
      } else {
        await handleItemEditorKey(state, key);
      }
    } else if (state.itemCreatorMode) {
      await handleItemCreatorKey(state, key);
    } else if (state.entityBrowserMode) {
      handleEntityBrowserKey(state, key);
    } else if (state.roomMenuMode) {
      await handleRoomMenuKey(state, key);
    } else if (state.editMode) {
      await handleEditModeKey(state, key);
    } else {
      await handleNormalModeKey(state, key);
    }
    render(state);
  });
  
  // Handle exit
  process.on('SIGINT', async () => {
    await saveRoom(state);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(0);
  });
}

// Run editor if this file is executed directly
if (import.meta.main) {
  startEditor();
}
