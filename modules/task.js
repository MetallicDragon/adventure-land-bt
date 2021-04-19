
export const SUCCESS = "success";
export const FAILURE = "failure";
export const RUNNING = "running";

export class Task {
    constructor(options) {
        this.options = options;
        if (this.options.start) this.start = this.options.start;
        if (this.options.run) this.run = this.options.run;
        if (this.options.end) this.end = this.options.end;
    }

    start(context) {

    };

    run(context) {

    };

    end(context) {

    };
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
        this.remainingTasks = this.tasks;
    }

    run(context) {
        while(this.tasks.length > 0) {
            let task = this.tasks.shift();
            let result = task.run();
            switch (result) {
                case SUCCESS:
                    break;
                case FAILURE:
                    return FAILURE;
                case RUNNING:
                    this.remainingTasks.unshift(task);
                    return RUNNING;
            }
        }
        return SUCCESS;
    }

    end(context) {}

    remainingTasks() {
        let currentTaskIndex = this.tasks.indexOf(this.currentTask);
        if (currentTaskIndex < 0) currentTaskIndex = 0;
        return this.tasks.slice(currentTaskIndex);
    }
}

export class Selector extends Sequence {
    run(context) {
        while(this.tasks.length > 0) {
            let task = this.tasks.shift();
            let result = task.run();
            switch (result) {
                case SUCCESS:
                    return SUCCESS;
                case FAILURE:
                    break;
                case RUNNING:
                    this.remainingTasks.unshift(task);
                    return RUNNING;
            }
        }
        return FAILURE;
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