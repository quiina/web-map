/*
 | Copyright 2014 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
define(["dojo/ready", "dojo/json", "dojo/_base/array", "dojo/_base/Color", "dojo/_base/declare", "dojo/_base/lang", "dojo/dom", "dojo/dom-geometry", "dojo/dom-attr", "dojo/dom-class", "dojo/dom-construct", "dojo/dom-style", "dojo/on", "dojo/Deferred", "dojo/promise/all", "dojo/query", "dijit/registry", "dijit/Menu", "dijit/CheckedMenuItem", "application/toolbar", "application/has-config", "esri/arcgis/utils", "esri/lang", "esri/urlUtils", "esri/dijit/HomeButton", "esri/dijit/LocateButton", "esri/dijit/Legend", "esri/dijit/BasemapGallery", "esri/dijit/Measurement", "esri/dijit/OverviewMap", "esri/geometry/Extent", "esri/layers/FeatureLayer", "esri/dijit/LayerList", "application/ShareDialog", "application/SearchSources"], function (
ready, JSON, array, Color, declare, lang, dom, domGeometry, domAttr, domClass, domConstruct, domStyle, on, Deferred, all, query, registry, Menu, CheckedMenuItem, Toolbar, has, arcgisUtils, esriLang, urlUtils, HomeButton, LocateButton, Legend, BasemapGallery, Measurement, OverviewMap, Extent, FeatureLayer, LayerList, ShareDialog, SearchSources) {
    return declare(null, {
        config: {},
        color: null,
        theme: null,
        map: null,
        mapExt: null,
        editorDiv: null,
        editor: null,
        editableLayers: null,
        timeFormats: ["shortDateShortTime", "shortDateLEShortTime", "shortDateShortTime24", "shortDateLEShortTime24", "shortDateLongTime", "shortDateLELongTime", "shortDateLongTime24", "shortDateLELongTime24"],
        startup: function (config) {
            // config will contain application and user defined info for the template such as i18n strings, the web map id
            // and application id and any url parameters and any application specific configuration information.
            if (config) {
                this.config = config;
                this.color = this._setColor(this.config.color);
                this.theme = this._setColor(this.config.theme);
                // document ready
                ready(lang.hitch(this, function () {
                    //supply either the webmap id or, if available, the item info
                    var itemInfo = this.config.itemInfo || this.config.webmap;

                    this._createWebMap(itemInfo);
                }));
            } else {
                var error = new Error("Main:: Config is not defined");
                this.reportError(error);
            }
        },

        reportError: function (error) {
            // remove loading class from body
            domClass.remove(document.body, "app-loading");
            domClass.add(document.body, "app-error");
            // an error occurred - notify the user. In this example we pull the string from the
            // resource.js file located in the nls folder because we've set the application up
            // for localization. If you don't need to support multiple languages you can hardcode the
            // strings here and comment out the call in index.html to get the localization strings.
            // set message
            var node = dom.byId("loading_message");
            if (node) {
                if (this.config && this.config.i18n) {
                    node.innerHTML = this.config.i18n.map.error + ": " + error.message;
                } else {
                    node.innerHTML = "Unable to create map: " + error.message;
                }
            }
        },
        // Map is ready
        _mapLoaded: function () {
            query(".esriSimpleSlider").style("backgroundColor", this.theme.toString());
            // remove loading class from body
            domClass.remove(document.body, "app-loading");
            on(window, "orientationchange", lang.hitch(this, this._adjustPopupSize));
            this._adjustPopupSize();
        },

        // Create UI
        _createUI: function () {
            domStyle.set("panelPages", "visibility", "hidden");
            //Add tools to the toolbar. The tools are listed in the defaults.js file
            var toolbar = new Toolbar(this.config);
            toolbar.startup().then(lang.hitch(this, function () {

                // set map so that it can be repositioned when page is scrolled
                toolbar.map = this.map;

                var toolList = [];
                for (var i = 0; i < this.config.tools.length; i++) {
                    switch (this.config.tools[i].name) {
                    case "legend":
                        toolList.push(this._addLegend(this.config.tools[i], toolbar, "medium"));
                        break;
                    case "bookmarks":
                        toolList.push(this._addBookmarks(this.config.tools[i], toolbar, "medium"));
                        break;
                    case "layers":
                        toolList.push(this._addLayers(this.config.tools[i], toolbar, "medium"));
                        break;
                    case "basemap":
                        toolList.push(this._addBasemapGallery(this.config.tools[i], toolbar, "large"));
                        break;
                    case "overview":
                        toolList.push(this._addOverviewMap(this.config.tools[i], toolbar, "medium"));
                        break;
                    case "measure":
                        toolList.push(this._addMeasure(this.config.tools[i], toolbar, "small"));
                        break;
                    case "edit":
                        toolList.push(this._addEditor(this.config.tools[i], toolbar, "medium"));
                        break;
                    case "print":
                        toolList.push(this._addPrint(this.config.tools[i], toolbar, "small"));
                        break;
                    case "details":
                        toolList.push(this._addDetails(this.config.tools[i], toolbar, "medium"));
                        break;
                    case "share":
                        toolList.push(this._addShare(this.config.tools[i], toolbar, "medium"));
                        break;
                    default:
                        break;
                    }
                }

                all(toolList).then(lang.hitch(this, function (results) {


                    //If all the results are false and locate and home are also false we can hide the toolbar
                    var tools = array.some(results, function (r) {
                        return r;
                    });

                    var home = has("home");
                    var locate = has("locate");


                    //No tools are specified in the configuration so hide the panel and update the title area styles
                    if (!tools && !home && !locate) {
                        domConstruct.destroy("panelTools");
                        domStyle.set("panelContent", "display", "none");
                        domStyle.set("panelTitle", "border-bottom", "none");
                        domStyle.set("panelTop", "height", "52px");
                        query(".esriSimpleSlider").addClass("notools");
                        this._updateTheme();
                        return;
                    }

                    //Now that all the tools have been added to the toolbar we can add page naviagation
                    //to the toolbar panel, update the color theme and set the active tool.
                    this._updateTheme();
                    toolbar.updatePageNavigation();
                    if (this.config.activeTool !== "") {
                        toolbar.activateTool(this.config.activeTool);
                    } else {
                        toolbar._closePage();
                    }


                    on(toolbar, "updateTool", lang.hitch(this, function (name) {
                        if (name === "measure") {
                            this._destroyEditor();
                            this.map.setInfoWindowOnClick(false);
                        } else if (name === "edit") {
                            this._destroyEditor();
                            this.map.setInfoWindowOnClick(false);
                            this._createEditor();
                        } else {
                            //activate the popup and destroy editor if necessary
                            this._destroyEditor();
                            this.map.setInfoWindowOnClick(true);
                        }


                        if (has("measure") && name !== "measure") {
                            query(".esriMeasurement").forEach(lang.hitch(this, function (node) {
                                var m = registry.byId(node.id);
                                if (m) {
                                    m.clearResult();
                                    m.setTool("location", false);
                                    m.setTool("area", false);
                                    m.setTool("distance", false);
                                }
                            }));
                        }



                    }));

                    domStyle.set("panelPages", "visibility", "visible");

                }));
            }));
        },
        _addBasemapGallery: function (tool, toolbar, panelClass) {
            //Add the basemap gallery to the toolbar.
            var deferred = new Deferred();
            if (has("basemap")) {
                var basemapDiv = toolbar.createTool(tool, panelClass);
                var basemap = new BasemapGallery({
                    id: "basemapGallery",
                    map: this.map,
                    showArcGISBasemaps: true,
                    portalUrl: this.config.sharinghost,
                    basemapsGroup: this._getBasemapGroup()
                }, domConstruct.create("div", {}, basemapDiv));
                basemap.startup();
                deferred.resolve(true);
            } else {
                deferred.resolve(false);
            }

            return deferred.promise;
        },

        _addBookmarks: function (tool, toolbar, panelClass) {
            //Add the bookmarks tool to the toolbar. Only activated if the webmap contains bookmarks.
            var deferred = new Deferred();
            if (this.config.response.itemInfo.itemData.bookmarks) {
                //Conditionally load this module since most apps won't have bookmarks
                require(["application/has-config!bookmarks?esri/dijit/Bookmarks"], lang.hitch(this, function (Bookmarks) {
                    if (!Bookmarks) {
                        deferred.resolve(false);
                        return;
                    }
                    var bookmarkDiv = toolbar.createTool(tool, panelClass);
                    var bookmarks = new Bookmarks({
                        map: this.map,
                        bookmarks: this.config.response.itemInfo.itemData.bookmarks
                    }, domConstruct.create("div", {}, bookmarkDiv));

                    deferred.resolve(true);

                }));

            } else {
                deferred.resolve(false);
            }

            return deferred.promise;
        },
        _addDetails: function (tool, toolbar, panelClass) {
            //Add the default map description panel
            var deferred = new Deferred();
            if (has("details")) {
                var description = this.config.description || this.config.response.itemInfo.item.description || this.config.response.itemInfo.item.snippet;
                if (description) {
                    var descLength = description.length;
                    //Change the panel class based on the string length
                    if (descLength < 200) {
                        panelClass = "small";
                    } else if (descLength < 400) {
                        panelClass = "medium";
                    } else {
                        panelClass = "large";
                    }

                    var detailDiv = toolbar.createTool(tool, panelClass);
                    detailDiv.innerHTML = "<div class='desc'>" + description + "</div>";
                }
                deferred.resolve(true);
            } else {
                deferred.resolve(false);
            }

            return deferred.promise;

        },
        _addEditor: function (tool, toolbar, panelClass) {

            //Add the editor widget to the toolbar if the web map contains editable layers
            var deferred = new Deferred();
            this.editableLayers = this._getEditableLayers(this.config.response.itemInfo.itemData.operationalLayers);
            if (has("edit") && this.editableLayers.length > 0) {
                if (this.editableLayers.length > 0) {
                    this.editorDiv = toolbar.createTool(tool, panelClass);
                    return this._createEditor();
                } else {
                    console.log("No Editable Layers");
                    deferred.resolve(false);
                }
            } else {
                deferred.resolve(false);
            }

            return deferred.promise;
        },
        _createEditor: function () {
            var deferred = new Deferred();
            //Dynamically load since many apps won't have editable layers
            require(["application/has-config!edit?esri/dijit/editing/Editor"], lang.hitch(this, function (Editor) {
                if (!Editor) {
                    deferred.resolve(false);
                    return;
                }

                //add field infos if necessary. Field infos will contain hints if defined in the popup and hide fields where visible is set
                //to false. The popup logic takes care of this for the info window but not the edit window.
                array.forEach(this.editableLayers, lang.hitch(this, function (layer) {
                    if (layer.featureLayer && layer.featureLayer.infoTemplate && layer.featureLayer.infoTemplate.info && layer.featureLayer.infoTemplate.info.fieldInfos) {
                        //only display visible fields
                        var fields = layer.featureLayer.infoTemplate.info.fieldInfos;
                        var fieldInfos = [];
                        array.forEach(fields, lang.hitch(this, function (field) {

                            //added support for editing date and time
                            if (field.format && field.format.dateFormat && array.indexOf(this.timeFormats, field.format.dateFormat) > -1) {
                                field.format = {
                                    time: true
                                };
                            }
                            //Add all editable fields even if not visible. 
                            //if (field.visible) {
                            fieldInfos.push(field);
                            //}
                        }));

                        layer.fieldInfos = fieldInfos;
                    }
                }));
                var settings = {
                    map: this.map,
                    layerInfos: this.editableLayers,
                    toolbarVisible: has("edit-toolbar")
                };
                this.editor = new Editor({
                    settings: settings
                }, domConstruct.create("div", {}, this.editorDiv));


                this.editor.startup();
                deferred.resolve(true);

            }));
            return deferred.promise;

        },
        _destroyEditor: function () {
            if (this.editor) {
                this.editor.destroy();
                this.editor = null;
            }

        },
        _addLayers: function (tool, toolbar, panelClass) {
            //Toggle layer visibility if web map has operational layers
            var deferred = new Deferred();

            var layers = this.config.response.itemInfo.itemData.operationalLayers;

            if (layers.length === 0) {
                deferred.resolve(false);
            } else {
                if (has("layers")) {


                    //Use small panel class if layer layer is less than 5
                    if (layers.length < 5) {
                        panelClass = "small";
                    } else if (layers.length < 15) {
                        panelClass = "medium";
                    } else {
                        panelClass = "large";
                    }
                    var layersDiv = toolbar.createTool(tool, panelClass);

                    var toc = new LayerList({
                        map: this.map,
                        layers: arcgisUtils.getLayerList(this.config.response)
                    }, domConstruct.create("div", {}, layersDiv));
                    toc.startup();


                    deferred.resolve(true);
                } else {
                    deferred.resolve(false);
                }
            }
            return deferred.promise;
        },
        _addLegend: function (tool, toolbar, panelClass) {
            //Add the legend tool to the toolbar. Only activated if the web map has operational layers.
            var deferred = new Deferred();
            var layers = arcgisUtils.getLegendLayers(this.config.response);


            if (layers.length === 0) {
                deferred.resolve(false);
            } else {
                if (has("legend")) {
                    var legendLength = 0;
                    array.forEach(layers, lang.hitch(this, function (layer) {
                        if (layer.infos && layer.infos.length) {
                            legendLength += layer.infos.length;
                        }
                    }));

                    if (legendLength.length < 5) {
                        panelClass = "small";
                    } else if (legendLength.length < 15) {
                        panelClass = "medium";
                    } else {
                        panelClass = "large";
                    }

                    var legendDiv = toolbar.createTool(tool, panelClass);
                    var legend = new Legend({
                        map: this.map,
                        layerInfos: layers
                    }, domConstruct.create("div", {}, legendDiv));
                    domClass.add(legend.domNode, "legend");
                    legend.startup();
                    if (this.config.activeTool !== "") {
                        toolbar.activateTool(this.config.activeTool || "legend");
                    } else {
                        toolbar._closePage();
                    }
                    deferred.resolve(true);

                } else {
                    deferred.resolve(false);
                }


            }
            return deferred.promise;
        },

        _addMeasure: function (tool, toolbar, panelClass) {
            //Add the measure widget to the toolbar.
            var deferred = new Deferred();
            if (has("measure")) {

                var measureDiv = toolbar.createTool(tool, panelClass);
                var areaUnit = (this.config.units === "metric") ? "esriSquareKilometers" : "esriSquareMiles";
                var lengthUnit = (this.config.units === "metric") ? "esriKilometers" : "esriMiles";

                var measure = new Measurement({
                    map: this.map,
                    defaultAreaUnit: areaUnit,
                    defaultLengthUnit: lengthUnit
                }, domConstruct.create("div", {}, measureDiv));

                measure.startup();
                deferred.resolve(true);
            } else {
                deferred.resolve(false);
            }



            return deferred.promise;
        },
        _addOverviewMap: function (tool, toolbar, panelClass) {
            //Add the overview map to the toolbar
            var deferred = new Deferred();

            if (has("overview")) {
                var ovMapDiv = toolbar.createTool(tool, panelClass);


                domStyle.set(ovMapDiv, {
                    "height": "100%",
                    "width": "100%"
                });

                var panelHeight = this.map.height;
                if (panelClass === "small") {
                    panelHeight = 250;
                } else if (panelClass === "medium") {
                    panelHeight = 350;
                }

                var ovMap = new OverviewMap({
                    id: "overviewMap",
                    map: this.map,
                    height: panelHeight
                }, domConstruct.create("div", {}, ovMapDiv));

                ovMap.startup();

                on(this.map, "layer-add", lang.hitch(this, function (args) {
                    //delete and re-create the overview map if the basemap gallery changes
                    if (args.layer.hasOwnProperty("_basemapGalleryLayerType") && args.layer._basemapGalleryLayerType === "basemap") {
                        registry.byId("overviewMap").destroy();
                        var ovMap = new OverviewMap({
                            id: "overviewMap",
                            map: this.map,
                            height: panelHeight,
                            visible: false
                        }, domConstruct.create("div", {}, ovMapDiv));

                        ovMap.startup();
                    }
                }));
                deferred.resolve(true);
            } else {
                deferred.resolve(false);
            }


            return deferred.promise;
        },
        _addPrint: function (tool, toolbar, panelClass) {
            //Add the print widget to the toolbar 
            var deferred = new Deferred(),
                print = null;
            require(["application/has-config!print?application/PrintConfig", "application/has-config!print?esri/dijit/Print"], lang.hitch(this, function (PrintConfig, Print) {
                if (!PrintConfig || !Print) {
                    deferred.resolve(false);
                    return;
                }
                var printDiv = toolbar.createTool(tool, panelClass);
                var format = null;
                array.forEach(this.config.tools, function (tool) {
                    if (tool.name === "print") {
                        format = tool.format;
                    }
                });
                if (this.config.hasOwnProperty("tool_print_format")) {
                    format = this.config.tool_print_format;
                }
                var layoutOptions = {
                    "titleText": this.config.title,
                    "scalebarUnit": this.config.units,
                    "legendLayers": []
                };

                var printConfig = new PrintConfig({
                    legendLayers: this.config.response,
                    layouts: has("print-layouts"),
                    format: format.toLowerCase() || null,
                    printTaskUrl: this.config.helperServices.printTask.url,
                    printi18n: this.config.i18n.tools.print,
                    layoutOptions: layoutOptions
                });
                printConfig.createPrintOptions().then(lang.hitch(this, function (results) {
                    var templates = results.templates;
                    var legendLayers = results.legendLayers;

                    //add a text box so users can enter a custom title
                    var titleNode = domConstruct.create("input", {
                        id: "print_title",
                        className: "printTitle",
                        tabindex: "0",
                        placeholder: this.config.i18n.tools.print.titlePrompt
                    }, domConstruct.create("div"));

                    domConstruct.place(titleNode, printDiv);

                    if (has("print-legend")) {
                        var legendNode = domConstruct.create("input", {
                            id: "legend_ck",
                            className: "checkbox",
                            type: "checkbox",
                            checked: false
                        }, domConstruct.create("div", {
                            "class": "checkbox"
                        }));

                        var labelNode = domConstruct.create("label", {
                            "for": "legend_ck",
                            "className": "checkbox",
                            "innerHTML": "  " + this.config.i18n.tools.print.legend
                        }, domConstruct.create("div"));
                        domConstruct.place(legendNode, printDiv);
                        domConstruct.place(labelNode, printDiv);

                        on(legendNode, "change", lang.hitch(this, function (arg) {
                            if (legendNode.checked && legendLayers.length > 0) {
                                layoutOptions.legendLayers = legendLayers;
                            } else {
                                layoutOptions.legendLayers = [];
                            }
                            array.forEach(this.print.templates, lang.hitch(this, function (template) {
                                template.layoutOptions = layoutOptions;
                            }));
                        }));

                    } else {
                        domStyle.set("pageBody_print", "height", "90px");
                    }
                    this.print = new Print({
                        map: this.map,
                        id: "printButton",
                        templates: templates,
                        url: this.config.helperServices.printTask.url
                    }, domConstruct.create("div"));
                    domConstruct.place(this.print.printDomNode, printDiv, "first");

                    this.print.on("print-start", lang.hitch(this, function () {
                        var printBox = dom.byId("print_title");
                        if (printBox.value) {
                            array.forEach(this.print.templates, lang.hitch(this, function (template) {
                                template.layoutOptions.titleText = printBox.value;
                            }));
                        }
                    }));

                    this.print.startup();


                }));
                deferred.resolve(true);
                return;




            }));
            return deferred.promise;
        },
        _addShare: function (tool, toolbar, panelClass) {
            //Add share links for facebook, twitter and direct linking.
            //Add the measure widget to the toolbar.
            var deferred = new Deferred();

            if (has("share")) {

                var shareDiv = toolbar.createTool(tool, panelClass);

                var shareDialog = new ShareDialog({
                    bitlyLogin: this.config.bitlyLogin,
                    bitlyKey: this.config.bitlyKey,
                    map: this.map,
                    image: this.config.sharinghost + "/sharing/rest/content/items/" + this.config.response.itemInfo.item.id + "/info/" + this.config.response.itemInfo.thumbnail,
                    title: this.config.title,
                    summary: this.config.response.itemInfo.item.snippet || ""
                }, shareDiv);
                domClass.add(shareDialog.domNode, "pageBody");
                shareDialog.startup();

                deferred.resolve(true);
            } else {
                deferred.resolve(false);
            }


            return deferred.promise;

        },
        _getEditableLayers: function (layers) {
            var layerInfos = [];
            array.forEach(layers, lang.hitch(this, function (layer) {

                if (layer && layer.layerObject) {
                    var eLayer = layer.layerObject;
                    if (eLayer instanceof FeatureLayer && eLayer.isEditable()) {
                        layerInfos.push({
                            "featureLayer": eLayer
                        });
                    }
                }
            }));
            return layerInfos;
        },


        _getBasemapGroup: function () {
            //Get the id or owner and title for an organizations custom basemap group.
            var basemapGroup = null;
            if (this.config.basemapgroup && this.config.basemapgroup.title && this.config.basemapgroup.owner) {
                basemapGroup = {
                    "owner": this.config.basemapgroup.owner,
                    "title": this.config.basemapgroup.title
                };
            } else if (this.config.basemapgroup && this.config.basemapgroup.id) {
                basemapGroup = {
                    "id": this.config.basemapgroup.id
                };
            }
            return basemapGroup;
        },

        _createMapUI: function () {
            // Add map specific widgets like the Home  and locate buttons. Also add the geocoder.
            if (has("home")) {
                domConstruct.create("div", {
                    id: "panelHome",
                    className: "icon-color tool",
                    innerHTML: "<div id='btnHome'></div>"
                }, dom.byId("panelTools"), 0);
                var home = new HomeButton({
                    map: this.map
                }, dom.byId("btnHome"));

                if (!has("touch")) {
                    //add a tooltip
                    domAttr.set("btnHome", "data-title", this.config.i18n.tooltips.home);
                } else {
                    //remove no-touch class from body
                    domClass.remove(document.body, "no-touch");

                }

                home.startup();
            }

            require(["application/has-config!scalebar?esri/dijit/Scalebar"], lang.hitch(this, function (Scalebar) {
                if (!Scalebar) {
                    return;
                }
                var scalebar = new Scalebar({
                    map: this.map,
                    scalebarUnit: this.config.units
                });

            }));


            if (has("locate")) {
                domConstruct.create("div", {
                    id: "panelLocate",
                    className: "icon-color tool",
                    innerHTML: "<div id='btnLocate'></div>"
                }, dom.byId("panelTools"), 1);
                var geoLocate = new LocateButton({
                    map: this.map
                }, dom.byId("btnLocate"));
                if (!has("touch")) {
                    //add a tooltip
                    domAttr.set("btnLocate", "data-title", this.config.i18n.tooltips.locate);
                }

                geoLocate.startup();

            }

            //Add the location search widget
            require(["application/has-config!search?esri/dijit/Search", "application/has-config!search?esri/tasks/locator"], lang.hitch(this, function (Search, Locator) {
                if (!Search && !Locator) {
                    //add class so we know we don't have to hide title since search isn't visible
                    domClass.add("panelTop", "no-search");
                    return;
                }

                var searchOptions = {
                    map: this.map,
                    useMapExtent: this.config.searchExtent,
                    itemData: this.config.response.itemInfo.itemData
                };

                if (this.config.searchConfig) {
                    searchOptions.applicationConfiguredSources = this.config.searchConfig.sources || [];
                } else {
                    var configuredSearchLayers = (this.config.searchLayers instanceof Array) ? this.config.searchLayers : JSON.parse(this.config.searchLayers);
                    searchOptions.configuredSearchLayers = configuredSearchLayers;
                    searchOptions.geocoders = this.config.locationSearch ? this.config.helperServices.geocode : [];
                }
                var searchSources = new SearchSources(searchOptions);
                var createdOptions = searchSources.createOptions();

                if (this.config.searchConfig && this.config.searchConfig.activeSourceIndex) {
                    createdOptions.activeSourceIndex = this.config.searchConfig.activeSourceIndex;
                }

                var search = new Search(createdOptions, domConstruct.create("div", {
                    id: "search"
                }, "mapDiv"));

                search.on("select-result", lang.hitch(this, function () {
                    //if edit tool is enabled we'll have to delete/create 
                    //so info window behaves correctly. 
                    on.once(this.map.infoWindow, "hide", lang.hitch(this, function () {
                        search.clear();
                        if (this.editor) {
                            this._destroyEditor();
                            this._createEditor();
                        }
                    }));

                }));
                search.startup();

                if (search && search.domNode) {
                    domConstruct.place(search.domNode, "panelGeocoder");
                }

            }));


            //Feature Search or find (if no search widget)
            if ((this.config.find || (this.config.customUrlLayer.id !== null && this.config.customUrlLayer.fields.length > 0 && this.config.customUrlParam !== null))) {
                require(["esri/dijit/Search"], lang.hitch(this, function (Search) {
                    var source = null,
                        value = null,
                        searchLayer = null;

                    var urlObject = urlUtils.urlToObject(document.location.href);
                    urlObject.query = urlObject.query || {};
                    urlObject.query = esriLang.stripTags(urlObject.query);
                    //Support find or custom url param 
                    if (this.config.find) {
                        value = decodeURIComponent(this.config.find);
                    } else if (urlObject.query[this.config.customUrlParam.toLowerCase()]) {
                        value = urlObject.query[this.config.customUrlParam.toLowerCase()];

                        searchLayer = this.map.getLayer(this.config.customUrlLayer.id);
                        if (searchLayer) {

                            var searchFields = this.config.customUrlLayer.fields[0].fields;
                            source = {
                                exactMatch: true,
                                outFields: ["*"],
                                featureLayer: searchLayer,
                                displayField: searchFields[0],
                                searchFields: searchFields
                            };
                        }
                    }
                    var urlSearch = new Search({
                        map: this.map
                    });

                    if (source) {
                        urlSearch.set("sources", [source]);
                    }
                    urlSearch.on("load", lang.hitch(this, function () {
                        urlSearch.search(value).then(lang.hitch(this, function () {
                            on.once(this.map.infoWindow, "hide", lang.hitch(this, function () {
                                urlSearch.clear();
                                urlSearch.destroy();
                                if (this.editor) {
                                    this._destroyEditor();
                                    this._createEditor();
                                }
                            }));
                        }));
                    }));
                    urlSearch.startup();

                }));
            }

            //create the tools
            this._createUI();

        },
        _setColor: function (color) {
            //Convert the string color from the config file to rgba if supported. 
            var rgb = Color.fromHex(color).toRgb();
            var outputColor = null;
            if (has("ie") < 9) {
                outputColor = color;
            } else {
                //rgba supported so add
                rgb.push(0.9);
                outputColor = Color.fromArray(rgb);

            }
            return outputColor;
        },
        _updateTheme: function () {
            //Update the app to use the configured color scheme. 
            //Set the background color using the configured theme value
            query(".bg").style("backgroundColor", this.theme.toString());
            query(".esriPopup .pointer").style("backgroundColor", this.theme.toString());
            query(".esriPopup .titlePane").style("backgroundColor", this.theme.toString());


            //Set the font color using the configured color value
            query(".fc").style("color", this.color.toString());
            query(".esriPopup .titlePane").style("color", this.color.toString());
            query(".esriPopup. .titleButton").style("color", this.color.toString());


            //Set the Slider +/- color to match the icon style. Valid values are white and black
            // White is default so we just need to update if using black.
            //Also update the menu icon to match the tool color. Default is white.
            if (this.config.icons === "black") {
                query(".esriSimpleSlider").style("color", "#000");
                query(".icon-color").style("color", "#000");
            }

        },

        _adjustPopupSize: function () {
            //Set the popup size to be half the widget and .35% of the map height
            if (!this.map) {
                return;
            }
            var box = domGeometry.getContentBox(this.map.container);

            var width = 270,
                height = 300,
                newWidth = Math.round(box.w * 0.50),
                newHeight = Math.round(box.h * 0.35);
            if (newWidth < width) {
                width = newWidth;
            }
            if (newHeight < height) {
                height = newHeight;
            }
            this.map.infoWindow.resize(width, height);
            on(this.map.infoWindow, "show", lang.hitch(this, function () {
                domClass.add(document.body, "noscroll");
            }));
            on(this.map.infoWindow, "hide", lang.hitch(this, function () {
                domClass.remove(document.body, "noscroll");
            }));
        },
        _createWebMap: function (itemInfo) {

            window.config = this.config;
            itemInfo = this._setExtent(itemInfo);

            var mapOptions = {};
            mapOptions = this._setLevel(mapOptions);
            mapOptions = this._setCenter(mapOptions);

            // create a map based on the input web map id
            arcgisUtils.createMap(itemInfo, "mapDiv", {
                mapOptions: mapOptions,
                editable: has("edit"),
                //is the app editable
                usePopupManager: true,
                layerMixins: this.config.layerMixins,
                bingMapsKey: this.config.bingKey
            }).then(lang.hitch(this, function (response) {
                this.map = response.map;
                domClass.add(this.map.infoWindow.domNode, "light");
                this._updateTheme();

                //Add a logo if provided
                if (this.config.logo) {
                    domConstruct.create("div", {
                        id: "panelLogo",
                        innerHTML: "<img id='logo' src=" + this.config.logo + "></>"
                    }, dom.byId("panelTitle"), "first");
                    domClass.add("panelTop", "largerTitle");
                }

                //Set the application title
                this.map = response.map;
                //Set the title - use the config value if provided.
                var title;
                if (this.config.title === null || this.config.title === "") {
                    title = response.itemInfo.item.title;
                } else {
                    title = this.config.title;
                }

                this.config.title = title;
                document.title = title;
                dom.byId("title").innerHTML = title;

                //Set subtitle if provided 
                if (this.config.subtitle) {
                    dom.byId("subtitle").innerHTML = this.config.subtitle;
                } else {
                    domClass.add("title", "nosubtitle");
                }
                this.config.response = response;

                this._createMapUI();
                // make sure map is loaded
                if (this.map.loaded) {
                    // do something with the map
                    this._mapLoaded();
                } else {
                    on.once(this.map, "load", lang.hitch(this, function () {
                        // do something with the map
                        this._mapLoaded();
                    }));
                }
            }), this.reportError);
        },
        _setLevel: function (options) {
            var level = this.config.level;
            //specify center and zoom if provided as url params 
            if (level) {
                options.zoom = level;
            }
            return options;
        },

        _setCenter: function (options) {
            var center = this.config.center;
            if (center) {
                var points = center.split(",");
                if (points && points.length === 2) {
                    options.center = [parseFloat(points[0]), parseFloat(points[1])];
                }
            }
            return options;
        },

        _setExtent: function (info) {
            var e = this.config.extent;
            //If a custom extent is set as a url parameter handle that before creating the map
            if (e) {
                var extArray = e.split(",");
                var extLength = extArray.length;
                if (extLength === 4) {
                    info.item.extent = [
                        [parseFloat(extArray[0]), parseFloat(extArray[1])],
                        [parseFloat(extArray[2]), parseFloat(extArray[3])]
                    ];
                }
            }
            return info;
        }
    });
});
