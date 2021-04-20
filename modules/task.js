export const SUCCESS = "success";
export const FAILURE = "failure";
export const RUNNING = "running";

export function TaskFactory(parent, options) {
    return class extends parent {
        defaultOptions() {
            return options;
        }
    }
}

export class Task {
    constructor(optionsOrRunFunction) {
        if (typeof optionsOrRunFunction == "function") {
            this.options = {
                ...this.defaultOptions(),
                run: optionsOrRunFunction
            }
        } else {
            this.options = {
                ...this.defaultOptions(),
                ...optionsOrRunFunction
            };
        }
        this.restart();
    }

    start(context) {
        this.hasStarted = true;
        if (this.options.start) this.options.start(context);
    }

    startIfNotStarted(context) {
        if (!this.hasStarted) this.start(context);
    }

    run(context) {
        this.startIfNotStarted(context)
        let result = FAILURE;
        if (this.options.run) {
            result = this.options.run(context);
        } else {
            throw new Error("Task has no run option defined!");
        }
        this.endIfDone(context, result);
        return result;
    }

    end(context) {
        if (this.options.end) this.options.end(context);
    }

    endIfDone(context, result) {
        if (result == SUCCESS || result == FAILURE) this.end(context);
    }

    restart() {
        this.hasStarted = false;
        this.willEnd = false;
    }

    defaultOptions() {
        return {};
    };
}

export class Sequence extends Task {
    constructor(options) {
        super(options);
        this.tasks = this.options.tasks;
        if (!this.tasks || this.tasks.length == 0) {
            throw new Error("Sequence has no tasks!");
        }
    }

    start(context) {
        super.start(context);
        this.remainingTasks = [...this.tasks];
        for (let task of this.remainingTasks) {
            task.restart();
        }
    }

    run(context) {
        this.startIfNotStarted(context);
        let result = SUCCESS;
        let done = false;
        while(!done && this.remainingTasks.length > 0) {
            let task = this.remainingTasks.shift();
            let taskResult = task.run(context);
            switch (taskResult) {
                case SUCCESS:
                    break;
                case FAILURE:
                    result = FAILURE;
                    done = true;
                    break;
                case RUNNING:
                    this.remainingTasks.unshift(task);
                    done = true;
                    result = RUNNING;
            }
        }
        this.endIfDone(context, result);
        return result;
    }
}

export class Selector extends Sequence {
    run(context) {
        this.startIfNotStarted(context)
        let result = FAILURE;
        let done = false;
        while(!done && this.remainingTasks.length > 0) {
            let task = this.remainingTasks.shift();
            let taskResult = task.run(context);
            switch (taskResult) {
                case SUCCESS:
                    result = SUCCESS;
                    done = true;
                    break;
                case FAILURE:
                    break;
                case RUNNING:
                    this.remainingTasks.unshift(task);
                    result = RUNNING;
                    break;
            }
        }
        this.endIfDone(context, result);
        return result
    }
}

export class Decorator extends Task {
    constructor(options) {
        super(options);
        this.task = this.options.task;
        if (!this.task) {
            throw new Error("Decorator has no tasks!");
        }
    }

    start(context) {
        super.start(context);
        this.task.restart();
    }
}

export class Inverter extends Decorator {
    run(context) {
        this.startIfNotStarted(context);
        let result = this.task.run(context);
        if (result == SUCCESS) result = FAILURE;
        if (result == FAILURE) result = SUCCESS;
        this.endIfDone(context, result);
        return result;
    }
}

export class Repeat extends Decorator {
    run(context) {
        this.startIfNotStarted(context);
        let taskResult = this.task.run(context);
        if (taskResult == FAILURE || taskResult == SUCCESS) {
            this.task.restart();
        }
        let result = this.transformTaskResult(taskResult);
        this.endIfDone(context, result);
        return result;
    }

    transformTaskResult(result) {
        return RUNNING;
    }
}

export class RepeatUntilFail extends Repeat {
    transformTaskResult(result) {
        if (result != FAILURE) {
            return RUNNING;
        } else {
            return SUCCESS;
        }
    }
}

export let TestTask = new Sequence({
    tasks: [
        new Task({run: (context) => {
            game_log("1: Sequence Start"); 
            return SUCCESS;
        }}),
        new Task({run: (context) => {
            game_log("2: Sequence Continues"); 
            return SUCCESS;
        }}),
        new Selector({tasks: [
                new Task({run: (context) => {
                    game_log("3: Selector First Task Fails")
                    return FAILURE;
                }}),
                new Task({run: (context) => {
                    game_log("4: Selector Second Task Succeeds"); 
                    return SUCCESS;
                }}),
                new Task({run: (context) => {
                    game_log("E1: After fail in Selector!")
                    return FAILURE;
                }}),
            ]
        }),
        new Inverter({
            task: new Task({run: () => FAILURE})
        }),
        new Task({run: (context) => {
            game_log("5: After Inverted Failure in Sequence");
            return SUCCESS
        }}),
        new RepeatUntilFail({
            start: (context) => context.repeatUntilFailureCount = 0,
            task: new Task({
                run: (context) => {
                    context.repeatUntilFailureCount++;
                    if (context.repeatUntilFailureCount <= 3) {
                        game_log("Repeat Until Failure count: " + context.repeatUntilFailureCount + "/3");
                        return SUCCESS;
                    } else {
                        return FAILURE;
                    }
                }
            })
        }),
        new Repeat({
            start: function(context) { context.repeatCount = 0 },
            task: new Task({
                run: (context) => {
                    context.repeatCount++;
                    if (context.repeatCount <= 3) {
                        game_log("Final Repeat ran " + context.repeatCount + "/3 SUCCESSes");
                        return SUCCESS;
                    } else {
                        game_log("Final Repeat FAILUREs: " + context.repeatCount);
                        return FAILURE;
                    }
                }
            })
        })
    ]
});