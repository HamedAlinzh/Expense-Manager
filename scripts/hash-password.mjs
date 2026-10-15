#!/usr/bin/env node
// Generates the ADMIN_PASSWORD_HASH value (argon2id, wrapped in base64 so `$`
// survives Docker Compose / dotenv variable expansion).
//   npm run hash-password
//   echo -n 'my password' | node scripts/hash-password.mjs
import { hash } from "@node-rs/argon2";
import { createInterface } from "node:readline";

async function readPassword() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  const ask = (q) =>
    new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      rl._writeToOutput = (s) => {
        if (s.startsWith(q)) rl.output.write(q);
      };
      rl.question(q, (answer) => {
        rl.close();
        process.stdout.write("\n");
        resolve(answer);
      });
    });
  const first = await ask("New admin password: ");
  const second = await ask("Repeat password: ");
  if (first !== second) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
  return first;
}

const password = await readPassword();
if (password.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}
// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const encoded = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
console.log(`ADMIN_PASSWORD_HASH=b64:${Buffer.from(encoded).toString("base64")}`);
