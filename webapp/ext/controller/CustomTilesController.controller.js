sap.ui.define([
    "sap/m/HBox",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/ObjectNumber",
    "sap/ui/core/HTML",
    "sap/base/security/encodeXML"
], function (HBox, VBox, Text, ObjectNumber, HTML, encodeXML) {
    "use strict";

    // i18n helper - set in onInit (needs the view to reach the "i18n" model of the app)
    var _fnText = function (sKey) { return sKey; };

    return {
        onInit: function () {
            document.body.classList.remove("sapUiSizeCozy");
            document.body.classList.add("sapUiSizeCompact");
            document.documentElement.classList.add("orderLinkScale");

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

            function triggerConfidenceProcess(fnSuccess, fnError) {
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

            this._oRefreshInterval = setInterval(function () {
                if (sessionStorage.getItem("RefreshAfterAction") === "X") {
                    sessionStorage.removeItem("RefreshAfterAction");
                    triggerConfidenceProcess(pressGoAfterProcess);
                }
            }, 1000);

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

                function updateKpis(aFilters, sStatus) {
                    var mReadOptions = {
                        // FIX: service pages at 100 rows by default; read all rows for the KPIs/charts
                        urlParameters: { "$top": "10000000" },
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
                        }
                    };

                    if (aFilters && aFilters.length > 0) {
                        mReadOptions.filters = aFilters;
                    }

                    oModel.read("/ZC_QTO_SO_QT", mReadOptions);
                }

                var oSmartTable = sap.ui.getCore().byId(
                    "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ListReport.view.ListReport::ZC_QTO_SO_QT--listReport"
                );

                var aCurrentFilters = [];
                if (oSmartTable) {
                    oSmartTable.attachBeforeRebindTable(function (oEvent) {
                        var mBindingParams = oEvent.getParameter("bindingParams");
                        aCurrentFilters = mBindingParams.filters || [];
                        var oInnerTable = oSmartTable.getTable();
                        if (oInnerTable) {
                            oInnerTable.attachUpdateFinished(function () {
                                applyStatusColors();
                            });
                        }
                    });
                }

                function applyStatusColors() {
                    document.querySelectorAll('td[data-sap-ui-column*="status"] .sapMText').forEach(function (oStatus) {
                        var sText = oStatus.textContent.trim();
                        oStatus.classList.remove("statusNew", "statusReviewed", "statusRejected");
                        // backend value (EN) or its translated text
                        if (sText === "New" || sText === _fnText("statusNew")) oStatus.classList.add("statusNew");
                        else if (sText === "Reviewed" || sText === _fnText("statusReviewed")) oStatus.classList.add("statusReviewed");
                        else if (sText === "Rejected" || sText === _fnText("statusRejected")) oStatus.classList.add("statusRejected");
                    });
                }

                oSmartFilterBar.attachSearch(function () {
                    var aFilters = aCurrentFilters || [];
                    var oFilterData = oSmartFilterBar.getFilterData();
                    var sStatus = oFilterData.status || "";

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
        // Fallback initial load
        setTimeout(function () {

            if (!bDataLoaded || iOverallTotal === 0) {

                var oGoButton = sap.ui.getCore().byId(
                    "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ListReport.view.ListReport::ZC_QTO_SO_QT--listReportFilter-btnGo"
                );

                if (oGoButton) {
                    console.log("INITIAL FALLBACK GO");
                    oGoButton.firePress();
                }
            }

        }, 3000);

            }, 1000);
        },

        onExit: function () {
            if (this._oRefreshInterval) {
                clearInterval(this._oRefreshInterval);
                this._oRefreshInterval = null;
            }
            document.documentElement.classList.remove("orderLinkScale");
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