#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { CanvasConfig, Course, Rubric } from './types.js';
import { CanvasClient } from './canvasClient.js';
import { registerCourseTools } from './tools/courses.js';
import { registerStudentTools } from './tools/students.js';
import { registerAssignmentTools } from './tools/assignments.js';
import { registerAssignmentGroupTools } from './tools/assignmentGroups.js';
import { registerModuleTools } from './tools/modules.js';
import { registerPageTools } from './tools/pages.js';
import { registerSectionTools } from './tools/sections.js';
import { registerSubmissionTools } from './tools/submissions.js';
import { registerRubricTools } from './tools/rubrics.js';
import { registerPrompts } from "./tools/prompts.js";
import { registerQuizTools } from "./tools/quizzes.js";
// Load environment variables
dotenv.config();

// Create the MCP server
const server = new McpServer({
  name: "Canvas MCP Server",
  version: "1.0.0"
});

// Read configuration: env var first, then ~/.canvas_token file fallback
let apiToken = process.env.CANVAS_API_TOKEN || "";
if (!apiToken) {
  try {
    apiToken = readFileSync(join(homedir(), ".canvas_token"), "utf-8").trim();
  } catch {
    // file not found or unreadable — will fail validation below
  }
}

const config: CanvasConfig = {
  apiToken,
  baseUrl: process.env.CANVAS_BASE_URL || "https://fhict.instructure.com",
};

// Validate configuration
if (!config.apiToken) {
  console.error("Error: Set CANVAS_API_TOKEN env var or create ~/.canvas_token file");
  process.exit(1);
}

// Create the CanvasClient instance
const canvas = new CanvasClient(config.baseUrl, config.apiToken);

// Register course-related tools
registerCourseTools(server, canvas);
registerStudentTools(server, canvas);
registerAssignmentTools(server, canvas);
registerAssignmentGroupTools(server, canvas);
registerModuleTools(server, canvas);
registerPageTools(server, canvas);
registerSectionTools(server, canvas);
registerSubmissionTools(server, canvas);
registerRubricTools(server, canvas);
registerPrompts(server, canvas);
registerQuizTools(server, canvas);
// Start the server
async function startServer() {
  try {
    console.error("Starting Canvas MCP Server...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Canvas MCP Server running on stdio");
  } catch (error) {
  console.error("Fatal error:", error);
  process.exit(1);
  }
}

startServer();