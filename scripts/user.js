#!/usr/bin/env node
"use strict";

/* =========================================================================
 * scripts/user.js — manage ABC design logins (used when AUTH=on).
 *
 *   npm run user:add -- kari            add a user (asks for name + password)
 *   npm run user:add -- kari --admin    … as administrator
 *   npm run user:list
 *   npm run user:passwd -- kari         new password
 *   npm run user:remove -- kari
 *
 * Passwords are typed without echo and stored as scrypt hashes in
 * data/users.json. Nothing is ever printed back.
 * ========================================================================= */

const path = require("path");
const readline = require("readline");

const { createAuth } = require("../lib/auth");

const auth = createAuth({ dataDir: path.join(__dirname, "..", "data") });

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Print the question, then swallow what is typed.
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function newPassword() {
  const a = await ask("Passord (minst 10 tegn): ", true);
  const b = await ask("Gjenta passordet: ", true);
  if (a !== b) throw new Error("Passordene er ikke like");
  return a;
}

async function main() {
  const [cmd, username, flag] = process.argv.slice(2);
  if (cmd === "add") {
    if (!username) throw new Error("Bruk: npm run user:add -- <brukernavn> [--admin]");
    const name = (await ask("Fullt navn: ")).trim();
    const pw = await newPassword();
    await auth.addUser(username, name, pw, flag === "--admin" ? "admin" : "user");
    console.log("La til " + username + (flag === "--admin" ? " (administrator)" : "") + ".");
  } else if (cmd === "list") {
    const users = await auth.readUsers();
    if (!users.length) console.log("Ingen brukere ennå. Legg til med: npm run user:add -- <brukernavn> --admin");
    users.forEach((u) => console.log(u.username.padEnd(20) + (u.role === "admin" ? "admin " : "      ") + u.name));
  } else if (cmd === "passwd") {
    if (!username) throw new Error("Bruk: npm run user:passwd -- <brukernavn>");
    await auth.setPassword(username, await newPassword());
    console.log("Nytt passord satt. " + username + " er logget ut overalt.");
  } else if (cmd === "remove") {
    if (!username) throw new Error("Bruk: npm run user:remove -- <brukernavn>");
    await auth.removeUser(username);
    console.log("Fjernet " + username + ".");
  } else {
    console.log("Bruk: user.js add|list|passwd|remove [brukernavn] [--admin]");
  }
}

main().catch((err) => {
  console.error("Feil: " + err.message);
  process.exit(1);
});
