/* distance.js — geographic distance utilities. No dependencies. */
(function (global) {
  'use strict';

  var EARTH_RADIUS_M = 6371008.8;

  function toRad(deg) { return (deg * Math.PI) / 180; }

  /* Great-circle distance in metres between two lat/lon pairs (Haversine). */
  function haversineMeters(lat1, lon1, lat2, lon2) {
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function formatDistance(m) {
    if (!isFinite(m)) return '—';
    if (m < 950) return Math.round(m) + ' m';
    return (m / 1000).toFixed(m < 9500 ? 1 : 0) + ' km';
  }

  function isValidLat(v) { return typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90; }
  function isValidLon(v) { return typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180; }

  /* Places, each measured against a coordinate, nearest first. */
  function rankPlaces(places, lat, lon) {
    return places
      .map(function (p) {
        var d = haversineMeters(lat, lon, p.latitude, p.longitude);
        return { place: p, meters: d, inside: d <= (p.radiusMeters || 150) };
      })
      .sort(function (a, b) { return a.meters - b.meters; });
  }

  global.Distance = {
    haversineMeters: haversineMeters,
    formatDistance: formatDistance,
    rankPlaces: rankPlaces,
    isValidLat: isValidLat,
    isValidLon: isValidLon
  };
})(window);
