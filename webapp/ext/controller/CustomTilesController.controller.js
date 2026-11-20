sap.ui.define([
    "sap/m/HBox",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/ObjectNumber",
    "sap/ui/core/HTML",
    "sap/base/security/encodeXML",
    "sap/ui/comp/state/UIState"
], function (HBox, VBox, Text, ObjectNumber, HTML, encodeXML, UIState) {
    "use strict";

    // i18n helper - set in onInit (needs the view to reach the "i18n" model of the app)
    var _fnText = function (sKey) { return sKey; };

    // ---------------------------------------------------------------------------------------------
    // Translated DISPLAY text for backend values. The backend values themselves (the filter keys,
    // the data in the model) are never changed - only the text the user reads.
    //   field "status"          -> New / Reviewed / Rejected
    //   field "Confidence_band" -> PERFECT / HIGH / MEDIUM / LOW MATCH
    // ---------------------------------------------------------------------------------------------
    var VALUE_TEXT_KEYS = {
        "status": {
            "New": "statusNew",
            "Reviewed": "statusReviewed",
            "Rejected": "statusRejected"
        },
        "Confidence_band": {
            "PERFECT MATCH": "confBandPerfect",
            "HIGH MATCH": "confBandHigh",
            "MEDIUM MATCH": "confBandMedium",
            "LOW MATCH": "confBandLow"
        }
    };

    // backend value (any upper/lower case) -> translated text; undefined when there is nothing to translate
    function translateValue(sField, vValue) {
        var mMap = VALUE_TEXT_KEYS[sField];
        if (!mMap || typeof vValue !== "string") { return undefined; }
        var sUp = vValue.trim().toUpperCase();
        var sBackend = Object.keys(mMap).filter(function (s) { return s.toUpperCase() === sUp; })[0];
        if (!sBackend) { return undefined; }
        var sText = _fnText(mMap[sBackend]);
        return (sText && sText !== mMap[sBackend]) ? sText : undefined;   // key returned = text missing in i18n
    }

    // translated text -> backend value (safety net: a filter must always carry the backend value)
    function toBackendValue(sField, vValue) {
        var mMap = VALUE_TEXT_KEYS[sField];
        if (!mMap || typeof vValue !== "string") { return vValue; }
        var sUp = vValue.trim().toUpperCase();
        var aKeys = Object.keys(mMap);
        if (aKeys.some(function (s) { return s.toUpperCase() === sUp; })) { return vValue; }   // already a backend value
        var sFound = aKeys.filter(function (s) {
            var sText = _fnText(mMap[s]);
            return sText && sText !== mMap[s] && sText.toUpperCase() === sUp;
        })[0];
        return sFound !== undefined ? sFound : vValue;
    }

    // walks the (nested) filters and replaces a translated text by the backend value
    function normalizeFilters(aFilters) {
        try {
            (aFilters || []).forEach(function (oFilter) {
                if (!oFilter) { return; }
                if (oFilter.aFilters) { normalizeFilters(oFilter.aFilters); }
                if (oFilter.sPath === "status" || oFilter.sPath === "Confidence_band") {
                    if (oFilter.oValue1 !== undefined) { oFilter.oValue1 = toBackendValue(oFilter.sPath, oFilter.oValue1); }
                    if (oFilter.oValue2 !== undefined) { oFilter.oValue2 = toBackendValue(oFilter.sPath, oFilter.oValue2); }
                }
            });
        } catch (e) { /* never block the list because of this */ }
    }

    // dropdown items: key stays the backend value, only the shown text is translated
    function translateDropdownItems(oControl, sField) {
        try {
            (oControl.getItems ? oControl.getItems() : []).forEach(function (oItem) {
                var sBackend = (oItem.getKey && oItem.getKey()) || oItem.getText();
                var sText = translateValue(sField, sBackend);
                if (sText && oItem.getText() !== sText) { oItem.setText(sText); }
            });
        } catch (e) { /* ignore */ }
    }

    // finds the dropdown of a filter field and keeps its items translated (safe to call many times)
    function hookFilterDropdown(oSmartFilterBar, sField) {
        var oField = oSmartFilterBar.determineControlByName ? oSmartFilterBar.determineControlByName(sField) : null;
        if (!oField) { return false; }

        var aInner = oField.getInnerControls ? oField.getInnerControls() : [oField];
        var bReady = false;   // true once the dropdown exists and its items are bound / available

        aInner.forEach(function (oControl) {
            if (!oControl || !oControl.getItems) { return; }

            var fnTranslate = function () { translateDropdownItems(oControl, sField); };

            if (!oControl.__qtoTranslateHooked) {
                oControl.__qtoTranslateHooked = true;
                oControl.addEventDelegate({
                    onBeforeRendering: fnTranslate,
                    onfocusin: fnTranslate,
                    ontap: fnTranslate,
                    onsapshow: fnTranslate
                });
                if (oControl.attachLoadItems) {
                    oControl.attachLoadItems(function () { setTimeout(fnTranslate, 0); });
                }
            }

            // the items are (re)created when the value list arrives -> translate again afterwards
            var oBinding = oControl.getBinding("items");
            if (oBinding && !oBinding.__qtoTranslateHooked) {
                oBinding.__qtoTranslateHooked = true;
                oBinding.attachChange(fnTranslate);
                oBinding.attachDataReceived(fnTranslate);
            }

            fnTranslate();
            if (oBinding || oControl.getItems().length > 0) { bReady = true; }
        });

        return bReady;
    }

    return {
        onInit: function () {
            document.body.classList.remove("sapUiSizeCozy");
            document.body.classList.add("sapUiSizeCompact");
            // document.documentElement.classList.add("orderLinkScale");

            // change#fontsizeincrease1st
            this.getView().addStyleClass("orderLinkScale");

            var oView = this.getView();

            _fnText = function (sKey, aArgs) {
                var oModel = oView.getModel("i18n");
                var oBundle = oModel && oModel.getResourceBundle();
                return oBundle && oBundle.getText ? oBundle.getText(sKey, aArgs) : sKey;
            };

            var aHeaders = oView.findAggregatedObjects(
                true,
                function (oControl) {
                    return oControl.isA("sap.f.DynamicPageHeader");
                }
            );

            if (aHeaders.length === 0) {
                return;
            }

            var oHeader = aHeaders[0];
            var iOverallTotal = 0;

            // text is filled in the delayed block below, once the i18n model is available
            var oMatchCountText = new Text({
                text: ""
            });
            var bDataLoaded = false;

            var aFilterBars = oView.findAggregatedObjects(
                true,
                function (oControl) {
                    return oControl.isA("sap.ui.comp.smartfilterbar.SmartFilterBar");
                }
            );

            if (aFilterBars.length === 0) {
                return;
            }

            var oSmartFilterBar = aFilterBars[0];

            // ---- keep List Report filters across an app reload ----
            var FILTER_KEY = "SOL_ListReportFilters";
            // true only when we are coming back from an Object Page action
            var bRestoreFilters = sessionStorage.getItem("RefreshAfterAction") === "X";
            // the initial load below already runs process + Go, so the flag can be cleared
            if (bRestoreFilters) { sessionStorage.removeItem("RefreshAfterAction"); }

            function saveFilters() {
                try {
                    var oUiState = oSmartFilterBar.getUiState({ allFilters: false });
                    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
                        selectionVariant: oUiState.getSelectionVariant()
                    }));
                } catch (e) { /* never block the app because of this */ }
            }

            function restoreFilters() {
                try {
                    var sSaved = sessionStorage.getItem(FILTER_KEY);
                    if (!sSaved) { return; }
                    var oSaved = JSON.parse(sSaved);
                    oSmartFilterBar.setUiState(
                        new UIState({ selectionVariant: oSaved.selectionVariant }),
                        { replace: true, strictMode: false }
                    );
                } catch (e) { /* ignore */ }
            }

            if (bRestoreFilters) {
                if (oSmartFilterBar.isInitialised && oSmartFilterBar.isInitialised()) {
                    restoreFilters();
                } else {
                    oSmartFilterBar.attachInitialized(restoreFilters);
                }
                // smartVariantManagement applies the default variant after init -> restore again once
                oSmartFilterBar.attachEventOnce("afterVariantLoad", restoreFilters);
            }
            // ---------------------------------------------------------

            // FIX: true while a Go press fired by our own process callback is pending,
            // so that search does not trigger the confidence process a second time.
            var bProcessTriggeredGo = false;

            function pressGoAfterProcess() {
                var oGoButton = sap.ui.getCore().byId(
                    "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ListReport.view.ListReport::ZC_QTO_SO_QT--listReportFilter-btnGo"
                );
                if (oGoButton) {
                    bProcessTriggeredGo = true;
                    oGoButton.firePress();
                    // safety reset in case the search never fires
                    setTimeout(function () { bProcessTriggeredGo = false; }, 5000);
                }
            }

            function runConfidenceProcess(fnSuccess, fnError) {
                $.ajax({
                    url: "/sap/opu/odata/sap/ZODATA_QTO_CONFIDENCE_SRV/",
                    method: "GET",
                    headers: { "X-CSRF-Token": "Fetch" },
                    error: function () {
                        if (fnError) { fnError(); }
                    },
                    success: function (data, textStatus, xhr) {
                        var sToken = xhr.getResponseHeader("X-CSRF-Token");
                        $.ajax({
                            url: "/sap/opu/odata/sap/ZODATA_QTO_CONFIDENCE_SRV/TriggerProcess?$format=json",
                            method: "POST",
                            headers: {
                                "X-CSRF-Token": sToken,
                                "Content-Type": "application/json"
                            },
                            error: function () {
                                if (fnError) { fnError(); }
                            },
                            success: function (oResponse) {
                                var sStatus = oResponse?.d?.TriggerProcess?.Status;
                                if (sStatus === "SUCCESS" && fnSuccess) {
                                    fnSuccess();
                                } else if (sStatus !== "SUCCESS" && fnError) {
                                    fnError();
                                }
                            }
                        });
                    }
                });
            }

            // PERFORMANCE: at page open several things ask for the confidence process at the
            // same time (initial load, Fiori Elements' own first search, Go). Instead of running
            // the backend process once per caller, all callers that arrive while it is running
            // share ONE run and are all notified when it finishes.
            var aProcessWaiters = null;   // null = process not running

            function triggerConfidenceProcess(fnSuccess, fnError) {
                if (aProcessWaiters) {
                    aProcessWaiters.push({ ok: fnSuccess, err: fnError });
                    return;
                }
                aProcessWaiters = [{ ok: fnSuccess, err: fnError }];

                var bFinished = false;
                function finish(bOk) {
                    if (bFinished) { return; }
                    bFinished = true;
                    var aWaiters = aProcessWaiters;
                    aProcessWaiters = null;
                    aWaiters.forEach(function (oWaiter) {
                        var fn = bOk ? oWaiter.ok : oWaiter.err;
                        if (fn) {
                            try { fn(); } catch (e) { console.error(e); }
                        }
                    });
                }

                runConfidenceProcess(function () { finish(true); }, function () { finish(false); });

                // safety net: never stay "running" forever if a request hangs
                setTimeout(function () { finish(false); }, 60000);
            }

            // Object Page asks for a data refresh (no reload -> filters stay as they are)
            var bRefreshing = false;
            var fnSilentRefresh = null;   // assigned below, once updateKpis exists

            // wait until the List Report is really displayed again (hash no longer points to
            // the object page), so the Go read does not overlap with the read Fiori Elements
            // starts itself while navigating back
            function whenListVisible(fnCallback) {
                var iTries = 0;
                (function check() {
                    var bOnObjectPage = /&\/ZC_QTO_SO_QT\(/.test(window.location.hash || "");
                    if (!bOnObjectPage || iTries++ >= 20) {
                        setTimeout(fnCallback, 200);
                        return;
                    }
                    setTimeout(check, 100);
                })();
            }

            // PERFORMANCE: the rows are refreshed IMMEDIATELY. The (slow) backend confidence
            // process no longer blocks the list: after Reset / Reject / Link it runs in the
            // background and the list + KPIs are refreshed quietly once it has finished.
            function refreshAfterAction(sChannelId, sEventId, oEventData) {
                if (bRefreshing) { return; }
                bRefreshing = true;
                try { sessionStorage.removeItem("RefreshAfterAction"); } catch (e) { /* ignore */ }

                // plain "Return to list" sends full === false: nothing changed -> no confidence process
                var bFull = !(oEventData && oEventData.full === false);

                whenListVisible(function () {
                    bRefreshing = false;
                    pressGoAfterProcess();   // Go reuses the filter values already in the filter bar

                    if (bFull) {
                        triggerConfidenceProcess(function () {
                            if (fnSilentRefresh) { fnSilentRefresh(); }
                        }, null);
                    }
                });

                // safety reset if a request never returns
                setTimeout(function () { bRefreshing = false; }, 30000);
            }
            // never keep two subscriptions (e.g. if this controller is initialised twice)
            if (window.__qtoListNeedsRefresh) {
                sap.ui.getCore().getEventBus().unsubscribe(
                    "OrderLink", "listNeedsRefresh", window.__qtoListNeedsRefresh, window.__qtoListNeedsRefreshCtx);
            }
            window.__qtoListNeedsRefresh = refreshAfterAction;
            window.__qtoListNeedsRefreshCtx = this;
            this._fnListNeedsRefresh = refreshAfterAction;
            sap.ui.getCore().getEventBus().subscribe(
                "OrderLink", "listNeedsRefresh", this._fnListNeedsRefresh, this);

            setTimeout(function () {
                var aTitles = oView.findAggregatedObjects(
                    true,
                    function (oControl) {
                        return oControl.isA("sap.f.DynamicPageTitle");
                    }
                );

                oMatchCountText.setText(_fnText("matchCount", [0, 0]));

                if (aTitles.length > 0) {
                    aTitles[0].addAction(oMatchCountText);
                }

                // 1. TOP ROW KPIS CONTROLS
                var oTotalMatches = new ObjectNumber({ number: "0" }).addStyleClass("kpiCardValue");
                var oNew = new ObjectNumber({ number: "0" }).addStyleClass("kpiCardValue");
                var oReviewed = new ObjectNumber({ number: "0" }).addStyleClass("kpiCardValue");

                var oSubNew = new Text({ text: _fnText("kpiPctOfTotal", [0]) }).addStyleClass("kpiSubText");
                var oSubReviewed = new Text({ text: _fnText("kpiPctOfTotal", [0]) }).addStyleClass("kpiSubText");

                var oKpiRow = new HBox({
                    width: "100%",
                    alignItems: "Stretch",
                    items: [
                        new HBox({
                            alignItems: "Center",
                            items: [
                                createKpiIcon("total"),
                                new VBox({
                                    items: [
                                        new Text({ text: _fnText("kpiTotalMatches") }).addStyleClass("kpiCardTitle"),
                                        oTotalMatches,
                                        // new Text({ text: "+12 since last run" }).addStyleClass("kpiSubText") //hide under total match
                                    ]
                                }).addStyleClass("kpiInfo"),
                                createSparkline("#0070F2", "kpiSparkBlue")
                            ]
                        }).addStyleClass("kpiCard kpiTotalCard"),

                        new HBox({
                            alignItems: "Center",
                            items: [
                                createKpiIcon("new"),
                                new VBox({
                                    items: [
                                        new Text({ text: _fnText("kpiNew") }).addStyleClass("kpiCardTitle"),
                                        oNew,
                                        oSubNew
                                    ]
                                }).addStyleClass("kpiInfo"),
                                createSparkline("#0070F2", "kpiSparkBlue")
                            ]
                        }).addStyleClass("kpiCard kpiNewCard"),

                        new HBox({
                            alignItems: "Center",
                            items: [
                                createKpiIcon("success"),
                                new VBox({
                                    items: [
                                        new Text({ text: _fnText("kpiReviewed") }).addStyleClass("kpiCardTitle"),
                                        oReviewed,
                                        oSubReviewed
                                    ]
                                }).addStyleClass("kpiInfo"),
                                createSparkline("#107E3E", "kpiSparkGreen")
                            ]
                        }).addStyleClass("kpiCard kpiReviewedCard")
                    ]
                }).addStyleClass("kpiCardsRow");

                // 2. DYNAMIC ANALYTICS CARDS (Status, Confidence, Discrepancies)
                var oStatusChartHtml = new HTML({ id: "statusChartContainer", content: "<div class='chartPlaceholder'>" + encodeXML(_fnText("loading")) + "</div>" });
                var oConfidenceChartHtml = new HTML({ id: "confidenceChartContainer", content: "<div class='chartPlaceholder'>" + encodeXML(_fnText("loading")) + "</div>" });
                var oDiscrepancyChartHtml = new HTML({ id: "discrepancyChartContainer", content: "<div class='chartPlaceholder'>" + encodeXML(_fnText("loading")) + "</div>" });

                var oAnalyticsRow = new HBox({
                    width: "100%",
                    justifyContent: "SpaceBetween",
                    items: [
                        new VBox({
                            width: "32%",
                            items: [
                                new Text({ text: _fnText("chartMatchStatus") }).addStyleClass("analyticsCardTitle"),
                                oStatusChartHtml
                            ]
                        }).addStyleClass("analyticsCard"),

                        new VBox({
                            width: "32%",
                            items: [
                                new Text({ text: _fnText("chartConfidence") }).addStyleClass("analyticsCardTitle"),
                                oConfidenceChartHtml
                            ]
                        }).addStyleClass("analyticsCard"),

                        new VBox({
                            width: "32%",
                            items: [
                                new Text({ text: _fnText("chartMismatch") }).addStyleClass("analyticsCardTitle"),
                                oDiscrepancyChartHtml
                            ]
                        }).addStyleClass("analyticsCard")
                    ]
                }).addStyleClass("analyticsCardsRow");

                // Insert into Dynamic Header
                oHeader.insertContent(oAnalyticsRow, 0);
                oHeader.insertContent(oKpiRow, 0);

                var oModel = oView.getModel();

                // PERFORMANCE: the KPI read loads ALL rows. If the same read is already running
                // (e.g. at page open) do not start it again; if the filters changed meanwhile,
                // run the latest one once after the current read.
                var oKpiInFlight = null;
                var oKpiPending = null;

                function kpiSignature(aFilters, sStatus) {
                    try { return JSON.stringify([aFilters || [], sStatus || ""]); }
                    catch (e) { return "u" + Date.now() + Math.random(); }   // cannot compare -> never skip
                }

                // PERFORMANCE: the KPI/charts only use these fields -> do not download all columns.
                // Only fields that exist in the service metadata are selected (a missing one would
                // otherwise make the whole request fail); if the metadata is not available, no $select.
                var KPI_FIELDS = ["status", "Confidence",
                    "so_paymentTerm", "qt_paymentTerm", "so_incoTerm", "qt_incoTerm",
                    "so_salesResponsibleIdName", "qt_salesResponsibleIdName",
                    "so_currency", "qt_currency"];
                var sKpiSelect = null;

                // fingerprint of what the background confidence process can change (status + confidence of every row)
                var sLastKpiSig = null;
                function kpiResultSignature(aResults) {
                    return aResults.map(function (r) { return r.status + "|" + r.Confidence; }).join(",");
                }

                function kpiUrlParameters() {
                    var mParams = { "$top": "10000000" };
                    try {
                        if (sKpiSelect === null) {
                            sKpiSelect = "";
                            var oMeta = oModel.getMetaModel && oModel.getMetaModel();
                            var oSet = oMeta && oMeta.getODataEntitySet && oMeta.getODataEntitySet("ZC_QTO_SO_QT");
                            var oType = oSet && oMeta.getODataEntityType(oSet.entityType);
                            if (oType && oType.property) {
                                var aExisting = KPI_FIELDS.filter(function (sField) {
                                    return oType.property.some(function (oProp) { return oProp.name === sField; });
                                });
                                if (aExisting.length > 0) { sKpiSelect = aExisting.join(","); }
                            }
                            if (!sKpiSelect) { sKpiSelect = null; }   // not available yet -> try again next time
                        }
                        if (sKpiSelect) { mParams["$select"] = sKpiSelect; }
                    } catch (e) { /* no $select */ }
                    return mParams;
                }

                // fnAfter (optional): called with (newFingerprint, fingerprintBeforeThisRead) after the read
                function updateKpis(aFilters, sStatus, fnAfter) {
                    var sSig = kpiSignature(aFilters, sStatus);
                    if (oKpiInFlight) {
                        if (fnAfter) {
                            // must run AFTER the read that is running now (that one may still hold pre-process data)
                            oKpiPending = { aFilters: aFilters, sStatus: sStatus, fnAfter: fnAfter };
                        } else if (oKpiInFlight.sig === sSig) {
                            console.log("KPI read skipped (same read already running)");
                        } else {
                            oKpiPending = { aFilters: aFilters, sStatus: sStatus,
                                fnAfter: oKpiPending && oKpiPending.fnAfter };   // latest wins, keep a waiting fnAfter
                        }
                        return;
                    }
                    oKpiInFlight = { sig: sSig };
                    var sBaseline = sLastKpiSig;

                    var fnKpiDone = function () {
                        oKpiInFlight = null;
                        if (oKpiPending) {
                            var oNext = oKpiPending;
                            oKpiPending = null;
                            updateKpis(oNext.aFilters, oNext.sStatus, oNext.fnAfter);
                        }
                    };

                    var mReadOptions = {
                        // FIX: service pages at 100 rows by default; read all rows for the KPIs/charts
                        urlParameters: kpiUrlParameters(),
                        success: function (oData) {
                            var aResults = oData.results || [];

                            if (sStatus) {
                                aResults = aResults.filter(function (r) { return r.status === sStatus; });
                            }

                            var iTotal = aResults.length;
                            if (!aFilters || aFilters.length === 0) {
                                iOverallTotal = iTotal;
                            }

                            bDataLoaded = true;
                            oMatchCountText.setText(_fnText("matchCount", [iTotal, iOverallTotal]));

                            var iNew = aResults.filter(function (r) { return r.status === "New"; }).length;
                            var iReviewed = aResults.filter(function (r) { return r.status === "Reviewed"; }).length;
                            var iRejected = aResults.filter(function (r) { return r.status === "Rejected"; }).length;

                            var iNewPct = iTotal > 0 ? Math.round((iNew / iTotal) * 100) : 0;
                            var iRevPct = iTotal > 0 ? Math.round((iReviewed / iTotal) * 100) : 0;
                            var iRejPct = iTotal > 0 ? Math.round((iRejected / iTotal) * 100) : 0;

                            oTotalMatches.setNumber(String(iTotal));
                            oNew.setNumber(String(iNew));
                            oReviewed.setNumber(String(iReviewed));

                            oSubNew.setText(_fnText("kpiPctOfTotal", [iNewPct]));
                            oSubReviewed.setText(_fnText("kpiPctOfTotal", [iRevPct]));

                            // RENDER DYNAMIC CHARTS
                            renderMatchStatusChart(oStatusChartHtml, iTotal, iNew, iReviewed, iRejected, iNewPct, iRevPct, iRejPct);
                            renderConfidenceChart(oConfidenceChartHtml, aResults);
                            renderDiscrepancyChart(oDiscrepancyChartHtml, aResults);

                            var sNewSig = kpiResultSignature(aResults);
                            if (fnAfter) {
                                try { fnAfter(sNewSig, sBaseline); } catch (e) { console.error(e); }
                            }
                            sLastKpiSig = sNewSig;
                        }
                    };

                    var fnKpiSuccess = mReadOptions.success;
                    mReadOptions.success = function (oData) {
                        try { fnKpiSuccess(oData); } finally { fnKpiDone(); }
                    };
                    mReadOptions.error = function () { fnKpiDone(); };

                    if (aFilters && aFilters.length > 0) {
                        mReadOptions.filters = aFilters;
                    }

                    oModel.read("/ZC_QTO_SO_QT", mReadOptions);
                }

                var oSmartTable = sap.ui.getCore().byId(
                    "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ListReport.view.ListReport::ZC_QTO_SO_QT--listReport"
                );

                var aCurrentFilters = [];

                // quiet refresh after the background confidence process: reload the table rows
                // and the KPIs with the filters that are currently active (no Go press, no overlay reset)
                fnSilentRefresh = function () {
                    try {
                        var aFilters = aCurrentFilters || [];
                        var sStatus = toBackendValue("status", (oSmartFilterBar.getFilterData() || {}).status) || "";
                        // refresh the KPIs quietly (no overlay). The table is only reloaded when the background
                        // process really changed status / confidence - otherwise the user would see a second,
                        // pointless reload of a list that is already correct.
                        updateKpis(aFilters, sStatus, function (sNewSig, sBaseline) {
                            if (sBaseline !== null && sNewSig === sBaseline) {
                                console.log("Confidence process changed nothing -> table not reloaded");
                                return;
                            }
                            var oInner = oSmartTable && oSmartTable.getTable && oSmartTable.getTable();
                            var oBinding = oInner && (oInner.getBinding("items") || oInner.getBinding("rows"));
                            if (oBinding) { oBinding.refresh(); }
                        });
                    } catch (e) { console.error(e); }
                };
                var oHookedTable = null;
                var oStatusObserver = null;
                var oObservedDom = null;

                // shows the translated text for a backend value in the table cells (the model data is untouched)
                function translateCells(oRoot, sSelector, sField) {
                    (oRoot || document).querySelectorAll(sSelector).forEach(function (oCell) {
                        var sShown = oCell.textContent.trim();
                        var sTranslated = translateValue(sField, sShown);
                        if (sTranslated && sTranslated !== sShown) { oCell.textContent = sTranslated; }
                    });
                }

                function applyStatusColors(oRoot) {
                    translateCells(oRoot, 'td[data-sap-ui-column*="status"] .sapMText', "status");
                    translateCells(oRoot, 'td[data-sap-ui-column*="confidence_band" i] .sapMText', "Confidence_band");

                    (oRoot || document).querySelectorAll('td[data-sap-ui-column*="status"] .sapMText').forEach(function (oStatus) {
                        var sText = oStatus.textContent.trim();
                        var sCls = "";
                        // backend value (EN) or its translated text
                        if (sText === "New" || sText === _fnText("statusNew")) { sCls = "statusNew"; }
                        else if (sText === "Reviewed" || sText === _fnText("statusReviewed")) { sCls = "statusReviewed"; }
                        else if (sText === "Rejected" || sText === _fnText("statusRejected")) { sCls = "statusRejected"; }

                        ["statusNew", "statusReviewed", "statusRejected"].forEach(function (sC) {
                            if (sC !== sCls && oStatus.classList.contains(sC)) { oStatus.classList.remove(sC); }
                        });
                        if (sCls && !oStatus.classList.contains(sCls)) { oStatus.classList.add(sCls); }
                    });
                }

                // PERFORMANCE: a MutationObserver runs before the browser paints, so the pill
                // colours are set in the same frame the rows are rendered (no plain-text flash).
                // Only class attributes are changed, and attributes are not observed -> no loop.
                function watchStatusColumn(oInnerTable) {
                    var oDom = oInnerTable && oInnerTable.getDomRef();
                    if (!oDom) { return; }
                    if (oDom !== oObservedDom) {
                        if (oStatusObserver) { oStatusObserver.disconnect(); }
                        oObservedDom = oDom;
                        oStatusObserver = new MutationObserver(function () { applyStatusColors(oDom); });
                        oStatusObserver.observe(oDom, { childList: true, subtree: true, characterData: true });
                    }
                    applyStatusColors(oDom);
                }

                if (oSmartTable) {
                    oSmartTable.attachBeforeRebindTable(function (oEvent) {
                        var mBindingParams = oEvent.getParameter("bindingParams");
                        normalizeFilters(mBindingParams.filters);   // filters always carry the backend value, never the translated text
                        aCurrentFilters = mBindingParams.filters || [];

                        // attach the listeners ONCE per inner table instance (before, a new one was added on every rebind)
                        var oInnerTable = oSmartTable.getTable();
                        if (!oInnerTable || oInnerTable === oHookedTable) { return; }
                        oHookedTable = oInnerTable;
                        oInnerTable.addEventDelegate({
                            onAfterRendering: function () { watchStatusColumn(oInnerTable); }
                        });
                        oInnerTable.attachUpdateFinished(function () { watchStatusColumn(oInnerTable); });
                        watchStatusColumn(oInnerTable);
                    });
                }

                if (bRestoreFilters) { restoreFilters(); }

                // Status / Confidence Band dropdowns: translated texts, backend values stay the keys.
                // The fields may be created a little later -> try for a while; idempotent.
                function hookFilterDropdowns() {
                    var bStatus = hookFilterDropdown(oSmartFilterBar, "status");
                    var bBand = hookFilterDropdown(oSmartFilterBar, "Confidence_band");
                    return bStatus && bBand;
                }
                var iDropdownTries = 0;
                var oDropdownInterval = setInterval(function () {
                    iDropdownTries++;
                    var bBoth = false;
                    try { bBoth = hookFilterDropdowns(); } catch (e) { console.error(e); }
                    if (bBoth || iDropdownTries >= 40) { clearInterval(oDropdownInterval); }
                }, 500);
                if (oSmartFilterBar.attachAfterVariantLoad) {
                    oSmartFilterBar.attachAfterVariantLoad(function () {
                        try { hookFilterDropdowns(); } catch (e) { /* ignore */ }
                    });
                }

                oSmartFilterBar.attachSearch(function () {
                    saveFilters();
                    var aFilters = aCurrentFilters || [];
                    var oFilterData = oSmartFilterBar.getFilterData();
                    var sStatus = toBackendValue("status", oFilterData.status) || "";

                    // FIX: if this search was caused by our own Go press, the confidence
                    // process has already finished -> just read fresh data.
                    if (bProcessTriggeredGo) {
                        bProcessTriggeredGo = false;
                        updateKpis(aFilters, sStatus);
                        return;
                    }

                    // Normal user search: recalculate confidence FIRST, then read for the charts.
                    // (Falls back to reading anyway if the process fails.)
                    triggerConfidenceProcess(
                        function () { updateKpis(aFilters, sStatus); },
                        function () { updateKpis(aFilters, sStatus); }
                    );
                });

                triggerConfidenceProcess(pressGoAfterProcess);

                 //change#intialload
        // Fallback initial load - only if nothing is loading right now, so it never
        // duplicates a load that is still running (the KPI read of all rows can be slow)
        function fallbackInitialGo(iTry) {
            if (bDataLoaded && iOverallTotal !== 0) { return; }

            if ((oKpiInFlight || aProcessWaiters) && iTry < 4) {
                setTimeout(function () { fallbackInitialGo(iTry + 1); }, 3000);
                return;
            }

            var oGoButton = sap.ui.getCore().byId(
                "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ListReport.view.ListReport::ZC_QTO_SO_QT--listReportFilter-btnGo"
            );

            if (oGoButton) {
                console.log("INITIAL FALLBACK GO");
                oGoButton.firePress();
            }
        }

        setTimeout(function () { fallbackInitialGo(0); }, 3000);

            }, 1000);
        },

        onExit: function () {
            if (this._fnListNeedsRefresh) {
                sap.ui.getCore().getEventBus().unsubscribe(
                    "OrderLink", "listNeedsRefresh", this._fnListNeedsRefresh, this);
                this._fnListNeedsRefresh = null;
            }
            // document.documentElement.classList.remove("orderLinkScale");

            // change#fontsizeincrease1st
            this.getView().removeStyleClass("orderLinkScale");
            
        }
    };

    function createSparkline(sColor, sBgClass) {
        return new HTML({
            content: '<div class="kpiSparkContainer ' + sBgClass + '">' +
                '<svg viewBox="0 0 85 35" preserveAspectRatio="none">' +
                '<path d="M 2 28 C 14 18, 22 24, 34 18 C 46 12, 52 22, 64 14 C 72 8, 78 12, 83 4 L 83 35 L 2 35 Z" fill="' + sColor + '" fill-opacity="0.12" stroke="none"/>' +
                '<path d="M 2 28 C 14 18, 22 24, 34 18 C 46 12, 52 22, 64 14 C 72 8, 78 12, 83 4" fill="none" stroke="' + sColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
                '</svg></div>'
        });
    }

    function createKpiIcon(sType) {
        var sSvg = "";
        var sCls = "kpiIconWrap ";

        if (sType === "total") {
            sCls += "kpiIconTotal";
            sSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/>' +
                '<circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>';
        } else if (sType === "new") {
            sCls += "kpiIconNew";
            sSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/>' +
                '<polyline points="14 2 14 7 19 7"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>';
        } else {
            sCls += "kpiIconSuccess";
            sSvg = '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
                '<circle cx="12" cy="12" r="11" fill="#107E3E"/>' +
                '<polyline points="7 12.5 10.5 16 17 9" stroke="#ffffff" stroke-width="2.4"/></svg>';
        }

        return new HTML({ content: '<div class="' + sCls + '">' + sSvg + '</div>' });
    }

    function renderMatchStatusChart(oHtmlControl, iTotal, iNew, iReviewed, iRejected, iNewPct, iRevPct, iRejPct) {
        var sHtml = '<div class="donutChartBox">' +
            '<div class="donutGraphic" style="background: conic-gradient(#1a73e8 0% ' + iNewPct + '%, #107e3e ' + iNewPct + '% ' + (iNewPct + iRevPct) + '%, #d93025 ' + (iNewPct + iRevPct) + '% 100%);">' +
            '<div class="donutInner"><span class="donutNum">' + iTotal + '</span><span class="donutLabel">' + encodeXML(_fnText("total")) + '</span></div>' +
            '</div>' +
            '<div class="donutLegend">' +
            '<div class="legendItem"><span class="dot blue"></span><span class="lbl">' + encodeXML(_fnText("legendStatusPct", [_fnText("statusNew"), iNewPct])) + '</span></div>' +
            '<div class="legendItem"><span class="dot green"></span><span class="lbl">' + encodeXML(_fnText("legendStatusPct", [_fnText("statusReviewed"), iRevPct])) + '</span></div>' +
            '<div class="legendItem"><span class="dot red"></span><span class="lbl">' + encodeXML(_fnText("legendStatusPct", [_fnText("statusRejected"), iRejPct])) + '</span></div>' +
            '</div>' +
            '</div>';
        oHtmlControl.setContent(sHtml);
    }

    function renderConfidenceChart(oHtmlControl, aResults) {

    var c1 = 0, c2 = 0, c3 = 0, c4 = 0;

    aResults.forEach(function (r) {

        var val = Math.round(Number(r.Confidence) || 0);

        if (val >= 90) {
            c1++;
        } else if (val >= 70) {
            c2++;
        } else if (val >= 50) {
            c3++;
        } else {
            c4++;
        }
    });

    console.log(
        "Buckets:",
        "90-100 =", c1,
        "70-89 =", c2,
        "50-69 =", c3,
        "<50 =", c4
    );

    var max = Math.max(c1, c2, c3, c4, 1);

    var sHtml =
        '<div class="barDistBox">' +
        createDistRow("90-100%", c1, Math.round((c1 / max) * 100)) +
        createDistRow("70-89%", c2, Math.round((c2 / max) * 100)) +
        createDistRow("50-69%", c3, Math.round((c3 / max) * 100)) +
        createDistRow("<50%", c4, Math.round((c4 / max) * 100)) +
        '</div>';

    oHtmlControl.setContent(sHtml);
}

    function createDistRow(sLabel, iCount, iPct) {
        return '<div class="distRow">' +
            '<span class="distLbl">' + encodeXML(sLabel) + '</span>' +
            '<div class="distTrack"><div class="distFill" style="width:' + iPct + '%;"></div></div>' +
            '<span class="distVal">' + iCount + '</span>' +
            '</div>';
    }

    function renderDiscrepancyChart(oHtmlControl, aResults) {
        var disc = { "Payment Terms": 0, "IncoTerms": 0, "Sales Responsible": 0, "Currency": 0 };

        aResults.forEach(function (r) {
            if (r.so_paymentTerm !== r.qt_paymentTerm) disc["Payment Terms"]++;
            if (r.so_incoTerm !== r.qt_incoTerm) disc["IncoTerms"]++;
            if (r.so_salesResponsibleIdName !== r.qt_salesResponsibleIdName) disc["Sales Responsible"]++;
            if (r.so_currency !== r.qt_currency) disc["Currency"]++;
        });

        var max = Math.max(disc["Payment Terms"], disc["IncoTerms"], disc["Sales Responsible"], disc["Currency"], 1);

        var sHtml = '<div class="barDistBox">' +
            createDistRow(_fnText("mismatchPaymentTerms"), disc["Payment Terms"], Math.round((disc["Payment Terms"] / max) * 100)) +
            createDistRow(_fnText("mismatchIncoterms"), disc["IncoTerms"], Math.round((disc["IncoTerms"] / max) * 100)) +
            createDistRow(_fnText("mismatchSalesRep"), disc["Sales Responsible"], Math.round((disc["Sales Responsible"] / max) * 100)) +
            createDistRow(_fnText("mismatchCurrency"), disc["Currency"], Math.round((disc["Currency"] / max) * 100)) +
            '</div>';
        oHtmlControl.setContent(sHtml);
    }
});