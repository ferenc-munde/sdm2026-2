/**
 * Inventory
 * Manages player inventory system with item storage.
 */

export interface InventoryItem {
  id: string;
  name: string;
  type: string;
  quantity: number;
  maxStack?: number;
}

export class Inventory {
  private items: Map<string, InventoryItem> = new Map();
  private maxSlots: number;
  private slotsUsed: number = 0;

  constructor(maxSlots: number = 8) {
    this.maxSlots = maxSlots;
  }

  /**
   * Add an item to inventory
   */
  addItem(item: InventoryItem): boolean {
    const existing = this.items.get(item.id);

    if (existing) {
      // Item already exists, try to stack
      const maxStack = existing.maxStack || 1;
      if (existing.quantity < maxStack) {
        existing.quantity += item.quantity;
        if (existing.quantity > maxStack) {
          // Overflow
          const overflow = existing.quantity - maxStack;
          existing.quantity = maxStack;
          // Return overflow amount (would need to be handled by caller)
          return false;
        }
        return true;
      }
      return false;
    }

    // New item
    if (this.slotsUsed >= this.maxSlots) {
      return false; // Inventory full
    }

    this.items.set(item.id, { ...item });
    this.slotsUsed++;
    return true;
  }

  /**
   * Remove an item from inventory
   */
  removeItem(itemId: string, quantity: number = 1): boolean {
    const item = this.items.get(itemId);
    if (!item) return false;

    item.quantity -= quantity;
    if (item.quantity <= 0) {
      this.items.delete(itemId);
      this.slotsUsed--;
    }
    return true;
  }

  /**
   * Get item by ID
   */
  getItem(itemId: string): InventoryItem | undefined {
    return this.items.get(itemId);
  }

  /**
   * Get all items
   */
  getItems(): InventoryItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Check if inventory has a specific item
   */
  hasItem(itemId: string, quantity: number = 1): boolean {
    const item = this.items.get(itemId);
    return item ? item.quantity >= quantity : false;
  }

  /**
   * Get number of slots used
   */
  getSlotsUsed(): number {
    return this.slotsUsed;
  }

  /**
   * Get max slots
   */
  getMaxSlots(): number {
    return this.maxSlots;
  }

  /**
   * Check if inventory is full
   */
  isFull(): boolean {
    return this.slotsUsed >= this.maxSlots;
  }

  /**
   * Clear inventory
   */
  clear(): void {
    this.items.clear();
    this.slotsUsed = 0;
  }

  /**
   * Serialize for network transmission
   */
  serialize(): Record<string, InventoryItem> {
    const result: Record<string, InventoryItem> = {};
    this.items.forEach((item, id) => {
      result[id] = { ...item };
    });
    return result;
  }
}
