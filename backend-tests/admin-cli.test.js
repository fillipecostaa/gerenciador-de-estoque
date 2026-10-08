import assert from "node:assert/strict"
import test from "node:test"
import { runCreateAdmin } from "../scripts/create-admin.js"

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function makeDependencies(overrides = {}) {
  const calls = { prompts: [], created: [], disconnected: 0, output: [] }
  const inputAnswers = ["Admin", "admin@example.test"]
  const passwordAnswers = ["test-password", "test-password"]
  const dependencies = {
    interactive: true,
    HttpError,
    prompts: {
      input: async (options) => {
        calls.prompts.push({ kind: "input", ...options })
        return inputAnswers.shift()
      },
      password: async (options) => {
        calls.prompts.push({ kind: "password", ...options })
        return passwordAnswers.shift()
      },
    },
    authService: {
      createFirstAdmin: async (data) => { calls.created.push(data) },
    },
    prisma: {
      $disconnect: async () => { calls.disconnected += 1 },
    },
    output: {
      log: (message) => calls.output.push(message),
      error: (message) => calls.output.push(message),
    },
    ...overrides,
  }

  return { dependencies, calls, passwordAnswers }
}

test("collects the first administrator interactively with masked password confirmation", async () => {
  const { dependencies, calls } = makeDependencies()

  assert.equal(await runCreateAdmin(dependencies), 0)
  assert.deepEqual(calls.created, [{ name: "Admin", email: "admin@example.test", password: "test-password" }])
  assert.equal(calls.disconnected, 1)

  const passwordPrompts = calls.prompts.filter((prompt) => prompt.kind === "password")
  assert.equal(passwordPrompts.length, 2)
  assert.ok(passwordPrompts.every((prompt) => prompt.mask === "*"))
  assert.equal(passwordPrompts[1].validate("test-password"), true)
  assert.equal(typeof passwordPrompts[1].validate("different"), "string")
  assert.ok(calls.output.every((message) => !message.includes("test-password")))
})

test("rejects arguments and non-interactive input without prompting or creating users", async () => {
  for (const overrides of [{ args: ["--password=must-not-be-used"] }, { interactive: false }]) {
    const { dependencies, calls } = makeDependencies(overrides)

    assert.equal(await runCreateAdmin(dependencies), 1)
    assert.equal(calls.prompts.length, 0)
    assert.equal(calls.created.length, 0)
    assert.equal(calls.disconnected, 1)
    assert.ok(calls.output.every((message) => !message.includes("must-not-be-used")))
  }
})

test("does not create an administrator with a mismatching confirmation", async () => {
  const { dependencies, calls, passwordAnswers } = makeDependencies()
  passwordAnswers[1] = "different"

  assert.equal(await runCreateAdmin(dependencies), 1)
  assert.equal(calls.created.length, 0)
  assert.equal(calls.disconnected, 1)
})

test("handles prompt cancellation without exposing its error details", async () => {
  const cancellation = Object.assign(new Error("private terminal state"), { name: "ExitPromptError" })
  const { dependencies, calls } = makeDependencies({
    prompts: { input: async () => { throw cancellation } },
  })

  assert.equal(await runCreateAdmin(dependencies), 1)
  assert.equal(calls.created.length, 0)
  assert.equal(calls.disconnected, 1)
  assert.match(calls.output.join("\n"), /cancelada/)
  assert.doesNotMatch(calls.output.join("\n"), /private terminal state/)
})

test("shows only expected validation and conflict errors from the service", async () => {
  for (const status of [400, 409]) {
    const { dependencies, calls } = makeDependencies({
      authService: { createFirstAdmin: async () => { throw new HttpError(status, "Mensagem segura.") } },
    })

    assert.equal(await runCreateAdmin(dependencies), 1)
    assert.deepEqual(calls.output, ["Mensagem segura."])
    assert.equal(calls.disconnected, 1)
  }
})

test("hides database details and internal HttpError messages", async () => {
  const errors = [new Error("private database URI"), new HttpError(500, "private configuration")]

  for (const error of errors) {
    const { dependencies, calls } = makeDependencies({
      authService: { createFirstAdmin: async () => { throw error } },
    })

    assert.equal(await runCreateAdmin(dependencies), 1)
    assert.equal(calls.disconnected, 1)
    assert.doesNotMatch(calls.output.join("\n"), /private/)
  }
})

test("reports disconnect failure without exposing the underlying error", async () => {
  const { dependencies, calls } = makeDependencies({
    prisma: { $disconnect: async () => { throw new Error("private database URI") } },
  })

  assert.equal(await runCreateAdmin(dependencies), 1)
  assert.doesNotMatch(calls.output.join("\n"), /private database URI/)
  assert.match(calls.output.join("\n"), /encerrar a conexão/)
})
