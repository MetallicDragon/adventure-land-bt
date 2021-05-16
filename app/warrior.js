import { Task, Sequence, Select, TaskFactory, SUCCESS, FAILURE, RUNNING, Repeat, RepeatUntilFail, Succeed, PushToStack, PopFromStack, IsEmpty, Invert } from "../modules/task.js"
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
        &&  (entity.mtype == "snake")
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

let UsePotionIfNeeded = TaskFactory(Task, {
    run: function (context) {
        if (characterUtils.isLowHealth(context.character) || characterUtils.isLowMp(context.character)) {
            use_hp_or_mp();	
        } else if (!is_on_cooldown("regen_hp") && context.character.hp < context.character.max_hp) {
            use_skill("regen_hp");
        } else if (!is_on_cooldown("regen_mp") && context.character.mp < context.character.max_mp) {
            use_skill("regen_mp");
        }
        return SUCCESS;
    }
});

let AttackTarget = TaskFactory(Task, {
    run: (context) => {
        if(can_attack(context.combatTarget)) {
            attack(context.combatTarget);
            return SUCCESS;
        } else {
            return FAILURE;
        }
    }
});

let FindNearbyTarget = TaskFactory(Task, {
    run: function(context) {
        let foundTarget = getClosestEntity(context, this.filter)
        if (foundTarget) {
            context[this.targetVar] = foundTarget;
            game_log("Monster found: " + foundTarget.name);
            return SUCCESS;
        } else {
            game_log("Monster not found nearby matching filter!");
            return FAILURE;
        }
    },
    filter: grindableMonster,
    targetVar: null
})

let SetCombatTarget = TaskFactory(Task, {
    run: function (context) {
        let target = context[this.targetVar];
        if (target) {
            context.combatTarget = target;
            change_target(context.combatTarget);
            return SUCCESS;
        } else {
            game_log("No monsters found nearby!");
            return FAILURE;
        }
    },
    targetVar: null
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
        new UsePotionIfNeeded(),
        new MoveInRange({target: (context) => context.combatTarget}),
        new Succeed({
            task: new AttackTarget()
        })
    ]
});

let FightCurrentTarget = TaskFactory(RepeatUntilFail, {
    task: new MoveToAndAttackTarget()
});

let GrindNearbyMonsters = TaskFactory(Sequence, {
    tasks: [
        new FindNearbyTarget({ targetVar: "foundTarget" }),
        new SetCombatTarget({ targetVar: "foundTarget" }),
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
            stop("smart");
            game_log("Move Finished: In range.");
            return SUCCESS;
        } else {
            if (context.smartMoving) {
                return RUNNING;
            } else {
                game_log("Move Failed: Done, but not in range!");
                return FAILURE;
            }
        }
    }
});

let EnsureHavePotions = TaskFactory(Select, {
    tasks: [
        new Task({
            run: function(context) {
                context.suppliesNeeded = suppliesNeeded(context);
                if (context.suppliesNeeded.length > 0) {
                    game_log("Need potions!");
                    game_log("Supplies needed: " + context.suppliesNeeded);
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
            new Select({
                tasks: [
                    new FindNearbyTarget(),
                    new Sequence({
                        tasks: [
                            new PushToStack({
                                stackVar: "spawns",
                                elements: function(context) {
                                    let spawns = get_map().monsters.filter(
                                        monster => ["snake"].includes(monster.type)
                                    );
                                    if (spawns.length < 1) {
                                        game_log("No spawns found!");
                                    } else {
                                        game_log("Spawns found: " + spawns.length);
                                    }
                                    return spawns;
                                }
                            }),
                            new RepeatUntilFail({
                                task: new Sequence({
                                    tasks: [
                                        new PopFromStack({
                                            stackVar: "spawns",
                                            poppedVar: "currentSpawn"
                                        }),
                                        new SmartMove({
                                            target: function(context) {
                                                game_log("Moving to Spawn, remaining: " + context.spawns.length);
                                                let [x1, y1, x2, y2] = context.currentSpawn.boundary;
                                                let x = (x1 + x2) / 2;
                                                let y = (y1 + y2) / 2;
                                                return {x: x, y: y};
                                            }
                                        }),
                                        new Invert({
                                            task: new FindNearbyTarget()
                                        })
                                    ]
                                })
                            })
                        ]
                    })
                ]
            }),
            new GrindNearbyMonsters(),
        ]
    })
});

warriorBehaviorTree.rootTask = rootTask;


setInterval(function(){
	warriorBehaviorTree.run();
},1000/4);