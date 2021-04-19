import { TestTask } from "./task.js"

export class BehaviorTree {
    constructor() {
        game_log("Behavior Tree initializing");
        this.rootTask = TestTask;
    }

    run() {
        this.rootTask.run();
    }
}