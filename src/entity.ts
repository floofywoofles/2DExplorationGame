export class Entity {
    private name: string;
    private sprite: string;
    private id: string;
    private flags: object;
    private items: string[];

    constructor(name: string, sprite: string, id: string = "", flags: object = {}, items: string[] = []){
        this.name = name;
        this.sprite = sprite;
        this.id = id;
        this.flags = flags;
        this.items = items;
    }

    getName(): string {
        return this.name;
    }

    getSprite(): string {
        return this.sprite;
    }

    getId(): string {
        return this.id;
    }

    getFlags(): object {
        return this.flags;
    }

    getItems(): string[] {
        return this.items;
    }
}
