import { pathToFileURL } from "node:url"

export async function runCreateAdmin({
  prompts,
  authService,
  prisma,
  HttpError,
  output = console,
  args = [],
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
}) {
  let exitCode = 0

  try {
    if (args.length > 0) {
      output.error("Execute este comando sem argumentos. Informe as credenciais apenas nos campos interativos.")
      exitCode = 1
    } else if (!interactive) {
      output.error("Abra um terminal interativo para criar o primeiro administrador.")
      exitCode = 1
    } else {
      const name = await prompts.input({ message: "Nome do primeiro administrador:" })
      const email = await prompts.input({ message: "E-mail do primeiro administrador:" })
      const password = await prompts.password({ message: "Senha:", mask: "*" })
      const confirmation = await prompts.password({
        message: "Confirme a senha:",
        mask: "*",
        validate: (value) => value === password || "As senhas não coincidem.",
      })

      if (confirmation !== password) {
        output.error("As senhas não coincidem. Execute o comando novamente.")
        exitCode = 1
      } else {
        await authService.createFirstAdmin({ name, email, password })
        output.log("Primeiro administrador criado com sucesso.")
      }
    }
  } catch (error) {
    exitCode = 1

    if (error?.name === "ExitPromptError" || error?.name === "AbortPromptError") {
      output.log("Criação do administrador cancelada.")
    } else if (HttpError && error instanceof HttpError && [400, 409].includes(error.status)) {
      output.error(error.message)
    } else {
      output.error("Não foi possível criar o administrador. Verifique a configuração e a conexão com o banco de dados.")
    }
  } finally {
    try {
      await prisma.$disconnect()
    } catch {
      exitCode = 1
      output.error("Não foi possível encerrar a conexão com o banco de dados.")
    }
  }

  return exitCode
}

async function main() {
  let prisma

  try {
    await import("dotenv/config")
    const prompts = await import("@inquirer/prompts")
    const { createAuthService } = await import("../services/auth.service.js")
    const { HttpError } = await import("../lib/errors.js")
    const { default: prismaClient } = await import("../lib/prisma.js")
    prisma = prismaClient

    const authService = createAuthService({ prisma, jwtSecret: process.env.JWT_SECRET })
    process.exitCode = await runCreateAdmin({
      prompts,
      authService,
      prisma,
      HttpError,
      args: process.argv.slice(2),
    })
  } catch {
    process.exitCode = 1
    console.error("Não foi possível iniciar o comando. Verifique as dependências e a configuração do servidor.")

    if (prisma) {
      try {
        await prisma.$disconnect()
      } catch {
        console.error("Não foi possível encerrar a conexão com o banco de dados.")
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
