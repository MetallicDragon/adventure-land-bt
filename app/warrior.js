import { Task, Sequence, Select, TaskFactory, SUCCESS, FAILURE, RUNNING, Repeat, RepeatUntilFail, Succeed, PushToStack, PopFromStack, IsEmpty, Invert, Fail } from "../modules/task.js"
import { BehaviorTree } from  "../modules/behavior_tree.js"
import * as characterUtils from "../modules/character_utils.js"


let getClosestEntity = function(context, filter) {
    let closest_distance = 999999;
    
    let closest_monster = null;
    for (key in parent.entities) {
        let entity = parent.entities[key];

        if (!filter(entity)) {
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

let monsterTypeWhitelist = ["snake"];
let grindableMonster = function(entity) {
    return 	(entity.type == "monster")
        && 	(!entity.dead)
        //&& 	(this.manager.options.whitelisted_spawns.includes(entity.mtype))
        &&  (monsterTypeWhitelist.includes(entity.mtype))
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

let Attack = TaskFactory(Task, {
    run: function (context) {
        if(can_attack(context[this.targetVar])) {
            attack(context[this.targetVar]);
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
            //game_log("Monster found: " + foundTarget.name);
            return SUCCESS;
        } else {
            //game_log("Monster not found nearby matching filter!");
            return FAILURE;
        }
    },
    filter: grindableMonster,
    targetVar: null
})

let ChangeTarget = TaskFactory(Task, {
    run: function (context) {
        let target = context[this.targetVar];
        if (target) {
            change_target(target);
            return SUCCESS;
        } else {
            game_log("No combat target found!");
            return FAILURE;
        }
    },
    targetVar: null
});

let IsAlive = TaskFactory(Task, {
    run: function(context) {
        if (!context[this.targetVar] || context[this.targetVar].dead) {
            return FAILURE;
        } else {
            return SUCCESS
        }
    }
});

let SmartMove = TaskFactory(Task,  {
    start: function(context) { 
        context.smartMoveTarget = this.target(context);
        context.smartMoving = false;
        game_log("Starting move");
        if (context.smartMoveTarget) {
            context.smartMoving = true;
            smart_move(context.smartMoveTarget)
                .then(() => {
                    context.smartMoving = false;
                });
        }
    },
    run: function(context) {
        if (context.smartMoveTarget.x && context.smartMoveTarget.y) {
            let inRange = distance(context.character, context.smartMoveTarget) < this.range
            if (inRange) {
                stop("smart");
                game_log("Move Finished: In specified range.");
                return SUCCESS;
            }
        }

        if (context.smartMoving) {
            return RUNNING;
        } else {
            game_log("Move Finished: smart_move complete!");
            return SUCCESS;
        }
    },
    range: 100
});

let MoveInRange = TaskFactory(Select, {
    tasks: function(options) {
        return [
            new Task({
                run: function(context) {
                    if (context[this.targetVar] && is_in_range(context[this.targetVar])) {
                        return SUCCESS;
                    } else {
                        return FAILURE;
                    }
                },
                targetVar: options.targetVar
            }),
            new Sequence({
                tasks: [
                    new Task({
                        run: function(context) {
                            if (distance(context.character, context[this.targetVar]) < 250) {
                                return FAILURE;
                            } else {
                                return SUCCESS
                            }
                        },
                        targetVar: options.targetVar
                    }),
                    new SmartMove({target: (context) => context[options.targetVar]})
                ],
            }),
            new Task({
                run: function(context) {
                    let target = context[options.targetVar];
                    if (!target || target.dead) return FAILURE;
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
            })
        ]
    }
});

let MoveToAndAttack = TaskFactory(Sequence, {
    tasks: function(options) {
        return [
            new IsAlive({targetVar: options.targetVar}),
            new UsePotionIfNeeded(),
            new MoveInRange({targetVar: options.targetVar}),
            new Succeed({
                task: new Attack({targetVar: options.targetVar})
            })
        ]
    },
    targetVar: null
});

let FightUntilDead = TaskFactory(RepeatUntilFail, {
    start: function(context) {
        game_log("Engaging with " + context[this.targetVar].name);
    },
    task: function(options) { 
        return new MoveToAndAttack({targetVar: options.targetVar})
    },
    targetVar: null
});

let GrindNearbyMonsters = TaskFactory(Sequence, {
    tasks: [
        new FindNearbyTarget({ targetVar: "combatTarget" }),
        new ChangeTarget({ targetVar: "combatTarget" }),
        new FightUntilDead({ targetVar: "combatTarget" }),
        new Task(() => {
            loot();
            return SUCCESS;
        })
    ]
});

let EnsureHavePotions = TaskFactory(Select, {
    tasks: [
        new Fail({
            task: new PushToStack({
                stackVar: "suppliesNeeded",
                elements: suppliesNeeded
            })
        }),
        new IsEmpty({stackVar: "suppliesNeeded"}),
        new Task({
            run: function(context) {
                game_log("Need potions!");
                game_log("Supplies needed: " + context.suppliesNeeded);
                return FAILURE;
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
                new RepeatUntilFail({
                    task: new Sequence({
                        tasks: [
                            new PopFromStack({
                                stackVar: "suppliesNeeded",
                                poppedVar: "nextSupply"
                            }),
                            new Task({
                                run: function(context) {
                                    game_log("Buying Supply: " + context.nextSupply);
                                    buy(context.nextSupply[0], context.nextSupply[1]);
                                    return SUCCESS;
                                }
                            })
                        ]
                    })
                })
            ]
        })
    ]
});

let FindSpawnWithGrindableMonsters = TaskFactory(Select, {
    tasks: function(options) {
        return [
            new FindNearbyTarget({filter: options.filter}),
            new Sequence({
                tasks: [
                    new PushToStack({
                        stackVar: "spawns",
                        elements: function(context) {
                            let spawns = get_map().monsters.filter(options.spawnFilter);
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
                                    task: new FindNearbyTarget({filter: options.filter})
                                })
                            ]
                        })
                    })
                ]
            })
        ]
    }
})

let SellItems = TaskFactory(Sequence, {
    tasks: function(options) {
        return [
            new SmartMove({
                target: function(context) {
                    return find_npc("basics");
                },
                range: 50
            }),
            new RepeatUntilFail({
                task: new Sequence({
                    tasks: [
                        new PopFromStack({
                            stackVar: options.stackVar,
                            poppedVar: "itemToSell"
                        }),
                        new Task(function(context) {
                            let itemIndex = context.itemToSell;
                            let item = context.character.items[itemIndex]
                            if (item) {
                                game_log("Selling " + item.name);
                                sell(itemIndex)
                                return RUNNING
                            } else {
                                // Sells just one item per 'tick'
                                return SUCCESS
                            }
                        })
                    ]
                })
            })
        ];
    },
    stackVar: null
})

let DepositItems = TaskFactory(Sequence, {
    tasks: function(options) {
        return [
            new SmartMove({
                target: function(context) {
                    return find_npc("items0");
                },
                range: 50
            }),
            new RepeatUntilFail({
                task: new Sequence({
                    tasks: [
                        new PopFromStack({
                            stackVar: options.stackVar,
                            poppedVar: "itemToDeposit"
                        }),
                        new Task(function(context) {
                            let itemIndex = context.itemToDeposit;
                            let item = context.character.items[itemIndex]
                            if (item) {
                                game_log("Depositing " + item.name);
                                bank_store(itemIndex);
                                return SUCCESS
                            } else {
                                // Deposit just one item per 'tick'
                                return SUCCESS
                            }
                        })
                    ]
                })
            })
        ];
    },
    stackVar: null
})

let ManageInventory = TaskFactory(Sequence, {
    tasks: [
        new PushToStack({
            stackVar: "itemSlotsToSell",
            elements: function(context) {
                let sellItemsWhitelist = [
                    "hpamulet",
                    "hpbelt",
                ];
                let itemSlotsToSell = [];
                for (i in context.character.items) {
                    let item = context.character.items[i];
                    let shouldSellItem = item && sellItemsWhitelist.includes(item.name);
                    if (shouldSellItem) {
                        itemSlotsToSell.push(i);
                    }
                }
                return itemSlotsToSell;
            }
        }),
        new PushToStack({
            stackVar: "itemSlotsToDeposit",
            elements: function(context) {
                let depositItemsBlacklist = [
                    "hpot0", 
                    "mpot0", 
                    "hpot1", 
                    "mpot1", 
                    "hpotx", 
                    "mpotx"
                ];
                let itemSlotsToDeposit = [];
                for (i in context.character.items) {
                    let item = context.character.items[i];
                    let shouldDepositItem = item && !depositItemsBlacklist.includes(item.name);
                    if (shouldDepositItem) {
                        itemSlotsToDeposit.push(i);
                    }
                }
                return itemSlotsToDeposit;
            }
        }),
        new Select({
            tasks: [
                new IsEmpty({stackVar: "itemSlotsToSell"}),
                new SellItems({stackVar: "itemSlotsToSell"})
            ]
        }),
        new Select({
            tasks: [
                new IsEmpty({stackVar: "itemSlotsToDeposit"}),
                new DepositItems({stackVar: "itemSlotsToDeposit"})
            ]
        })
    ]
})

let ManageInventoryIfNeeded = TaskFactory(Select, {
    tasks: [
        new Task(function(context) {
            let freeSpaces = characterUtils.countFreeInventorySpaces(context.character);
            if (freeSpaces < 3) {
                return FAILURE;
            } else {
                return SUCCESS;
            }
        }),
        new ManageInventory(),
    ]
})

let EnsureOnMap = TaskFactory(Select, {
    tasks: function(options) {
        return [
            new Task(function(context) {
                if (context.character.map == options.map) {
                    return SUCCESS;
                } else {
                    return FAILURE;
                }
            }),
            new SmartMove({
                target: function(context) {
                    return options.map
                }
            })
        ];
    },
    map: null
})

let warriorBehaviorTree = new BehaviorTree({character: character});
let rootTask = new Repeat({
    task: new Sequence({
        tasks: [
            new ManageInventoryIfNeeded(),
            new EnsureHavePotions(),
            new EnsureOnMap({map: "main"}),
            new FindSpawnWithGrindableMonsters({
               filter: grindableMonster,
               spawnFilter: (spawn) => monsterTypeWhitelist.includes(spawn.type)
            }),
            new GrindNearbyMonsters({filter: grindableMonster}),
        ]
    })
});

warriorBehaviorTree.rootTask = rootTask;


setInterval(function(){
	warriorBehaviorTree.run();
},1000/4);