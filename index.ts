import { startEditor } from './src/editor/editor';
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
loader.load();
