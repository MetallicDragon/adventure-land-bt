export const SUCCESS = "success";
export const FAILURE = "failure";
export const RUNNING = "running";

export class Task {
    constructor(options) {
        this.options = options;
        this.hasStarted = false;
        this.willEnd = false;
    }

    start(context) {
        this.hasStarted = true;
    }

    startIfNotStarted(context) {
        if (!this.hasStarted) this.start();
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
    }

    endIfDone(context, result) {
        if (result == SUCCESS || result == FAILURE) this.end();
    }
}

export class Sequence extends Task {
    constructor(options) {
        super(options);
        this.tasks = options.tasks;
        if (!this.tasks || this.tasks.length == 0) {
            throw new Error("Sequence has no tasks!");
        }
    }

    start(context) {
        super.start(context);
        this.remainingTasks = this.tasks;
    }

    run(context) {
        this.startIfNotStarted();
        let result = SUCCESS;
        let done = false;
        while(!done && this.tasks.length > 0) {
            let task = this.tasks.shift();
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
        while(!done && this.tasks.length > 0) {
            let task = this.tasks.shift();
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
        if (!this.task) {
            throw new Error("Decorator has no tasks!");
        }
    }
}

export class Inverter extends Decorator {
    run(context) {
        this.startIfNotStarted(context);
        let result = this.task.run();
        if (result == SUCCESS) result = FAILURE;
        if (result == FAILURE) result = SUCCESS;
        this.endIfDone(context, result);
        return result;
    }
}

export let TestTask = new Sequence({tasks:[
    new Task({run: (context) => {
        game_log("1"); 
        return SUCCESS;
    }}),
    new Task({run: (context) => {
        game_log("2"); 
        return SUCCESS;
    }}),
    new Selector({tasks: [
            new Task({run: (context) => {
                game_log("3")
                return FAILURE;
            }}),
            new Task({run: (context) => {
                game_log("4"); 
                return SUCCESS;
            }}),
            new Task({run: (context) => {
                game_log("E1 ")
                return FAILURE;
            }}),
        ]
    })
]});