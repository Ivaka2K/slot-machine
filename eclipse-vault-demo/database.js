"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDirectory = path.join(__dirname,"data");
const databasePath = path.join(dataDirectory,"eclipse-vault.db");
const legacyPath = path.join(dataDirectory,"store.json");
fs.mkdirSync(dataDirectory,{recursive:true});
const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  balance REAL NOT NULL,
  line_bet REAL NOT NULL,
  grid_json TEXT NOT NULL,
  free_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);`);

function rowToUser(row){if(!row)return null;return {id:row.id,username:row.username,passwordSalt:row.password_salt,passwordHash:row.password_hash,balance:row.balance,lineBet:row.line_bet,grid:JSON.parse(row.grid_json),free:JSON.parse(row.free_json)};}
function migrateLegacy(){if(db.prepare("SELECT COUNT(*) AS count FROM users").get().count||!fs.existsSync(legacyPath))return;const legacy=JSON.parse(fs.readFileSync(legacyPath,"utf8"));const insertUser=db.prepare("INSERT INTO users (id,username,password_salt,password_hash,balance,line_bet,grid_json,free_json,created_at) VALUES (@id,@username,@passwordSalt,@passwordHash,@balance,@lineBet,@grid,@free,@createdAt)");const insertSession=db.prepare("INSERT OR REPLACE INTO sessions (token,user_id,expires_at) VALUES (?,?,?)");db.transaction(()=>{for(const user of legacy.users||[]){insertUser.run({id:user.id,username:user.username,passwordSalt:user.passwordSalt,passwordHash:user.passwordHash,balance:user.balance,lineBet:user.lineBet,grid:JSON.stringify(user.grid),free:JSON.stringify(user.free),createdAt:Date.now()});}for(const [token,session] of Object.entries(legacy.sessions||{})){insertSession.run(token,session.userId,session.expiresAt);}})();fs.renameSync(legacyPath,`${legacyPath}.migrated`);}
migrateLegacy();

function findUserByName(username){return rowToUser(db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username));}
function findUserById(id){return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));}
function createUser(user){db.prepare("INSERT INTO users (id,username,password_salt,password_hash,balance,line_bet,grid_json,free_json,created_at) VALUES (@id,@username,@passwordSalt,@passwordHash,@balance,@lineBet,@grid,@free,@createdAt)").run({...user,grid:JSON.stringify(user.grid),free:JSON.stringify(user.free),createdAt:Date.now()});}
function saveGameState(user){db.prepare("UPDATE users SET balance = ?, line_bet = ?, grid_json = ?, free_json = ? WHERE id = ?").run(user.balance,user.lineBet,JSON.stringify(user.grid),JSON.stringify(user.free),user.id);}
function createSession(token,userId,expiresAt){db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());db.prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)").run(token,userId,expiresAt);}
function userFromSession(token){if(!token)return null;const row=db.prepare("SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at >= ?").get(token,Date.now());return rowToUser(row);}
function deleteSession(token){if(token)db.prepare("DELETE FROM sessions WHERE token = ?").run(token);}

module.exports={databasePath,findUserByName,findUserById,createUser,saveGameState,createSession,userFromSession,deleteSession};
