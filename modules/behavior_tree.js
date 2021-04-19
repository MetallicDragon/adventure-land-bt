import { TestTask } from "./task.js"

export class BehaviorTree {
    constructor(settings = {}) {
        game_log("Behavior Tree initializing");
        this.rootTask = settings.rootTask;
        this.settings = settings;
        this.context = {character: settings.character};
    }

    run() {
        this.rootTask.run(this.context);
    }
}