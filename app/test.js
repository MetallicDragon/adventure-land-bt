import { Task, Sequence, SUCCESS, FAILURE, RUNNING } from "../modules/task.js"
import { BehaviorTree } from "../modules/behavior_tree.js"

let behaviorTree = new BehaviorTree();

setInterval(function(){
	behaviorTree.run();
},1000/1);