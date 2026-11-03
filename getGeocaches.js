/**********************************************************
*
* getGeocaches.js
*
* Description:  This code runs in Apps Script withing GCP.
* 		It imports GIS data in the form of a .gsx
*		file and provides the means to search and
*		display mapped results within an HTML page.
*
* Written by Jim Schein
*
**********************************************************/



// get geocache data from Google Sheet
function getCaches() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Caches");

  if (!sheet) {
    throw new Error("Caches worksheet not found");
  }

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  return data
    .filter(row => row[0]) // Skip rows without a CacheID
    .map(row =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index]])
      )
    );
}

// Trigonometric distance calculation -- thank you Claude!
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth's radius in miles
  const toRadians = degrees => degrees * Math.PI / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}

// find caches within a set radius (in miles) from a provided lat/long
function findNearbyCaches(latitude, longitude, radiusMiles) {
  return getCaches()
    .filter(cache =>
      cache.Latitude !== "" &&
      cache.Longitude !== "" &&
      Number.isFinite(Number(cache.Latitude)) &&
      Number.isFinite(Number(cache.Longitude))
    )
    .map(cache => ({
      ...cache,
      DistanceMiles: calculateDistance(
        latitude,
        longitude,
        Number(cache.Latitude),
        Number(cache.Longitude)
      )
    }))
    .filter(cache => cache.DistanceMiles <= radiusMiles)
    .sort((a, b) => a.DistanceMiles - b.DistanceMiles);
}

// use for initial import of GPX file with cache data.  File can be generated via Pocket Query from geocaching.com
function importGPX(fileId) {
  const file = DriveApp.getFileById(fileId);
  const xml = XmlService.parse(file.getBlob().getDataAsString());
  const root = xml.getRootElement();

  const gpxNS = root.getNamespace();
  const cacheNS = XmlService.getNamespace(
    "http://www.groundspeak.com/cache/1/0"
  );

  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Caches");

  const existing = sheet.getDataRange().getValues();
  const existingIds = new Set(
    existing.slice(1).map(row => String(row[0]))
  );

  const rows = [];

  for (const wpt of root.getChildren("wpt", gpxNS)) {
    const cache = wpt.getChild("cache", cacheNS);
    if (!cache) continue;

    const id = wpt.getChildText("name", gpxNS);
    if (existingIds.has(id)) continue;

    const get = name => cache.getChildText(name, cacheNS);

    const status =
      cache.getAttribute("archived")?.getValue() === "True"
        ? "Archived"
        : cache.getAttribute("available")?.getValue() === "True"
          ? "Active"
          : "Unavailable";

    rows.push([
      id,
      get("name"),
      Number(wpt.getAttribute("lat").getValue()),
      Number(wpt.getAttribute("lon").getValue()),
      get("type"),
      Number(get("difficulty")),
      Number(get("terrain")),
      status
    ]);

    existingIds.add(id);
  }

  if (rows.length) {
    sheet.getRange(
      sheet.getLastRow() + 1, 1, rows.length, 8
    ).setValues(rows);
  }

  console.log(`Imported ${rows.length} new geocaches`);
}

// entry point for application
function doGet() {
  return HtmlService.createHtmlOutputFromFile("Map")
    .setTitle("Geocache Explorer");
}

// advanced filtering capability
function searchCaches(latitude, longitude, radiusMiles, minDifficulty, maxDifficulty, minTerrain, maxTerrain) {
  return findNearbyCaches(latitude, longitude, radiusMiles)
    .filter(cache =>
      Number(cache.Difficulty) >= minDifficulty &&
      Number(cache.Difficulty) <= maxDifficulty &&
      Number(cache.Terrain) >= minTerrain &&
      Number(cache.Terrain) <= maxTerrain
    );
}

// Overland Park GIS
const CITY_GIS_URL =
  "https://maps.opkansas.org/mapping/rest/services/MixedInfo/City_Boundary/MapServer/0/query";

// Draw city boundary on map
function getCityBoundary(city = "Overland Park") {
  const params = {
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson"
  };

  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const response = UrlFetchApp.fetch(`${CITY_GIS_URL}?${query}`);
  const geojson = JSON.parse(response.getContentText());

  if (geojson.error) {
    throw new Error(JSON.stringify(geojson.error));
  }

  if (!geojson.features?.length) {
    throw new Error("No boundary features returned");
  }

  return geojson;
}

// Ray-casting algorithm: longitude = x, latitude = y
function pointInRing(lat, lon, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(lat, lon, polygon) {
  if (!pointInRing(lat, lon, polygon[0])) return false;

  // Subsequent rings represent holes
  return !polygon.slice(1).some(ring =>
    pointInRing(lat, lon, ring)
  );
}

function pointInGeometry(lat, lon, geometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(lat, lon, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(polygon =>
      pointInPolygon(lat, lon, polygon)
    );
  }

  return false;
}

// identify caches within boundary
function getCachesInCity(city = "Overland Park") {
  const boundary = getCityBoundary(city);

  return getCaches().filter(cache => {
    const lat = Number(cache.Latitude);
    const lon = Number(cache.Longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        cache.Latitude === "" || cache.Longitude === "") {
      return false;
    }

    return boundary.features.some(feature =>
      pointInGeometry(lat, lon, feature.geometry)
    );
  });
}

// Authorization
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const expectedKey = PropertiesService
  .getScriptProperties()
  .getProperty("API_KEY");

if (!expectedKey || request.apiKey !== expectedKey) {
  throw new Error("Unauthorized");
}

delete request.apiKey;
    let result;

    switch (request.action) {
      case "nearby":
        result = searchCaches(
          request.latitude,
          request.longitude,
          request.radiusMiles,
          request.minDifficulty ?? 1,
          request.maxDifficulty ?? 5,
          request.minTerrain ?? 1,
          request.maxTerrain ?? 5
        );
        break;

      case "city":
        result = getCachesInCity(request.city);
        break;

      default:
        throw new Error("Unknown action");
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function testCitySearch() {
  const caches = getCachesInCity("Overland Park");
  console.log(`${caches.length} caches inside Overland Park`);
  console.log(JSON.stringify(caches.slice(0, 5), null, 2));
}

function testCityBoundary() {
  const geojson = getCityBoundary("Overland Park");

  console.log("Features:", geojson.features.length);
  console.log("Geometry:", geojson.features[0].geometry.type);
  console.log("Properties:", JSON.stringify(geojson.features[0].properties));
}

function testGetCaches() {
  console.log(JSON.stringify(getCaches(), null, 2));
}

function testNearbyCaches() {
  const results = findNearbyCaches(38.9822, -94.6708, 10);
  console.log(JSON.stringify(results, null, 2));
}

function testImport() {
  importGPX("19RAdV-lr90ggWQDClJryF95DqtgD2m62");
}