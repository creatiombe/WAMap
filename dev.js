var WAMap = (function () {
  'use strict';

  var debug = 0;

  var settings = {};
  var map = {};
  var poiLayers = {};
  var markers = {};
  var prevZoom = -6;
  var nextZoom = 0;
  var points = {};
  var hideWelcome = false;

  function init() {
    // Create the map container
    map = L.map('mapid', {
      crs: L.CRS.Simple,
      minZoom: -6,
      maxZoom: -3,
      zoomDelta: 0.5,
      zoomSnap: 0.5,
      attributionControl: false
    });
    
    // Set the renderer to render beyond the viewport to prevent weird half rendered polygons
    map.getRenderer(map).options.padding = 100;

    // Check if there is a cookie to read
    var allcookies = document.cookie;

    // Get all the cookies pairs in an array
    var cookiearray = allcookies.split(';');

    // Now take key value pair out of this array
    for (var i = 0; i < cookiearray.length; i++) {
      var name = cookiearray[i].split('=')[0];
      if (name[0] === ' ') {
        name = name.substring(1);
      }
      if (name === 'hideWelcome') {
        var value = cookiearray[i].split('=')[1];
        hideWelcome = Boolean(value);
      }
    }
    
    // Async load the settings file
    $.ajax({
      dataType: 'json',
      url: 'data/settings.json',
      cache: false,
      success: onSettingsLoaded,
      error: function (jqXHR, textStatus, errorThrown) {
        console.error(errorThrown);
      }
    });
  }

  function onSettingsLoaded(data) {
    settings = data;
    
    // Prepare the map object
    var bounds = [[settings.minY, settings.minX], [settings.maxY, settings.maxX]];
    //map.fitBounds(bounds);
    var maxBounds = [[settings.minY - settings.maxBounds, settings.minX - settings.maxBounds], 
                    [settings.maxY + settings.maxBounds, settings.maxX + settings.maxBounds]];
    map.setMaxBounds(maxBounds);
    map.setView([0, 0], -6);
    map.on('zoomstart', onZoomStart);
    map.on('zoomanim', onZoomAnim);
    map.on('zoomend', onZoomEnd);
    map.on('move', onMove);
    
    // L.imageOverlay('img/map.png', bounds).addTo(map);
    
    // Add the various layergroups
    poiLayers.pointLayer = new L.LayerGroup();
    poiLayers.zoneLayer = new L.LayerGroup();
    poiLayers.zoneLayer.addTo(map);
    poiLayers.sectorLayer = new L.LayerGroup();
    poiLayers.sectorLayer.addTo(map);
    poiLayers.sectorNameLayer = new L.LayerGroup();
    poiLayers.sectorNameLayer.addTo(map);
    poiLayers.wallBackgroundLayer = new L.LayerGroup();
    poiLayers.wallLayer = new L.LayerGroup();
    poiLayers.searchLayer = new L.LayerGroup();
    poiLayers.searchLayer.addTo(map);
    poiLayers.islandLayer = new L.LayerGroup();
    markers.islandMarkers = [];
    poiLayers.detailedIslandLayer = new L.LayerGroup();
    markers.detailedIslandMarkers = [];
    poiLayers.zoomedIslandLayer = new L.LayerGroup();
    markers.zoomedIslandMarkers = [];
    poiLayers.routeLayer = new L.LayerGroup();
    poiLayers.routeLayer.addTo(map);

    // Add the controls
    
    // Fill in the attribution without a tile layer
    var attributionControl = L.control.attribution();
    attributionControl.addAttribution('App made by Jerodar. Mapped by the <a href="https://www.worldsadrift.com/forums/topic/cardinal-guild-map-making-navigation-and-helmsmanship/">Cardinal Guild.</a>');
    attributionControl.addTo(map);
    
    // Watermark control with the Cardinal Guild logo
    L.control.watermark({
      position: 'bottomright',
      width: '100px',
      url: 'https://www.worldsadrift.com/forums/topic/cardinal-guild-map-making-navigation-and-helmsmanship/'
    }).addTo(map);
    
    // Displays a div containing the legend
    var legend = L.control({position: 'topright'});
    legend.onAdd = constructLegend;
    legend.addTo(map);
    
    // Search bar
    var controlSearch = new L.control.search({
      position:'topleft',
      layer: poiLayers.searchLayer,
      textPlaceholder: 'Search Authors...',
      targetProperty: 'author',
      displayProperty: 'name',
      initial: false,
      zoom: -4,
      marker: false
    });
    controlSearch.on('search:locationfound', function(e) {
      e.layer.openPopup();
    });
    controlSearch.addTo(map);

    map.removeLayer(poiLayers.islandLayer);
    
    // Cursor coordinate display
    L.control.mousePosition({ separator: ',', lngFirst: true, numDigits: -1 }).addTo(map);

    if (hideWelcome === false) {
      // Create the welcome message
      var options = Object.assign({}, settings.islandOptions);
      options.icon = L.divIcon();
      options.opacity = 0;
      // Create and add the marker to the island layer
      var marker = new L.Marker([-10000, 0], options)
        .addTo(map);
      marker.bindPopup('<h1>Welcome!</h1>Here are a few tips on how to use the map:<ul><li>When you zoom in you can see the islands, zoom in further to see more information and eventually also screenshot thumbnails.</li><li>Click on any island marker to see all the information for that island, including ore qualities.</li><li>If you are trying to figure out where you are, use your scanner on the ground to find the author of the island, then click on the search button here in the top left to search for that author and get a list of all his islands.</li></ul><input id="hideCheckbox" type="checkbox" onClick="WAMap.onHideWelcome(this)">Don\'t show this message again.');
      marker.openPopup();
    }

    // Load the point data
    // Async Load and read the csv file
    $.ajax({
      url: 'data/point_data.csv',
      type: 'GET',
      cache: false,
      success: function (text) {
        var data = $.csv.toArrays(text);
        onPointDataLoaded(data);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.error(errorThrown);
      }
    });
  }
  
  function constructLegend(map) {
    var options = Object.assign({}, settings.islandOptions);
    options.radius = 8;

    var div = L.DomUtil.create('div', 'info legend');
    var container = document.createElement('div');
    var imageNode = document.createElement('img');
    imageNode.setAttribute('src','img/compass.png');
    container.appendChild(imageNode);
    container.appendChild(document.createElement('br'));
    
    container.appendChild(document.createElement('br'));
    container.appendChild(document.createTextNode('Altitudes:'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.altitude.high);
    options.color = rgb(ShadeRgb(settings.colors.altitude.high));
    container.appendChild(generateSvgImage('Saborian', options));
    container.appendChild(document.createTextNode('High'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.altitude.medium);
    options.color = rgb(ShadeRgb(settings.colors.altitude.medium));
    container.appendChild(generateSvgImage('Saborian', options));
    container.appendChild(document.createTextNode('Medium'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.altitude.low);
    options.color = rgb(ShadeRgb(settings.colors.altitude.low));
    container.appendChild(generateSvgImage('Saborian', options));
    container.appendChild(document.createTextNode('Low'));
    container.appendChild(document.createElement('br'));
    container.appendChild(document.createElement('br'));
    
    container.appendChild(document.createTextNode('Biome:'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.islands[1]);
    options.color = rgb(ShadeRgb(settings.colors.islands[1]));
    container.appendChild(generateSvgImage('Saborian', options));
    container.appendChild(document.createTextNode('Wilderness'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.islands[2]);
    options.color = rgb(ShadeRgb(settings.colors.islands[2]));
    container.appendChild(generateSvgImage('Saborian', options));
    container.appendChild(document.createTextNode('Expanse'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.islands[3]);
    options.color = rgb(ShadeRgb(settings.colors.islands[3]));
    container.appendChild(generateSvgImage('Saborian', options));
    container.appendChild(document.createTextNode('Remnants'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.islands[4]);
    options.color = rgb(ShadeRgb(settings.colors.islands[4]));
    container.appendChild(generateSvgImage('Saborian', options));
    container.appendChild(document.createTextNode('Badlands'));
    container.appendChild(document.createElement('br'));
    container.appendChild(document.createElement('br'));

    container.appendChild(document.createTextNode('Culture:'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.islands[1]);
    options.color = rgb(ShadeRgb(settings.colors.islands[1]));
    container.appendChild(generateSvgImage('Saborian', options));
    container.appendChild(document.createTextNode('Saborian'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.islands[1]);
    options.color = rgb(ShadeRgb(settings.colors.islands[1]));
    container.appendChild(generateSvgImage('Kioki', options));
    container.appendChild(document.createTextNode('Kioki'));
    container.appendChild(document.createElement('br'));
    container.appendChild(document.createElement('br'));

    container.appendChild(document.createTextNode('Info:'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.islands[1]);
    options.color = rgb(ShadeRgb(settings.colors.islands[1]));
    options.radius = 16;
    var respawnImage = generateSvgImage('respawner', options);
    options.radius = 10;
    var pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathNode.setAttribute('style', 'fill: ' + options.fillColor + '; stroke: '
      + options.color + '; stroke-width:3px;');
    pathNode.setAttribute('d', 'm 6,6 ' + createSVGpath("Saborian", options));
    respawnImage.appendChild(pathNode);
    respawnImage.setAttribute('width', '40');
    respawnImage.setAttribute('height', '30');
    respawnImage.setAttribute('viewBox', '0 0 30 30');
    container.appendChild(respawnImage);
    container.appendChild(document.createTextNode('Respawner'));
    container.appendChild(document.createElement('br'));
    var databankText = document.createElement('span');
    databankText.setAttribute('class', 'databank-label');
    databankText.setAttribute('style', 'text-shadow: -1px -1px 0 #58754b, 1px -1px 0 #58754b, -1px 1px 0 #58754b, 1px 1px 0 #58754b; margin: 0px 6px;');
    databankText.appendChild(document.createTextNode('5'));
    container.appendChild(databankText);
    container.appendChild(document.createTextNode('Databanks'));
    container.appendChild(document.createElement('br'));
    container.appendChild(document.createElement('br'));
    
    container.appendChild(document.createTextNode('Walls:'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.walls[1]);
    options.color = rgb(settings.colors.walls[1]);
    container.appendChild(generateSvgImage('wall', options));
    container.appendChild(document.createTextNode('World Border'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.walls[2]);
    options.color = rgb(settings.colors.walls[2]);
    container.appendChild(generateSvgImage('wall', options));
    container.appendChild(document.createTextNode('Windwall'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.walls[3]);
    options.color = rgb(settings.colors.walls[3]);
    container.appendChild(generateSvgImage('wall', options));
    container.appendChild(document.createTextNode('Stormwall'));
    container.appendChild(document.createElement('br'));
    options.fillColor = rgb(settings.colors.walls[4]);
    options.color = rgb(settings.colors.walls[4]);
    container.appendChild(generateSvgImage('wall', options));
    container.appendChild(document.createTextNode('Sandstorm'));
    container.appendChild(document.createElement('br'));
    container.appendChild(document.createElement('br'));

    div.innerHTML = container.innerHTML;
    return div;
  }

  function generateSvgImage(shape, options) {
    var svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgNode.setAttribute('width', '20');
    svgNode.setAttribute('height', '20');
    svgNode.setAttribute('viewBox', '0 0 20 20');
    svgNode.setAttribute('class', 'svgImage');
    var pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathNode.setAttribute('style', 'fill: ' + options.fillColor + '; stroke: '
      + options.color + '; stroke-width:3px;');
    pathNode.setAttribute('d', createSVGpath(shape,options));
    svgNode.appendChild(pathNode);
    return svgNode;
  }

  function onPointDataLoaded(data) {
	// Render all sectors
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] !== '') {
        var point = {};
        // ID, X, Z, Sectors
        var Id = data[i][0];
        points[Id] = {};
        points[Id].X = Number(data[i][1]);
        points[Id].Z = Number(data[i][2]);
        
        // Create and add the marker to the island layer
        var labelIcon = new L.divIcon({ html: Id, className: 'point-label'});
        var options = Object.assign({}, settings.sectorLabelOptions);
        options.icon = labelIcon;
        options.color = 'white';
        options.pane = 'markerPane';
        var label = new L.Marker([points[Id].Z, points[Id].X], options).addTo(poiLayers.pointLayer);
      }
    }  

    // Async load the zone data file
    $.ajax({
      dataType: 'json',
      url: 'data/zone_data.json',
      cache: false,
      success: onZoneDataLoaded,
      error: function (jqXHR, textStatus, errorThrown) {
        console.error(errorThrown);
      }
    });
  }

  function onZoneDataLoaded(zones) {
    for (var zone in zones) {
      if (!zones.hasOwnProperty(zone)) {
        //The current property is not a direct property
        continue;
      }
      var html = '<div style="transform: rotate(' + zones[zone].angle + 'deg); letter-spacing: ' + zones[zone].spacing + 'em">' + zone + '</div>';
      var labelIcon = new L.divIcon({ html: html, className: 'zone-label'});
      var options = Object.assign({}, settings.sectorLabelOptions);
      options.icon = labelIcon;
      options.pane = 'markerPane';
      var label = new L.Marker(zones[zone].pos, options).addTo(poiLayers.zoneLayer);
    }

    // Load the sector data
    // Async Load and read the csv file
    $.ajax({
      url: 'data/sector_data.csv',
      type: 'GET',
      cache: false,
      success: function (text) {
        var data = $.csv.toArrays(text);
        onSectorDataLoaded(data);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.error(errorThrown);
      }
    });
  }

  function onSectorDataLoaded(data) {
    // Render all sectors
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] !== '') {
        var sector = {};
        // Sector, Region, Tier, P1, P2, P3, P4, P5, P6, P7
        sector.Sector = data[i][0];
        sector.Region = data[i][1];
        sector.Tier = Number(data[i][2]);
        sector.Pos = [];
        for (var j = 3; j < 10; j++) {
            if(data[i][j] !== '') {
                sector.Pos.push([points[data[i][j]].Z,points[data[i][j]].X]);
            }
        }
        
        // Set the colors of the marker
        var color = settings.colors.islands[sector.Tier];
        var options = Object.assign({}, settings.sectorOptions);
        options.fillColor = rgb(color);
        
        // Create and add the marker to the island layer
        var marker = new L.polyline(sector.Pos, options)
          .addTo(poiLayers.sectorLayer);
        var labelIcon = new L.divIcon({ html: sector.Sector, className: 'sector-label sector-label-'+sector.Tier});
        var labelPos = marker.getBounds().getCenter();
        var labelPoint = map.latLngToContainerPoint(labelPos);
        labelPoint = L.point([labelPoint.x - 5, labelPoint.y - 12]);
        labelPos = map.containerPointToLatLng(labelPoint);
        options = Object.assign({}, settings.sectorLabelOptions);
        options.icon = labelIcon;
        var label = new L.Marker(labelPos,options).addTo(poiLayers.sectorNameLayer);
      }
    }
    
    poiLayers.sectorNameLayer.setZIndex(-100);

    
    // Load the wall data
    // Async Load and read the csv file
    $.ajax({
      url: 'data/wall_data.csv',
      type: 'GET',
      cache: false,
      success: function (text) {
        var data = $.csv.toArrays(text);
        onWallDataLoaded(data);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.error(errorThrown);
      }
    });
  }
  
  function onWallDataLoaded(data) {
    // Render all walls
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] !== '') {
        var wall = {};
        // Id, Tier, P1, P2
        wall.Tier = Number(data[i][1]);
        wall.P1 = [points[data[i][2]].Z, points[data[i][2]].X];
        wall.P2 = [points[data[i][3]].Z, points[data[i][3]].X];
        
        // Set the colors of the marker
        var color = settings.colors.walls[wall.Tier];
        var options = Object.assign({}, settings.wallOptions);
        options.color = rgb(color);
        
        // Create and add the marker to the island layer
        var marker = L.polyline([wall.P1, wall.P2], options)
            .addTo(poiLayers.wallLayer);
        if (wall.Tier !== 1) {
          options = Object.assign({}, settings.wallBackgroundOptions);
          color = settings.colors.wallBackgrounds[wall.Tier];
          options.color =  rgb(color);
          L.polyline([wall.P1, wall.P2], options)
            .addTo(poiLayers.wallBackgroundLayer);
        }
      }
    }
    
    poiLayers.wallBackgroundLayer.addTo(map);
    poiLayers.wallLayer.addTo(map);
    
    // Load the POI data
    // Async Load and read the csv file
    $.ajax({
      url: 'data/island_data.csv',
      type: 'GET',
      cache: false,
      success: function (text) {
        var data = $.csv.toArrays(text);
        onIslandDataLoaded(data);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.error(errorThrown);
      }
    });
  }
  
  function onIslandDataLoaded(data) {
    // Render all islands
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] !== '') {
        var island = {};
        var column = 0;
        island.Id = data[i][column++];
        island.Name = data[i][column++];
        island.Author = data[i][column++];
        island.Sector = data[i][column++];
        island.Tier = Number(data[i][column++]);
        island.Type = data[i][column++];
        island.Screenshot = data[i][column++];
        // Mapping to 2d plane, so X = X, Y = Height (used for coloring), Z = Y
        island.X = Number(data[i][column++]);
        island.Height = Number(data[i][column++]) + settings.ZtoAltitude;
        island.Y = Number(data[i][column++]);
        if (data[i][column] === "") {
          island.Databanks = "Unknown";
          column++;
        } else {
          island.Databanks = Number(data[i][column++]);
        }
        island.Respawner = data[i][column++];
        island.Dangers = {};
        island.Dangers.Walls = data[i][column++];
        island.Dangers.Spikes = data[i][column++];
        island.Dangers.Turrets = data[i][column++];
        island.Trees = data[i][column++];
        island.Surveyor = data[i][column++];
        island.Steamname = data[i][column++];
        island.URL = data[i][column++];
        island.Ore = {};
        island.Ore.Aluminium = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Bronze = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Copper = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Gold = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Iron = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Lead = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Nickel = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Silver = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Steel = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Tin = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Titanium = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        island.Ore.Tungsten = (data[i][column] === "") ? 0 : Number(data[i][column++]);
        
        // Set the colors of the marker
        var color = settings.colors.islands[island.Tier];
        var options = Object.assign({}, settings.islandOptions);
        // Share or tint the base color based on height
        if (island.Height < settings.lowThreshold) {
          color = ShadeRgb(color);
        }
        else if (island.Height > settings.highThreshold) {
          color = TintRgb(color);
        }
        options.fillColor = rgb(color);
        options.color = rgb(ShadeRgb(color));
        options.icon = createSVGicon(island.Type, options, "island-icon");

        // Create and add the marker to the island layer
        var marker = new L.Marker([island.Y, island.X], options);
        options.radius = options.radius * 1.5;
        options.icon = createSVGicon(island.Type, options, "island-icon");
        var detailedMarker = new L.Marker([island.Y, island.X], options);

        if (island.Respawner === 'Yes') {
          var resOptions = Object.assign({}, options);
          resOptions.zIndexOffset = -1000;
          resOptions.interactive = false;
          resOptions.bubblingMouseEvents = true;
          resOptions.radius = options.radius * 1.7;
          resOptions.icon = createSVGicon("respawner", resOptions, "respawner-icon");
          var respawnmarker = new L.Marker([island.Y, island.X], resOptions);
          markers.detailedIslandMarkers.push(respawnmarker);
        }
        if (island.Databanks !== "Unknown") {
          var dbOptions = Object.assign({}, options);
          dbOptions.zIndexOffset = 1000;
          dbOptions.interactive = false;
          dbOptions.bubblingMouseEvents = true;
          dbOptions.icon = L.divIcon({
            html: "<p style='text-shadow: -1px -1px 0 " + dbOptions.color + ", 1px -1px 0 " + dbOptions.color + ", -1px 1px 0 " + dbOptions.color + ", 1px 1px 0 " + dbOptions.color + ";'>" + island.Databanks + "</p>",
            className: "databank-label",
            iconAnchor: [dbOptions.radius * 0.3, dbOptions.radius * 1.8]
          });
          var dbmarker = new L.Marker([island.Y, island.X], dbOptions);
          markers.detailedIslandMarkers.push(dbmarker);
        }
        markers.detailedIslandMarkers.push(detailedMarker);
        markers.islandMarkers.push(marker);
        
        island.Screenshot = 'img/islands/' + island.Id + '.jpg';
        
        // Create and add the marker to the zoomed island layer
        var myIcon = L.icon({
          // Copy of screenshot ending with s is a square thumbnail of 90x90
          iconUrl: island.Screenshot.replace('.jpg','s.jpg'),
          iconSize: [90,90]
        });
        var zoomedMarker = L.marker([island.Y, island.X], { icon: myIcon });
        markers.zoomedIslandMarkers.push(zoomedMarker);
        
        // Create the popup that will appear when clicked
        // Copy of screenshot ending with m is a thumbnail of 320 width
        var thumbnail = island.Screenshot.replace('.jpg','m.jpg');
        
        var popup = '<b>' + island.Name + '</b><br>' +
          'By: ' + island.Author + '<br>' +
          'Databanks: ' + island.Databanks + ', Sector: ' + island.Sector +
          ', Altitude: ' + island.Height + '<br>';
          
        if (island.Trees !== '') {
          popup = popup + 'Trees found: ' + island.Trees + '<br>';
        }

        var OresFound = '';
        OresFound = OresFound + ((island.Ore.Aluminium === 0) ? '' : 'Aluminium Q' + island.Ore.Aluminium + ', ');
        OresFound = OresFound + ((island.Ore.Bronze === 0) ? '' : 'Bronze Q' + island.Ore.Bronze + ', ');
        OresFound = OresFound + ((island.Ore.Copper === 0) ? '' : 'Copper Q' + island.Ore.Copper + ', ');
        OresFound = OresFound + ((island.Ore.Gold === 0) ? '' : 'Gold Q' + island.Ore.Gold + ', ');
        OresFound = OresFound + ((island.Ore.Iron === 0) ? '' : 'Iron Q' + island.Ore.Iron + ', ');
        OresFound = OresFound + ((island.Ore.Lead === 0) ? '' : 'Lead Q' + island.Ore.Lead + ', ');
        OresFound = OresFound + ((island.Ore.Nickel === 0) ? '' : 'Nickel Q' + island.Ore.Nickel + ', ');
        OresFound = OresFound + ((island.Ore.Silver === 0) ? '' : 'Silver Q' + island.Ore.Silver + ', ');
        OresFound = OresFound + ((island.Ore.Steel === 0) ? '' : 'Steel Q' + island.Ore.Steel + ', ');
        OresFound = OresFound + ((island.Ore.Tin === 0) ? '' : 'Tin Q' + island.Ore.Tin + ', ');
        OresFound = OresFound + ((island.Ore.Titanium === 0) ? '' : 'Titanium Q' + island.Ore.Titanium + ', ');
        OresFound = OresFound + ((island.Ore.Tungsten === 0) ? '' : 'Tungsten Q' + island.Ore.Tungsten + ', ');
        if (OresFound !== '') {
          popup = popup + 'Ores found: ' + OresFound.slice(0, -2) + '<br>';
        }
        
        if (island.Respawner === 'Yes') {
          popup = popup + 'Has respawners<br>';
        }

        // Build the url to the google form with pre-filled fields
        var formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdvfHgdOzNJfk7XfZV6aWOfDZmAIgnY2viSak8Udz88fFDGfA/viewform?usp=pp_url' + 
          '&entry.302396488='  + island.Id +
          '&entry.1668213788=' + island.Name +
          '&entry.1743663171=' + island.Author +
          '&entry.1828617833=' + island.Sector +
          '&entry.979831460=' + island.Type +
          '&entry.2064763837=' + island.Height +
          '&entry.1870806519=' + island.Databanks +
          '&entry.563492615='  + island.Respawner +
          '&entry.24867058='  + island.Dangers.Walls +
          '&entry.891822314='  + island.Dangers.Spikes +
          '&entry.658813634='  + island.Dangers.Turrets;
        var treeArray = island.Trees.split(", ");
        for (var j = 0; j < treeArray.length; j++) {
          formUrl = formUrl + '&entry.1092906456=' + treeArray[j];
        }
        formUrl = formUrl + 
          '&entry.930831494='  + island.Ore.Aluminium +
          '&entry.1129775473=' + island.Ore.Bronze +
          '&entry.1866350489=' + island.Ore.Copper +
          '&entry.1187879825=' + island.Ore.Gold +
          '&entry.1021476175=' + island.Ore.Iron +
          '&entry.536411341='  + island.Ore.Lead +
          '&entry.1001924318=' + island.Ore.Nickel +
          '&entry.1543313292=' + island.Ore.Silver +
          '&entry.1033931997=' + island.Ore.Steel +
          '&entry.1695959979=' + island.Ore.Tin +
          '&entry.2020020197=' + island.Ore.Titanium +
          '&entry.1491142433=' + island.Ore.Tungsten;

        popup = popup + '<a href=\'' + island.Screenshot + '\'  target=\'_blank\'><img src=\'' +
          thumbnail + '\'></a><br>' +
          'Surveyed by: ' + island.Surveyor + '<br>' +
          '<a href="' + formUrl + '" target="_blank">Click here to submit new data for this island.</a>';
        
        marker.bindPopup(popup, { minWidth: '320' });
        detailedMarker.bindPopup(popup, { minWidth: '320' });
        zoomedMarker.bindPopup(popup, {minWidth: '320'});
        
        // Add searchable features to the marker
        options.icon = L.divIcon({ html: ' ', className: "search-marker"});
        var searchMarker = new L.Marker([island.Y, island.X], options).addTo(poiLayers.searchLayer);
        searchMarker.bindPopup(popup, { minWidth: '320' });

        var feature = searchMarker.feature = searchMarker.feature || {};
        feature.type = feature.type || "Feature"; // Initialize feature.type
        var props = feature.properties = feature.properties || {}; // Initialize feature.properties
        props.name = island.Name;
        props.author = island.Author;
      }
    }
    
    // Load the route data for tracing walls
    // Async Load and read the csv file
    // For mapping walls only, disable for public build
    if (debug) {
      poiLayers.pointLayer.addTo(map);
      $.ajax({
        url: 'data/route_data.csv',
       type: 'GET',
        cache: false,
        success: function (text) {
          var data = $.csv.toArrays(text);
          onRouteDataLoaded(data);
        }
      });
    }
  }

  function onRouteDataLoaded(data) {
    // Render all walls
    for (var i = 1; i < data.length-1; i++) {
      if (data[i][1] !== '') {
        var wall = {};
        // Timestamp, x, y, z
        wall.P1 = [Number(data[i][3]), Number(data[i][1])];
        wall.P2 = [Number(data[i + 1][3]), Number(data[i + 1][1])];
        var distanse = Math.hypot(wall.P1[0] - wall.P2[0], wall.P1[1] - wall.P2[1]);
        if (distanse < 1000) {
          // Set the colors of the marker
          var options = Object.assign({}, settings.wallOptions);
          options.color = '#FF0000';
          options.weight = 4;

          // Create and add the marker to the island layer
          var marker = new L.polyline([wall.P1, wall.P2], options)
            .addTo(poiLayers.routeLayer);
        }
      }
    }
  }

  // Two separate events for zooming:
  // ZoomAnim fires at the start and lists the target zoom level
  // Hide the old layers here
  // ZoomEnd fires at the end, display the new layers here
  function onZoomStart(e) {
    prevZoom = map.getZoom();
  }

  function onZoomAnim(e) {
    nextZoom = e.zoom;
    console.log('Zoomed from:' + prevZoom + ' to: ' + nextZoom);
    if (nextZoom > -6) {
      map.removeLayer(poiLayers.zoneLayer);
    }
  }

  function onZoomEnd(e) {
    console.log('Zoom ended from:' + prevZoom + ' to: ' + nextZoom);
    // zoom 6 = zoneLayer
    // zoom 5-6 = islandLayer
    // zoom 4-5 = detailedIslandLayer
    // zoom 3-4 = zoomedIslandLayer
    if (nextZoom <= -4) {
      map.removeLayer(poiLayers.zoomedIslandLayer);
    }
    if (nextZoom > -4 || nextZoom <= -5) {
      map.removeLayer(poiLayers.detailedIslandLayer);
    }
    if (nextZoom > -5 || nextZoom <= -6) {
      map.removeLayer(poiLayers.islandLayer);
    }

    if (nextZoom > -4) {
      map.addLayer(poiLayers.zoomedIslandLayer);
    }
    else if (nextZoom > -5 && nextZoom <= -4) {
      map.addLayer(poiLayers.detailedIslandLayer);
    }
    else if (nextZoom > -6 && nextZoom <= -5) {
      map.addLayer(poiLayers.islandLayer);
    }
    else if (nextZoom <= -6) {
      map.addLayer(poiLayers.zoneLayer);
    }
    var revzoom = nextZoom+7;
    var newweight1 = revzoom*6;
    var newweight2 = revzoom*revzoom*6;
    var newweight = newweight1 + newweight2;
    poiLayers.wallBackgroundLayer.eachLayer(function (wall) {
      wall.setStyle({ weight: newweight });
    });
    prevZoom = nextZoom;
    onMove(true);
  }

  function onMove(e) {
    var zoom = map.getZoom();
    var CurrentView = map.getBounds();
    var arrayLength;
    var i;
    if (zoom > -6 && zoom <= -5) {
      arrayLength = markers.islandMarkers.length;
      for (i = 0; i < arrayLength; i++) {
        if (CurrentView.contains(markers.islandMarkers[i].getLatLng())) {
          markers.islandMarkers[i].addTo(poiLayers.islandLayer);
        } else {
          markers.islandMarkers[i].remove();
        }
      }
    } else if (zoom > -5 && zoom <= -4) {
      arrayLength = markers.detailedIslandMarkers.length;
      for (i = 0; i < arrayLength; i++) {
        if (CurrentView.contains(markers.detailedIslandMarkers[i].getLatLng())) {
          markers.detailedIslandMarkers[i].addTo(poiLayers.detailedIslandLayer);
        } else {
          markers.detailedIslandMarkers[i].remove();
        }
      }
    } else if (zoom > -4 && zoom <= -3) {
      arrayLength = markers.zoomedIslandMarkers.length;
      for (i = 0; i < arrayLength; i++) {
        if (CurrentView.contains(markers.zoomedIslandMarkers[i].getLatLng())) {
          markers.zoomedIslandMarkers[i].addTo(poiLayers.zoomedIslandLayer);
        } else {
          markers.zoomedIslandMarkers[i].remove();
        }
      }
    }
  }

  function onHideWelcome(e) {
    // Write a cooky to store preference
    var d = new Date();
    d.setTime(d.getTime() + (3600 * 24 * 60 * 60 * 1000));
    document.cookie = 'hideWelcome=' + e.checked + ';expires=' + d.toUTCString() + ';';
  }

  // RGB helper functions
  function rgb(rgbarray) {
    rgbarray[0] = Math.floor(rgbarray[0]);
    rgbarray[1] = Math.floor(rgbarray[1]);
    rgbarray[2] = Math.floor(rgbarray[2]);
    var rgbstring = '#' + ((1 << 24) + (rgbarray[0] << 16) + (rgbarray[1] << 8)
      + rgbarray[2]).toString(16).slice(1);
    return rgbstring;
  }

  function ShadeRgb(color) {
    var shade = [];
    for (var i = 0; i < color.length; i++)
      shade[i] = color[i] * settings.shadingFactor;
    return shade;
  }

  function TintRgb(color) {
    var tint = [];
    for (var i = 0; i < color.length; i++)
      tint[i] = color[i] + ((255 - color[i]) * settings.shadingFactor);
    return tint;
  }

  // Creates a divIcon containing a custom SVG icon
  function createSVGicon(shape, options, classname) {
    var path = createSVGpath(shape, options);

    var iconSize = (options.radius + options.width) * 2;
    var svgElement = "<svg xmlns='http://www.w3.org/2000/svg' version='1.1' width='" + iconSize + "' height='" + iconSize + "'><path stroke='" + options.color + "' stroke-width='" + options.width + "' fill='" + options.fillColor + "' d='" + path + "'/></svg>";
    var svgIcon = L.divIcon({
      html: svgElement,
      className: classname,
      iconSize: [iconSize,iconSize]
    });
    return svgIcon;
  }

  function createSVGpath(shape, options) {
    var s = options.radius;
    var d = "m " + options.width + "," + options.width;

    if (shape === "Saborian") {
      d = d
        + " m " + (s) + "," + (0)
        + " l " + (s) + "," + (s)
        + " l " + (-s) + "," + (s)
        + " l " + (-s) + "," + (-s)
        + " z";
    }
    if (shape === "Kioki") {
      d = d
        + " m " + ((s - s * 0.9)) + "," + (s)
        + " a " + (s * 0.9) + " " + (s * 0.9) + " 0 1 1 " + (s * 0.9 * 2) + "," + (0)
        + " a " + (s * 0.9) + " " + (s * 0.9) + " 0 1 1 " + (-s * 0.9 * 2) + "," + (0)
        + " z";
    }
    if (shape === "respawner") {
      d = d
        + " m " + (s * (56 / 29)) + "," + (s * (24 / 29))
        + " c " + (s * (-3 / 29)) + "," + (s * (-3 / 29)) + " " + (s * (-4 / 29)) + "," + (s * (-4 / 29)) + " " + (s * (-4 / 29)) + "," + (s * (-7 / 29))
        + " c " + (s * (2 / 29)) + "," + (s * (-1 / 29)) + " " + (s * (4 / 29)) + "," + (s * (-2 / 29)) + " " + (s * (6 / 29)) + "," + (s * (-4 / 29))
        + " c " + (s * (-3 / 29)) + "," + (s * (-2 / 29)) + " " + (s * (-5 / 29)) + "," + (s * (-4 / 29)) + " " + (s * (-6 / 29)) + "," + (s * (-7 / 29))
        + " c " + (s * (-11 / 29)) + "," + (s * (11 / 29)) + " " + (s * (-35 / 29)) + "," + (s * (11 / 29)) + " " + (s * (-46 / 29)) + "," + (0)
        + " c " + (s * (-1 / 29)) + "," + (s * (3 / 29)) + " " + (s * (-3 / 29)) + "," + (s * (5 / 29)) + " " + (s * (-6 / 29)) + "," + (s * (7 / 29))
        + " c " + (s * (2 / 29)) + "," + (s * (2 / 29)) + " " + (s * (4 / 29)) + "," + (s * (3 / 29)) + " " + (s * (6 / 29)) + "," + (s * (4 / 29))
        + " c " + (0) + "," + (s * (3 / 29)) + " " + (s * (-1 / 29)) + "," + (s * (4 / 29)) + " " + (s * (-4 / 29)) + "," + (s * (7 / 29))
        + " c " + (s * (14 / 29)) + "," + (s * (3 / 29)) + " " + (s * (40 / 29)) + "," + (s * (3 / 29)) + " " + (s * (54 / 29)) + "," + (0)
        + " z";
    }
    if (shape === "wall") {
      d = d
        + "l " + (s * 2) + "," + (s * 2);
    }
    return d;
  }

  // Start the app
  init();

  return {
      // Pass on any pubic function here
      onHideWelcome: onHideWelcome
  };
}());