import path from "path";
import fs from "fs";

/**
 * Persistence manager for tracking consumed/collected entities across game sessions.
 * Stores consumed entity instance IDs in a JSON file.
 */
export class PersistenceManager {
    private consumedEntities: Set<string>;
    private persistenceFile: string;

    constructor() {
        // Store persistence file in project root
        const projectRoot = process.cwd();
        this.persistenceFile = path.join(projectRoot, ".persistence.json");
        this.consumedEntities = new Set<string>();
        this.load();
    }

    /**
     * Load consumed entities from persistence file
     */
    private load(): void {
        try {
            if (fs.existsSync(this.persistenceFile)) {
                const data = fs.readFileSync(this.persistenceFile, "utf8");
                const parsed = JSON.parse(data) as { consumedEntities: string[] };
                this.consumedEntities = new Set(parsed.consumedEntities || []);
            }
        } catch (error) {
            console.error(`[PERSISTENCE] Error loading persistence file: ${error}`);
            this.consumedEntities = new Set<string>();
        }
    }

    /**
     * Save consumed entities to persistence file
     */
    private save(): void {
        try {
            const data = {
                consumedEntities: Array.from(this.consumedEntities),
            };
            fs.writeFileSync(this.persistenceFile, JSON.stringify(data, null, 2), "utf8");
        } catch (error) {
            console.error(`[PERSISTENCE] Error saving persistence file: ${error}`);
        }
    }

    /**
     * Mark an entity as consumed/collected
     * @param instanceId - The instance ID of the entity to mark as consumed
     */
    markAsConsumed(instanceId: string): void {
        this.consumedEntities.add(instanceId);
        this.save();
    }

    /**
     * Check if an entity is consumed/collected
     * @param instanceId - The instance ID to check
     * @returns true if the entity is consumed
     */
    isConsumed(instanceId: string): boolean {
        return this.consumedEntities.has(instanceId);
    }

    /**
     * Unmark an entity as consumed (restore it)
     * @param instanceId - The instance ID of the entity to restore
     */
    unmarkAsConsumed(instanceId: string): void {
        this.consumedEntities.delete(instanceId);
        this.save();
    }

    /**
     * Get all consumed entity instance IDs
     * @returns Array of consumed instance IDs
     */
    getAllConsumed(): string[] {
        return Array.from(this.consumedEntities);
    }

    /**
     * Clear all persisted data (reset everything)
     */
    clearAll(): void {
        this.consumedEntities.clear();
        this.save();
    }

    /**
     * Get the persistence file path (for editor use)
     * @returns The path to the persistence file
     */
    getPersistenceFilePath(): string {
        return this.persistenceFile;
    }
}

