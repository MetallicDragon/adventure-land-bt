import { TestTask } from "./task.js"

export class BehaviorTree {
    constructor() {
        game_log("Behavior Tree initializing");
        this.rootTask = TestTask;
        this.context = {}
    }

    run() {
        this.rootTask.run(this.context);
    }
}