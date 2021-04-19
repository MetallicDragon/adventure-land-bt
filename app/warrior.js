import { Task, Sequence, SUCCESS, FAILURE, RUNNING, TestTask, Repeat, RepeatUntilFail } from "../modules/task.js"
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

let warriorBehaviorTree = new BehaviorTree({character: character});
let rootTask = new Repeat({
    task: new Sequence({
        start: () => {
            game_log("Main Sequence Started");
        },
        tasks: [
            new Task({
                run: (context) => {
                    let closestValidMonster = getClosestEntity(context, grindableMonster);
                    if (closestValidMonster) {
                        game_log("Monster found: " + closestValidMonster.name);
                        context.combatTarget = closestValidMonster;
                        change_target(context.combatTarget);
                        return SUCCESS;
                    } else {
                        game_log("No monsters found nearby!");
                        return FAILURE;
                    }
                }
            }),
            new RepeatUntilFail({
                task: new Sequence({
                    tasks: [
                        new Task({
                            run: (context) => {
                                if (!context.combatTarget || context.combatTarget.dead) {
                                    game_log("Target gone");
                                    return FAILURE;
                                }
                                if (!is_in_range(context.combatTarget)) {
                                    move(
                                        context.character.x + (context.combatTarget.x-context.character.x)/2, 
                                        context.character.y + (context.combatTarget.y-context.character.y)/2
                                    );
                                    game_log("Moving to target");
                                } else if(can_attack(context.combatTarget)) {
                                    attack(context.combatTarget);
                                    game_log("Attacking target");
                                }
                                return RUNNING;
                            }
                        })
                    ]
                }),
            }),
            new Task({
                run: () => {
                    loot();
                    return SUCCESS;
                }
            })
        ]
    })
});

warriorBehaviorTree.rootTask = rootTask;


setInterval(function(){
	warriorBehaviorTree.run();
},1000/1);