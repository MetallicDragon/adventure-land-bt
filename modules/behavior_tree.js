import { TestTask } from "./task.js"

export class BehaviorTree {
    constructor(settings = {}) {
        game_log("Behavior Tree initializing");
        this.rootTask = settings.rootTask;
        this.settings = settings;
        this.context = {character: settings.character};
        this.context.tree = this;
        this.registeredTasks = {};
    }

    run() {
        this.rootTask.run(this.context);
    }

    // registerTask(name, task) {
    //     this.registeredTask[name] = task;
    // }

    // getTaskFromRegistry(task) {
    //     let lookedUpTask;
    //     if (typeof task == "string") {
    //         lookedUpTask = this.registeredTask[task];
    //         if (!lookedUpTask) {
    //             throw new Error("No task registered with name '" + task + "'!");
    //         }
    //         return lookedUpTask;
    //     }
    //     return task;
    // }
}