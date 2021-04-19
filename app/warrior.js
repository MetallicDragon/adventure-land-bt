import { Task, Sequence, SUCCESS, FAILURE, RUNNING, Repeat, RepeatUntilFail } from "../modules/task.js"
import { BehaviorTree } from  "../modules/behavior_tree.js"


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

class AcquireNearbyTarget extends Task {
    defaultOptions() {
        return {
            run: (context) => {
                let closestValidMonster = getClosestEntity(context, this.options.filter);
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
        }
    }
}

class HasValidCombatTarget extends Task {
    defaultOptions() {
        return {
            run: (context) => {
                if (!context.combatTarget || context.combatTarget.dead) {
                    return FAILURE;
                } else {
                    return SUCCESS
                }
            }
        }
    }
}

class MoveInRange extends Task {
    defaultOptions() {
        return {
            run: (context) => {
                let target = this.options.target(context);
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
        }
    }
}

class MoveToAndAttackTarget extends Sequence {
    defaultOptions() {
        return {
            tasks: [
                new HasValidCombatTarget,
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
        }
    }
}

class FightCurrentTarget extends RepeatUntilFail {
    defaultOptions() {
        return {
            task: new MoveToAndAttackTarget
        }
    }
}

let warriorBehaviorTree = new BehaviorTree({character: character});
let rootTask = new Repeat({
    task: new Sequence({
        tasks: [
            new AcquireNearbyTarget(),
            new FightCurrentTarget,
            new Task(() => {
                loot();
                return SUCCESS;
            })
        ]
    })
});

warriorBehaviorTree.rootTask = rootTask;


setInterval(function(){
	warriorBehaviorTree.run();
},1000/1);