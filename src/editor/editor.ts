// TUI Editor for 10x10 rooms
// PSEUDOCODE IMPLEMENTATION

interface TileData {
  name: string;
  sprite: string;
  id: string;
  flags: Record<string, boolean | string | number>;
  items?: string[];
}

interface GridCell {
  tile: TileData;
  instanceId: string;
  instanceFlags?: Record<string, boolean | string | number>;
  instanceItems?: string[];
}

interface EditorState {
  grid: GridCell[][];
  cursorX: number;
  cursorY: number;
  selectedIndex: number;
  tiles: TileData[];
  items: TileData[];
  allPlaceables: TileData[];
  editMode: boolean;
  editingCell: { x: number; y: number } | null;
  editMenuCursor: number;
  editMenuItems: string[];
  inputMode: boolean;
  inputBuffer: string;
  inputField: string;
  roomName: string;
  roomMenuMode: boolean;
  roomMenuCursor: number;
  availableRooms: string[];
  entityBrowserMode: boolean;
  entityBrowserCursor: number;
  entityBrowserList: Array<{ instanceId: string; name: string; x: number; y: number; roomName: string }>;
  nextInstanceId: number;
  lastSaveTime: number;
}

// Load all tiles from tiles folder
async function loadTiles(): Promise<TileData[]> {
  // PSEUDOCODE:
  // 1. Read all .json files from src/tiles/
  // 2. Parse each JSON file
  // 3. Return array of TileData
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

// Load all items from items folder
async function loadItems(): Promise<TileData[]> {
  // PSEUDOCODE:
  // 1. Read all .json files from src/items/
  // 2. Parse each JSON file
  // 3. Return array of TileData
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

// Generate unique instance ID
function generateInstanceId(state: EditorState): string {
  const id = `instance_${state.nextInstanceId}`;
  state.nextInstanceId++;
  return id;
}

// Initialize 10x10 grid with ground tile
function initializeGrid(groundTile: TileData, state: EditorState): GridCell[][] {
  // PSEUDOCODE:
  // Create 10x10 array filled with ground tile
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

// Clear terminal screen
function clearScreen(): void {
  // PSEUDOCODE:
  // Write ANSI escape code to clear screen
  process.stdout.write('\x1b[2J\x1b[H');
}

// Render the main grid
function renderGrid(state: EditorState): void {
  // PSEUDOCODE:
  // 1. Clear screen
  // 2. Draw top border
  // 3. For each row (0-9):
  //    - Draw left border
  //    - For each cell:
  //      - If cursor position, highlight cell
  //      - Draw sprite
  //    - Draw right border
  // 4. Draw bottom border
  
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

// Render bottom info box
function renderInfoBox(state: EditorState): void {
  // PSEUDOCODE:
  // 1. Draw separator line
  // 2. Show "Selected: [name] [sprite]"
  // 3. Show flags if any
  // 4. Show controls: WASD=move E/Q=cycle 1-9=items Space=place/edit Ctrl+C=save&exit
  
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
  output += '  │ WASD=move  E/Q=cycle  1-9=items  R=room menu   │\n';
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

// Full render
function render(state: EditorState): void {
  clearScreen();
  if (state.entityBrowserMode) {
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

// Handle cursor movement
function moveCursor(state: EditorState, dx: number, dy: number): void {
  // PSEUDOCODE:
  // 1. Calculate new position
  // 2. Clamp to 0-9 range
  // 3. Update cursor position
  state.cursorX = Math.max(0, Math.min(9, state.cursorX + dx));
  state.cursorY = Math.max(0, Math.min(9, state.cursorY + dy));
}

// Cycle through placeables
function cycleSelection(state: EditorState, direction: number): void {
  // PSEUDOCODE:
  // 1. Increment/decrement selectedIndex
  // 2. Wrap around if needed
  const newIndex = state.selectedIndex + direction;
  if (newIndex < 0) {
    state.selectedIndex = state.allPlaceables.length - 1;
  } else if (newIndex >= state.allPlaceables.length) {
    state.selectedIndex = 0;
  } else {
    state.selectedIndex = newIndex;
  }
}

// Select item by number key
function selectItem(state: EditorState, itemIndex: number): void {
  // PSEUDOCODE:
  // 1. Calculate actual index (tiles.length + itemIndex)
  // 2. If valid, set as selected
  const actualIndex = state.tiles.length + itemIndex;
  if (actualIndex < state.allPlaceables.length) {
    state.selectedIndex = actualIndex;
  }
}

// Place selected tile/item
function placeSelected(state: EditorState): void {
  // PSEUDOCODE:
  // 1. Get selected placeable
  // 2. Clone its data
  // 3. Place in grid at cursor position with unique instance ID
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

// Build entity list for browsing across all rooms
async function buildEntityListFromAllRooms(state: EditorState, entityName: string): Promise<void> {
  // PSEUDOCODE:
  // Find all placed entities with the same name across all saved rooms
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
        cell.instanceItems.push(state.inputBuffer);
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
      state.inputMode = true;
      state.inputBuffer = '';
      state.inputField = 'new_item';
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

// Load available rooms
async function loadAvailableRooms(): Promise<string[]> {
  // PSEUDOCODE:
  // Read all .json files from src/rooms/
  try {
    const fs = await import('fs/promises');
    const files = await fs.readdir('./src/rooms');
    return files.filter(f => f.endsWith('.json'));
  } catch (error) {
    return [];
  }
}

// Load room from file
async function loadRoom(state: EditorState, filename: string): Promise<void> {
  // PSEUDOCODE:
  // 1. Read room file
  // 2. Parse JSON
  // 3. Rebuild grid from saved data including instance IDs
  
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
          // Find matching tile
          const tile = state.allPlaceables.find(t => t.name === cellData.tile);
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

// Save room to file
async function saveRoom(state: EditorState): Promise<void> {
  // PSEUDOCODE:
  // 1. Convert grid to saveable format including instance IDs
  // 2. Use room name as filename
  // 3. Write to src/rooms/ folder
  // 4. Show save notification
  
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

// Main editor function
export async function startEditor(): Promise<void> {
  // PSEUDOCODE:
  // 1. Load tiles and items
  // 2. Initialize state
  // 3. Set stdin to raw mode
  // 4. Initial render
  // 5. Listen for keypresses
  // 6. On keypress:
  //    - If editMode: handleEditModeKey
  //    - Else: handleNormalModeKey
  //    - Re-render
  // 7. On exit: restore terminal, save room
  
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
    if (state.entityBrowserMode) {
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
