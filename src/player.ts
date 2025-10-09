export class Player {
    private y: number;
    private x: number;

    constructor(y: number, x: number){
        this.y = y;
        this.x = x;
    }

    getY(): number {
        return this.y;
    }

    getX(): number {
        return this.x;
    }

    /**
     * Attempts to move in the specified direction
     * @param canMoveTo - Function to check if the target position is valid
     */
    tryIncrementY(canMoveTo: (x: number, y: number) => boolean): void {
        if (canMoveTo(this.x, this.y + 1)) {
            this.y++;
        }
    }

    /**
     * Attempts to move in the specified direction
     * @param canMoveTo - Function to check if the target position is valid
     */
    tryDecrementY(canMoveTo: (x: number, y: number) => boolean): void {
        if (canMoveTo(this.x, this.y - 1)) {
            this.y--;
        }
    }

    /**
     * Attempts to move in the specified direction
     * @param canMoveTo - Function to check if the target position is valid
     */
    tryIncrementX(canMoveTo: (x: number, y: number) => boolean): void {
        if (canMoveTo(this.x + 1, this.y)) {
            this.x++;
        }
    }

    /**
     * Attempts to move in the specified direction
     * @param canMoveTo - Function to check if the target position is valid
     */
    tryDecrementX(canMoveTo: (x: number, y: number) => boolean): void {
        if (canMoveTo(this.x - 1, this.y)) {
            this.x--;
        }
    }

    incrementY(): void {
        this.y++;
    }

    decrementY(): void {
        this.y--;
    }

    incrementX(): void {
        this.x++;
    }

    decrementX(): void {
        this.x--;
    }
}
