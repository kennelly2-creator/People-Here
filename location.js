/* location.js — one wrapper around the Geolocation API with plain-language errors. */
(function (global) {
  'use strict';

  function getCurrentPosition(opts) {
    return new Promise(function (resolve, reject) {
      if (!global.navigator || !global.navigator.geolocation) {
        reject(new Error('This browser cannot share your location. Enter the coordinates by hand instead.'));
        return;
      }
      var options = Object.assign({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }, opts || {});

      global.navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            at: new Date(pos.timestamp).toISOString()
          });
        },
        function (err) {
          reject(new Error(message(err)));
        },
        options
      );
    });
  }

  function message(err) {
    if (!err) return 'Could not get your location.';
    switch (err.code) {
      case 1: return 'Location permission is off. Turn it on in Settings → Safari → Location, then try again.';
      case 2: return 'Your location is unavailable right now. Try again outdoors or enter coordinates by hand.';
      case 3: return 'Getting your location took too long. Try again.';
      default: return 'Could not get your location.';
    }
  }

  global.Loc = { getCurrentPosition: getCurrentPosition };
})(window);
