// Mock domain data models based on tau2-bench

export type TaskStatus = "pending" | "completed";

export interface Task {
  task_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
}

export interface User {
  user_id: string;
  name: string;
  tasks: string[]; // Array of task IDs
}

export interface MockDB {
  tasks: Record<string, Task>;
  users: Record<string, User>;
}

export class MockDatabase {
  private db: MockDB;

  constructor(initialDataPath: string) {
    // Load initial data from provided path
    this.db = this.loadInitialData(initialDataPath);
  }

  private loadInitialData(dataPath?: string): MockDB {
    try {
      if (!dataPath) {
        throw new Error("No database path provided");
      }
      const path = dataPath;
      const data = Deno.readTextFileSync(path);
      const parsedData = JSON.parse(data) as MockDB;

      // Validate the structure
      if (!parsedData.tasks || !parsedData.users) {
        throw new Error("Invalid database structure: missing tasks or users");
      }

      console.error(`✅ Loaded initial database from: ${path}`);
      return parsedData;
    } catch (error) {
      throw new Error(`⚠️  Failed to load initial data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Task operations
  createTask(user_id: string, title: string, description?: string): Task {
    if (!this.db.users[user_id]) {
      throw new Error(`User ${user_id} not found`);
    }

    const task_id = `task_${Object.keys(this.db.tasks).length + 1}`;
    const task: Task = {
      task_id,
      title,
      description,
      status: "pending",
    };

    this.db.tasks[task_id] = task;
    this.db.users[user_id].tasks.push(task_id);

    return task;
  }

  updateTaskStatus(task_id: string, status: TaskStatus): Task {
    const task = this.db.tasks[task_id];
    if (!task) {
      throw new Error(`Task ${task_id} not found`);
    }

    task.status = status;
    return task;
  }

  getUsers(): User[] {
    return Object.values(this.db.users);
  }

  getTask(task_id: string): Task | undefined {
    return this.db.tasks[task_id];
  }

  // Assertion helpers (for testing/evaluation)
  assertNumberOfTasks(user_id: string, expected_number: number): boolean {
    const user = this.db.users[user_id];
    if (!user) {
      throw new Error(`User ${user_id} not found`);
    }
    return user.tasks.length === expected_number;
  }

  assertTaskStatus(task_id: string, expected_status: TaskStatus): boolean {
    const task = this.db.tasks[task_id];
    if (!task) {
      throw new Error(`Task ${task_id} not found`);
    }
    return task.status === expected_status;
  }

  // Get current database state (for debugging)
  getState(): MockDB {
    return this.db;
  }

  // Reset database to initial state
  reset(dataPath: string): void {
    this.db = this.loadInitialData(dataPath);
  }

  // Load from tau2-bench directly (if available)
  static createFromTau2Bench(): MockDatabase {
    const tau2Path = "../../data/mock/db.json";
    try {
      return new MockDatabase(tau2Path);
    } catch {
      console.error("📂 tau2-bench not found, exiting");
      throw new Error("Cannot initialize database: tau2-bench path not available");
    }
  }
}
