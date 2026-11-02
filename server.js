
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

process.env.APPS_SCRIPT_URL ||= "https://script.google.com/macros/s/AKfycbx62TOwtmu0IxWpPEMIhqOi3CcflyM13Lp29C8xlgsDosFMdDMU_4NneNH5u_gGHFQaOg/exec";
process.env.APPS_SCRIPT_API_KEY ||= "abcdefghijklmnopqrstuvwxyz012345";


async function callAppsScript(action, params) {
  const response = await fetch(process.env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      action,
      ...params,
      apiKey: process.env.APPS_SCRIPT_API_KEY
    }),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Apps Script returned HTTP ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}

function createServer() {
  const server = new McpServer({
    name: "geocache-explorer",
    version: "1.0.0"
  });

server.registerTool(
  "search_nearby_caches",
  {
    description: "Find geocaches near a geographic coordinate",
    inputSchema: {
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiusMiles: z.number().positive().max(100),
      minDifficulty: z.number().min(1).max(5).default(1),
      maxDifficulty: z.number().min(1).max(5).default(5),
      minTerrain: z.number().min(1).max(5).default(1),
      maxTerrain: z.number().min(1).max(5).default(5)
    }
  },
  async (args) => {
    const caches = await callAppsScript("nearby", args);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(caches)
      }]
    };
  }
);

server.registerTool(
  "search_city_caches",
  {
    description: "Find geocaches inside a city's geographic boundary",
    inputSchema: {
      city: z.string().default("Overland Park")
    }
  },
  async ({ city }) => {
    const caches = await callAppsScript("city", { city });

    return {
      content: [{
        type: "text",
        text: JSON.stringify(caches)
      }]
    };
  }
);

  return server;
}

const app = express();
app.use(express.json());
app.use("/mcp", (req, res, next) => {
  const expectedToken = process.env.MCP_AUTH_TOKEN;

  if (!expectedToken ||
      req.get("Authorization") !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

app.post("/mcp", async (req, res) => {
  const server = createServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(process.env.PORT || 8080, "0.0.0.0", () => {
  console.log("MCP HTTP server running");
});