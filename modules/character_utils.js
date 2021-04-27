export function hpPercent(c){ return c.hp / c.max_hp };
export function mpPercent(c){ return c.mp / c.max_mp };
export function isLowHealth(c){ return hpPercent(c) < 0.5 };
export function isLowMp(c){ return mpPercent(c) < 0.5 };

export function itemCount(c, item_name) {
    let count = 0;
    for (let item of c.items) {
        if (item != null && item.name == item_name) {
            count += item.q ?? 1;
        }
    };
    return count;
}

export function countFreeInventorySpaces(character) {
    let count = 0;
    for (let item of character.items) {
        if (!item) count++;
    }
    return count
}