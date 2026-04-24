import { describe, expect, it } from "vitest";
import { HermesWslWorker } from "./hermes-wsl-worker";

function nodeWorkerScript(body: string) {
  return {
    command: process.execPath,
    args: ["-e", body],
    cwd: process.cwd(),
    env: process.env,
  };
}

const echoWorker = `
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
console.log(JSON.stringify({ type: "ready", pid: process.pid }));
rl.on("line", (line) => {
  const req = JSON.parse(line);
  if (req.type === "shutdown") process.exit(0);
  console.log(JSON.stringify({ id: req.id, type: "started" }));
  console.log(JSON.stringify({ id: req.id, type: "stdout", line: "hello " + req.args.join(" ") }));
  console.log(JSON.stringify({ id: req.id, type: "stderr", line: "warn" }));
  console.log(JSON.stringify({ id: req.id, type: "exit", exitCode: 0 }));
});
`;

describe("HermesWslWorker", () => {
  it("streams stdout/stderr/exit events and reuses the ready worker", async () => {
    const worker = new HermesWslWorker("test", async () => nodeWorkerScript(echoWorker));
    const first = [];
    for await (const event of worker.run({ cwd: process.cwd(), rootPath: process.cwd(), args: ["one"] })) {
      first.push(event);
    }
    const second = [];
    for await (const event of worker.run({ cwd: process.cwd(), rootPath: process.cwd(), args: ["two"] })) {
      second.push(event);
    }
    await worker.stop();

    expect(first).toEqual(expect.arrayContaining([
      { type: "ready", reused: false },
      { type: "stdout", line: "hello one" },
      { type: "stderr", line: "warn" },
      { type: "exit", exitCode: 0 },
    ]));
    expect(second).toEqual(expect.arrayContaining([
      { type: "ready", reused: true },
      { type: "stdout", line: "hello two" },
      { type: "exit", exitCode: 0 },
    ]));
  });

  it("rejects a crashed request and can be recreated for the next run", async () => {
    let launches = 0;
    const crashingWorker = `
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
console.log(JSON.stringify({ type: "ready" }));
rl.on("line", () => process.exit(7));
`;
    const worker = new HermesWslWorker("test", async () => {
      launches += 1;
      return nodeWorkerScript(launches === 1 ? crashingWorker : echoWorker);
    });

    const crashed = (async () => {
      for await (const _event of worker.run({ cwd: process.cwd(), rootPath: process.cwd(), args: ["boom"] })) {
        // drain
      }
    })();
    await expect(crashed).rejects.toThrow();

    const recovered = [];
    for await (const event of worker.run({ cwd: process.cwd(), rootPath: process.cwd(), args: ["ok"] })) {
      recovered.push(event);
    }
    await worker.stop();
    expect(launches).toBe(2);
    expect(recovered).toEqual(expect.arrayContaining([{ type: "stdout", line: "hello ok" }]));
  });

  it("aborts a running request and clears pending state", async () => {
    const slowWorker = `
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
console.log(JSON.stringify({ type: "ready" }));
rl.on("line", (line) => {
  const req = JSON.parse(line);
  console.log(JSON.stringify({ id: req.id, type: "started" }));
  setTimeout(() => console.log(JSON.stringify({ id: req.id, type: "exit", exitCode: 0 })), 5000);
});
`;
    const worker = new HermesWslWorker("test", async () => nodeWorkerScript(slowWorker));
    const controller = new AbortController();
    const run = (async () => {
      for await (const _event of worker.run({ cwd: process.cwd(), rootPath: process.cwd(), args: ["slow"] }, controller.signal)) {
        // drain
      }
    })();
    setTimeout(() => controller.abort(), 50);
    await expect(run).rejects.toThrow(/cancelled/i);
  });
});
