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
        if (typeof this.tasks === 'function') {
            this.tasks = this.tasks(options);
        }

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

export class Select extends Sequence {
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
                    done = true;
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
        if (typeof this.task === 'function') {
            this.task = this.task(options);
        }

        if (!this.task) {
            throw new Error("Decorator has no tasks!");
        }

    }

    start(context) {
        super.start(context);
        this.task.restart();
    }
}

export class Invert extends Decorator {
    run(context) {
        this.startIfNotStarted(context);
        let result = this.task.run(context);
        if (result == SUCCESS) {
            result = FAILURE;
        } else if (result == FAILURE) {
            result = SUCCESS;
        }
        this.endIfDone(context, result);
        return result;
    }
}

export class Succeed extends Decorator {
    run(context) {
        this.startIfNotStarted(context);
        this.task.run(context);
        let result = SUCCESS;
        this.endIfDone(context, result);
        return result;
    }
}

export class Fail extends Decorator {
    run(context) {
        this.startIfNotStarted(context);
        this.task.run(context);
        let result = FAILURE;
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

export let PushToStack = TaskFactory(Task, {
    run: function(context) {
        if (!context[this.stackVar]) {
            context[this.stackVar] = [];
        }
        context[this.stackVar] = context[this.stackVar].concat(this.elements(context));
        return SUCCESS;
    },
    stackVar: null,
    elements: function() { throw new Error("PushToStack: getStack not specified!")},
});

export let PopFromStack = TaskFactory(Task, {
    run: function(context) {
        if (!context[this.stackVar] || context[this.stackVar].length < 1) {
            return FAILURE;
        } else {
            context[this.poppedVar] = context[this.stackVar].pop();
            return SUCCESS;
        }
    },
    stackVar: null,
    poppedVar: null,
});

export let ClearStack = TaskFactory(Task, {
    run: function(context) {
        context[this.stackVar] = [];
        return SUCCESS;
    },
    stackVar: null,
})

export let IsEmpty = TaskFactory(Task, {
    run: function(context) {
        if (!context[this.stackVar] || context[this.stackVar].length < 1) {
            return SUCCESS;
        } else {
            return FAILURE;
        }
    },
    stackVar: null,
});

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
        new Select({tasks: [
                new Task({run: (context) => {
                    game_log("3: Select First Task Fails")
                    return FAILURE;
                }}),
                new Task({run: (context) => {
                    game_log("4: Select Second Task Succeeds"); 
                    return SUCCESS;
                }}),
                new Task({run: (context) => {
                    game_log("E1: After fail in Select!")
                    return FAILURE;
                }}),
            ]
        }),
        new Invert({
            task: new Task({run: () => FAILURE})
        }),
        new Task({run: (context) => {
            game_log("5: After Inverted Failure in Sequence");
            return SUCCESS
        }}),
        new Sequence({
            tasks: [
                new PushToStack({
                    stackVar: "testStack",
                    elements: function(context) {
                        game_log("Adding [1,2,3] to testStack");
                        return [1,2,3];
                    }
                }),
                new RepeatUntilFail({
                    task: new Sequence({
                        tasks: [
                            new PopFromStack({
                                stackVar: "testStack",
                                poppedVar: "popped"
                            }),
                            new Task({
                                run: function(context) {
                                    game_log("Popped element: " + context.popped);
                                    return SUCCESS;
                                }
                            })
                        ]
                    })
                }),
                new Task({
                    run: function(context) {
                        game_log("Done popping, testing IsEmpty!");
                        return SUCCESS;
                    }
                }),
                new IsEmpty({stackVar: "testStack"}),
                new Task({
                    run: function(context) {
                        game_log("IsEmpty Succeeded!");
                        return SUCCESS;
                    }
                }),
            ]
        }),
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