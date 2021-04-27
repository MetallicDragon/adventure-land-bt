import { Task, Sequence, Selector, TaskFactory, SUCCESS, FAILURE, RUNNING, Repeat, RepeatUntilFail } from "../modules/task.js"
import { BehaviorTree } from  "../modules/behavior_tree.js"
import * as characterUtils from "../modules/character_utils.js"


let getClosestEntity = function(context, filter) {
    let closest_distance = 999999;
    
    let closest_monster = null;
    for (key in parent.entities) {
        let entity = parent.entities[key];

        if (!filter(context, entity)) {
            continue;
        }

        let d = distance(context.character, entity);
        if (d < closest_distance) {
            closest_distance = d;
            closest_monster = entity;
        }
    }
    return closest_monster;
}

let grindableMonster = function(context, entity) {
    return 	(entity.type == "monster")
        && 	(!entity.dead)
        //&& 	(this.manager.options.whitelisted_spawns.includes(entity.mtype))
        &&  (entity.mtype == "bee")
        //&& 	(entity.xp >= this.manager.options.monster_min_xp)
        //&& 	(entity.attack < this.manager.options.monster_max_attack)
}

let suppliesNeeded = function(context) {
    let suppliesNeeded = [];
    let potionsToKeepInStock = context.potionsToKeepInStock || ["hpot0", "mpot0"]
    let potionRestockThreshold = context.potionRestockThreshold || 200
    for (let p_type of potionsToKeepInStock) {
        let need_more = characterUtils.itemCount(context.character, p_type) < potionRestockThreshold;
        if (need_more) {
            suppliesNeeded.push([p_type, 400]);
        }
    }
    
    return suppliesNeeded;
}

let AcquireNearbyTarget = TaskFactory(Task, {
    run: function (context) {
        let closestValidMonster = getClosestEntity(context, this.filter);
        if (closestValidMonster) {
            game_log("Monster found: " + closestValidMonster.name);
            context.combatTarget = closestValidMonster;
            change_target(context.combatTarget);
            return SUCCESS;
        } else {
            game_log("No monsters found nearby!");
            return FAILURE;
        }
    },
    filter: grindableMonster
});

let HasValidCombatTarget = TaskFactory(Task, {
    run: (context) => {
        if (!context.combatTarget || context.combatTarget.dead) {
            return FAILURE;
        } else {
            return SUCCESS
        }
    }
});

let MoveInRange = TaskFactory(Task, {
    run: function(context) {
        let target = this.target(context);
        if (!target) return FAILURE;
        if (is_moving(context.character)) {
            return RUNNING;
        } else if (!is_in_range(target)) {
            move(
                context.character.x + (target.x-context.character.x)/2, 
                context.character.y + (target.y-context.character.y)/2
            );
            return RUNNING
        } else {
            return SUCCESS;
        }
    }
});

let MoveToAndAttackTarget = TaskFactory(Sequence, {
    tasks: [
        new HasValidCombatTarget(),
        new MoveInRange({target: (context) => context.combatTarget}),
        new Task({
            run: (context) => {
                if(can_attack(context.combatTarget)) {
                    attack(context.combatTarget);
                }
                return SUCCESS;
            }
        })
    ]
});

let FightCurrentTarget = TaskFactory(RepeatUntilFail, {
    task: new MoveToAndAttackTarget()
});

let GrindNearbyMonsters = TaskFactory(Sequence, {
    tasks: [
        new AcquireNearbyTarget(),
        new FightCurrentTarget(),
        new Task(() => {
            loot();
            return SUCCESS;
        })
    ]
});

let SmartMove = TaskFactory(Task,  {
    start: function(context) { 
        context.smartMoveTarget = this.target(context);
        context.smartMoving = false;
        game_log("Starting move");
        if (context.smartMoveTarget) {
            context.smartMoving = true;
            smart_move(context.smartMoveTarget.x, context.smartMoveTarget.y)
               .then((context) => context.smartMoving = false);
        }
    },
    run: function(context) {
        if (distance(context.character, context.smartMoveTarget) < 100) {
            return SUCCESS;
        } else {
            if (context.smartMoving) {
                game_log("Move Finished: In range.");
                return RUNNING;
            } else {
                game_log("Move Failed: Done, but not in range!");
                return FAILURE;
            }
        }
    }
});

let EnsureHavePotions = TaskFactory(Selector, {
    tasks: [
        new Task({
            run: function(context) {
                context.suppliesNeeded = suppliesNeeded(context);
                game_log("Need potions!");
                game_log("Supplies needed: " + context.suppliesNeeded);
                if (context.suppliesNeeded.length > 0) {
                    return FAILURE;
                } else { 
                    return SUCCESS;
                }
            }
        }),
        new Sequence({
            tasks: [
                new Task({
                    run: function(context) {
                        game_log("Finding potion NPC...");
                        context.potionNpc = find_npc("fancypots");
                        if (context.potionNpc) {
                            return SUCCESS
                        } else {
                            return FAILURE
                        }
                    }
                }),
                new SmartMove({target: (context) => context.potionNpc}),
                new Task({
                    run: function(context) {
                        game_log("Buying Supplies");
                        let nextSupply = suppliesNeeded(context)[0];
                        if (nextSupply) {
                            buy(nextSupply[0], nextSupply[1]);
                            return RUNNING;
                        } else {
                            return SUCCESS
                        }
                    }
                })
            ]
        })
    ]
});

let warriorBehaviorTree = new BehaviorTree({character: character});
let rootTask = new Repeat({
    task: new Sequence({
        tasks: [
            new EnsureHavePotions(),
            new GrindNearbyMonsters(),
        ]
    })
});

warriorBehaviorTree.rootTask = rootTask;


setInterval(function(){
	warriorBehaviorTree.run();
},1000/4);