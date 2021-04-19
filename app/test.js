import { Task, Sequence, SUCCESS, FAILURE, RUNNING, TestTask } from "../modules/task.js"
import { BehaviorTree } from "../modules/behavior_tree.js"

let behaviorTree = new BehaviorTree({rootTask: TestTask});

setInterval(function(){
	behaviorTree.run();
},1000/1);