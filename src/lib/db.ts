import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

import {
	SEED_CASES,
	SEED_EVIDENCE,
	SEED_DIGITAL_EVIDENCE,
	SEED_ACTIVITIES,
} from "./seed-data";
import { hashPassword } from "./auth";

const DB_PATH = path.join(process.cwd(), "data", "kavalan.db");

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(DB_PATH);

export function initDb(): void {
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA foreign_keys = ON");

	db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      caseRef TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      riskLevel TEXT NOT NULL DEFAULT 'LOW',
      riskScore INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL,
      dateCreated TEXT NOT NULL,
      dateOfIncident TEXT NOT NULL,
      assignedAgent TEXT NOT NULL,
      suspectCount INTEGER NOT NULL DEFAULT 0,
      evidenceCount INTEGER NOT NULL DEFAULT 0,
      victimName TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      lat REAL,
      lng REAL,
      geocodedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      caseId TEXT NOT NULL,
      catalogRef TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      collectedAt TEXT NOT NULL,
      location TEXT NOT NULL,
      analyst TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      imagePath TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS autopsy_reports (
      id TEXT PRIMARY KEY,
      caseId TEXT NOT NULL,
      rawReport TEXT NOT NULL,
      analyzedAt TEXT NOT NULL,
      causeOfDeath TEXT NOT NULL,
      mannerOfDeath TEXT NOT NULL,
      postmortemInterval TEXT NOT NULL,
      injuryPattern TEXT NOT NULL,
      toxicologyFindings TEXT NOT NULL,
      woundsCount INTEGER NOT NULL DEFAULT 0,
      bodyTemperature REAL NOT NULL DEFAULT 0,
      rigorMortisStage INTEGER NOT NULL DEFAULT 0,
      livorMortisState TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      analysisNotes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tod_estimates (
      id TEXT PRIMARY KEY,
      caseId TEXT NOT NULL,
      estimatedAt TEXT NOT NULL,
      bodyTemp REAL NOT NULL,
      ambientTemp REAL NOT NULL,
      rigorMortisStage INTEGER NOT NULL DEFAULT 0,
      livorMortisState TEXT NOT NULL DEFAULT '',
      lastSeenAlive TEXT NOT NULL DEFAULT '',
      estimatedTodEarliest TEXT NOT NULL,
      estimatedTodLatest TEXT NOT NULL,
      centralEstimate TEXT NOT NULL DEFAULT '',
      confidenceLevel REAL NOT NULL DEFAULT 0,
      methodology TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS digital_evidence (
      id TEXT PRIMARY KEY,
      caseId TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      sourceName TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      location TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      anomalyScore REAL NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS case_activities (
      id TEXT PRIMARY KEY,
      caseId TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      agent TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_calls (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      purpose TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      durationMs INTEGER NOT NULL,
      status TEXT NOT NULL,
      promptChars INTEGER NOT NULL DEFAULT 0,
      responseChars INTEGER NOT NULL DEFAULT 0,
      errorMessage TEXT NOT NULL DEFAULT '',
      samplePrompt TEXT NOT NULL DEFAULT '',
      sampleResponse TEXT NOT NULL DEFAULT ''
    );
  `);

	// Idempotent column adds for existing DBs that pre-date a schema change.
	const existingCols = (
		db.prepare("PRAGMA table_info(cases)").all() as Array<{ name: string }>
	).map((c) => c.name);
	if (!existingCols.includes("lat"))
		db.exec("ALTER TABLE cases ADD COLUMN lat REAL");
	if (!existingCols.includes("lng"))
		db.exec("ALTER TABLE cases ADD COLUMN lng REAL");
	if (!existingCols.includes("geocodedAt"))
		db.exec("ALTER TABLE cases ADD COLUMN geocodedAt TEXT");

	const todCols = (
		db.prepare("PRAGMA table_info(tod_estimates)").all() as Array<{
			name: string;
		}>
	).map((c) => c.name);
	if (!todCols.includes("centralEstimate"))
		db.exec(
			"ALTER TABLE tod_estimates ADD COLUMN centralEstimate TEXT NOT NULL DEFAULT ''",
		);

	const evidenceCols = (
		db.prepare("PRAGMA table_info(evidence)").all() as Array<{
			name: string;
		}>
	).map((c) => c.name);
	if (!evidenceCols.includes("imagePath"))
		db.exec(
			"ALTER TABLE evidence ADD COLUMN imagePath TEXT NOT NULL DEFAULT ''",
		);

	const casesCols2 = (
		db.prepare("PRAGMA table_info(cases)").all() as Array<{ name: string }>
	).map((c) => c.name);
	if (!casesCols2.includes("autopsyDraft"))
		db.exec(
			"ALTER TABLE cases ADD COLUMN autopsyDraft TEXT NOT NULL DEFAULT ''",
		);

	const row = db.prepare("SELECT COUNT(*) as count FROM cases").get() as {
		count: number;
	};
	if (row.count === 0) {
		seedIfEmpty();
	}

	const analystRow = db
		.prepare("SELECT COUNT(*) as count FROM analysts")
		.get() as { count: number };
	if (analystRow.count === 0) {
		seedAnalysts();
	}
}

const DEMO_ANALYSTS = [
	{ username: "investigator", name: "Det. A. Ramirez", password: "kavalan2026" },
	{ username: "admin", name: "System Administrator", password: "admin2026" },
];

function seedAnalysts(): void {
	const insert = db.prepare(`
    INSERT OR IGNORE INTO analysts (id, username, name, passwordHash, createdAt)
    VALUES (@id, @username, @name, @passwordHash, @createdAt)
  `);
	const now = new Date().toISOString();
	for (const a of DEMO_ANALYSTS) {
		insert.run({
			id: `analyst-${a.username}`,
			username: a.username,
			name: a.name,
			passwordHash: hashPassword(a.password),
			createdAt: now,
		});
	}
}

export function seedIfEmpty(): void {
	const insertCase = db.prepare(`
    INSERT OR IGNORE INTO cases
      (id, caseRef, title, description, status, riskLevel, riskScore, location,
       dateCreated, dateOfIncident, assignedAgent, suspectCount, evidenceCount, victimName, tags)
    VALUES
      (@id, @caseRef, @title, @description, @status, @riskLevel, @riskScore, @location,
       @dateCreated, @dateOfIncident, @assignedAgent, @suspectCount, @evidenceCount, @victimName, @tags)
  `);

	const insertEvidence = db.prepare(`
    INSERT OR IGNORE INTO evidence
      (id, caseId, catalogRef, type, description, collectedAt, location, analyst, notes, confidence)
    VALUES
      (@id, @caseId, @catalogRef, @type, @description, @collectedAt, @location, @analyst, @notes, @confidence)
  `);

	const insertDigital = db.prepare(`
    INSERT OR IGNORE INTO digital_evidence
      (id, caseId, sourceType, sourceName, timestamp, location, subject, description, confidence, anomalyScore, tags)
    VALUES
      (@id, @caseId, @sourceType, @sourceName, @timestamp, @location, @subject, @description, @confidence, @anomalyScore, @tags)
  `);

	const insertActivity = db.prepare(`
    INSERT OR IGNORE INTO case_activities
      (id, caseId, type, description, createdAt, agent)
    VALUES
      (@id, @caseId, @type, @description, @createdAt, @agent)
  `);

	const runAll = db.transaction(() => {
		for (const c of SEED_CASES) {
			insertCase.run({
				id: c.id,
				caseRef: c.caseRef,
				title: c.title,
				description: c.description,
				status: c.status,
				riskLevel: c.riskLevel,
				riskScore: c.riskScore,
				location: c.location,
				dateCreated: c.dateCreated,
				dateOfIncident: c.dateOfIncident,
				assignedAgent: c.assignedAgent,
				suspectCount: c.suspectCount,
				evidenceCount: c.evidenceCount,
				victimName: c.victimName,
				tags: c.tags,
			});
		}

		for (const e of SEED_EVIDENCE) {
			insertEvidence.run({
				id: e.id,
				caseId: e.caseId,
				catalogRef: e.catalogRef,
				type: e.type,
				description: e.description,
				collectedAt: e.collectedAt,
				location: e.location,
				analyst: e.analyst,
				notes: e.notes,
				confidence: e.confidence,
			});
		}

		for (const d of SEED_DIGITAL_EVIDENCE) {
			insertDigital.run({
				id: d.id,
				caseId: d.caseId,
				sourceType: d.sourceType,
				sourceName: d.sourceName,
				timestamp: d.timestamp,
				location: d.location,
				subject: d.subject,
				description: d.description,
				confidence: d.confidence,
				anomalyScore: d.anomalyScore,
				tags: d.tags,
			});
		}

		for (const a of SEED_ACTIVITIES) {
			insertActivity.run({
				id: a.id,
				caseId: a.caseId,
				type: a.type,
				description: a.description,
				createdAt: a.createdAt,
				agent: a.agent,
			});
		}
	});

	runAll();
}

initDb();
