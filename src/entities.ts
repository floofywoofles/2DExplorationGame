import { Entity } from "./entity";

export class Entities {
    private entities: Entity[];

    constructor() {
        this.entities = [];
    }

    add(entity: Entity): void {
        this.entities.push(entity);
    }

    getAll(): Entity[] {
        return this.entities;
    }

    getById(id: string): Entity | undefined {
        return this.entities.find(entity => entity.getId() === id);
    }

    getByName(name: string): Entity[] {
        return this.entities.filter(entity => entity.getName() === name);
    }

    getCount(): number {
        return this.entities.length;
    }
}

