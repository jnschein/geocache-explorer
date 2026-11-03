# Geocache Explorer

A geocaching application demonstrating the integration of **Google Apps Script, Google Sheets, municipal GIS data, interactive mapping, and AI through the Model Context Protocol (MCP)**.

The project allows users to explore geocaches geographically through a browser-based map or query the same data conversationally using Claude.ai.

## Features

- **Interactive Map:** Displays geocaches using Leaflet and OpenStreetMap.
- **Geographic Search:** Finds geocaches within a specified distance of a location.
- **Advanced Filtering:** Filters by difficulty and terrain ratings.
- **Municipal GIS Integration:** Retrieves Overland Park, Kansas, city boundaries from the city's ArcGIS service and identifies geocaches within those boundaries.
- **GPX Import:** Imports geocache data from GPX files into Google Sheets, avoiding duplicate cache IDs.
- **AI Integration:** Exposes geocache search functionality to Claude.ai through a custom MCP server.
- **Cloud Hosting:** Runs the MCP server in a Docker container hosted on Google Cloud Run.

## Technology Stack

| Technology | Purpose |
|---|---|
| Google Apps Script | Application logic, geographic calculations, and HTTP endpoints |
| Google Sheets | Geocache data storage |
| JavaScript / Node.js | Application and MCP server development |
| Leaflet / OpenStreetMap | Interactive mapping |
| ArcGIS REST API | Municipal geographic boundary data |
| MCP SDK | AI tool integration |
| Express | HTTP server |
| Docker | Containerization |
| Google Cloud Run | MCP server hosting |
| Google Secret Manager | Secure credential storage |
| Claude.ai | Conversational interface |

## Architecture

The application provides two interfaces to the same underlying geocache data.

**Browser-based mapping**

```text
Browser
   |
   v
Google Apps Script HTML Service
   |
   v
Leaflet / OpenStreetMap
   |
   v
Google Apps Script
   |
   +---- Google Sheets (Geocache Data)
   |
   +---- Overland Park ArcGIS Service
```

**AI integration**

```text
Claude.ai
   |
   | MCP / Streamable HTTP
   v
Google Cloud Run
   |
   v
Node.js MCP Server
   |
   | HTTPS / JSON
   v
Google Apps Script
   |
   +---- Google Sheets
   |
   +---- Municipal GIS Data
```

## Screenshots

### Interactive Geocache Map

*Insert screenshot of the Leaflet map here.*

### Claude.ai Integration

*Insert screenshot showing Claude requesting geocache information and receiving results through the MCP server.*

## MCP Tools

The server exposes two tools to compatible AI clients.

### `search_nearby_caches`

Searches for geocaches near a geographic coordinate.

Parameters include latitude, longitude, search radius in miles, difficulty range, and terrain range.

### `search_city_caches`

Finds geocaches within a municipal boundary.

Currently implemented for Overland Park, Kansas.

## Technical Implementation

### Google Apps Script

Apps Script provides the application's business logic, including:

- Reading and filtering geocache records stored in Google Sheets.
- Calculating geographic distances using the Haversine formula.
- Importing GPX data using XML parsing.
- Querying municipal GIS services.
- Performing point-in-polygon calculations to identify caches within city boundaries.
- Exposing functionality through an HTTP JSON interface.

### GIS Integration

The application retrieves official municipal boundary geometry from the City of Overland Park's ArcGIS REST service.

Geographic coordinates are evaluated against the returned boundary geometry to determine whether individual geocaches fall within the city.

### MCP Integration

A custom Node.js MCP server exposes geographic search functionality as tools that Claude.ai can invoke.

The server uses the MCP Streamable HTTP transport and communicates with the Google Apps Script backend.

### Deployment and Security

The MCP server is packaged as a Docker container and deployed to Google Cloud Run.

- Application credentials are stored in Google Cloud Secret Manager.
- The MCP endpoint requires bearer-token authentication.
- Google Apps Script requests are authenticated using a separate API key.
- Cloud Run is configured for on-demand scaling.

## Project Purpose

This project was developed as a hands-on exploration of Google Workspace development, cloud deployment, municipal GIS integration, and AI-enabled applications.

It demonstrates how lightweight Google Workspace applications can be extended through external APIs, geographic processing, cloud services, and modern AI integration protocols.

## Data Sources

- Geocache data imported from GPX files.
- City boundary geometry provided by the City of Overland Park GIS services.
- Map tiles provided by OpenStreetMap.

Geocache data is not included in this repository. Users must supply data they are authorized to use.

## Security Notes

API keys, authentication tokens, and other credentials are intentionally excluded from the repository. Deployment requires separately configured environment variables and Google Cloud secrets.

## Disclaimer

This is an independent demonstration project and is not affiliated with or endorsed by Geocaching HQ or the City of Overland Park.
