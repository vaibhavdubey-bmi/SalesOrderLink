sap.ui.define([
    "sap/m/HBox",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/ObjectNumber",
    "sap/m/ComboBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/BusyIndicator"
], function (HBox, VBox, Text, ObjectNumber, ComboBox, Filter, FilterOperator, BusyIndicator) {
    "use strict";


    return {


        // Initialize custom KPI section and Confidence filter


        onInit: function () {

            // Open the whole app in compact density (smaller buttons/rows/spacing)
            // so it fits comfortably at 100% browser zoom
            document.body.classList.remove("sapUiSizeCozy");
            document.body.classList.add("sapUiSizeCompact");

            // Open the app at ~90% of the normal size (see css/style.css, .orderLinkScale)
            document.documentElement.classList.add("orderLinkScale");

            console.log(
             "LIST REPORT ONINIT EXECUTED"
            );

            console.log("KPI Controller started");


            var oView = this.getView();

                // Get Dynamic Page Header where custom controls will be added
                var aHeaders = oView.findAggregatedObjects(
                    true,
                    function (oControl) {
                        return oControl.isA("sap.f.DynamicPageHeader");
                    }
                );


                console.log(
                    "Dynamic Page Headers found:",
                    aHeaders.length
                );


                if (aHeaders.length === 0) {
                    console.log("DynamicPageHeader NOT FOUND");
                    return;
                }


                var oHeader = aHeaders[0];


                console.log(
                    "DynamicPageHeader found:",
                    oHeader.getId()
                );
            


var iOverallTotal = 0;


// Displays "X of Y matches" in the page title


var oMatchCountText = new Text({
    text: "0 of 0 matches"
});


console.log(
    "Match count text created"
);


                // Get Smart Filter Bar to listen for Go button searches
                var aFilterBars = oView.findAggregatedObjects(
                    true,
                    function (oControl) {
                        return oControl.isA(
                            "sap.ui.comp.smartfilterbar.SmartFilterBar"
                        );
                    }
                );


                console.log(
                    "Smart Filter Bars found:",
                    aFilterBars.length
                );


                if (aFilterBars.length === 0) {
                    console.log("SmartFilterBar NOT FOUND");
                    return;
                }


                var oSmartFilterBar = aFilterBars[0];


// Confidence refresh with detailed stage-by-stage console logging
function triggerConfidenceProcess(fnSuccess) {

    console.log("=== STAGE 1: Starting CSRF Token Fetch for Confidence Service ===");

    $.ajax({
        url: "/sap/opu/odata/sap/ZODATA_QTO_CONFIDENCE_SRV/",
        method: "GET",
        headers: {
            "X-CSRF-Token": "Fetch"
        },


        success: function (data, textStatus, xhr) {
            var sToken = xhr.getResponseHeader("X-CSRF-Token");

            console.log("=== STAGE 2: CSRF Token Fetched Successfully ===", sToken);
            console.log("=== STAGE 3: Initiating POST request to TriggerProcess ===");

            $.ajax({
                url: "/sap/opu/odata/sap/ZODATA_QTO_CONFIDENCE_SRV/TriggerProcess?$format=json",
                method: "POST",

                headers: {
                    "X-CSRF-Token": sToken,
                    "Content-Type": "application/json"
                },

                success: function (oResponse) {
                    console.log("=== STAGE 4: TriggerProcess Response Received ===", oResponse);

                    var sStatus = oResponse?.d?.TriggerProcess?.Status;
                    console.log("=== STAGE 5: Parsed Status from Response ===", sStatus);

                    if (sStatus === "SUCCESS" && fnSuccess) {
                        console.log("=== STAGE 6: CONFIDENCE SUCCESS - Executing Success Callback ===");
                        fnSuccess();
                    } else {
                        console.warn("=== STAGE 6: TriggerProcess returned non-success status or missing callback ===", sStatus);
                    }
                },

                error: function (oError) {
                    console.error("=== ERROR: TriggerProcess Failed ===", oError);
                }
            });
        },

        error: function (oError) {
            console.error("=== ERROR: Token Fetch Failed ===", oError);
        }
    });
}

// Refresh after Reject / LinkDocs
this._oRefreshInterval = setInterval(function () {

    if (
        sessionStorage.getItem("RefreshAfterAction") === "X"
    ) {

        sessionStorage.removeItem(
            "RefreshAfterAction"
        );

        console.log(
            "AUTO REFRESH TRIGGERED"
        );

        triggerConfidenceProcess(function () {

            var oGoButton = sap.ui.getCore().byId(
                "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ListReport.view.ListReport::ZC_QTO_SO_QT--listReportFilter-btnGo"
            );

            if (oGoButton) {

                console.log(
                    "AUTO GO BUTTON PRESS"
                );

                oGoButton.firePress();

            }

        });

    }

}, 1000);

// Wait until FE page is fully rendered before injecting custom controls


setTimeout(function () {


// Find page title and show match count beside title actions
var aTitles = oView.findAggregatedObjects(
    true,
    function (oControl) {
        return oControl.isA("sap.f.DynamicPageTitle");
    }
);


console.log(
    "Dynamic Pvar oCustomFilterage Titles found:",
    aTitles.length
);


if (aTitles.length > 0) {


    var oTitle = aTitles[0];


    oTitle.addAction(oMatchCountText);


    console.log(
        "Match count added to DynamicPageTitle"
    );
}


                // 3. CREATE KPI VALUE CONTROLS
                var oTotalMatches = new ObjectNumber({
                    number: "0"
                }).addStyleClass("kpiCardValue");


                var oNew = new ObjectNumber({
                    number: "0"
                }).addStyleClass("kpiCardValue");


                var oReviewed = new ObjectNumber({
                    number: "0"
                }).addStyleClass("kpiCardValue");


                // 4. CREATE KPI CARDS
                var oKpiRow = new HBox({
                    width: "100%",
                    justifyContent: "SpaceBetween",


                   items: [


    //1st page kpi colour
   new VBox({
    width: "23%",
    items: [
        new Text({
            text: "TOTAL MATCHES"
        }).addStyleClass("kpiCardTitle"),
        oTotalMatches
    ]
}).addStyleClass("kpiCard kpiTotalCard"),


//1st page kpi colour
    new VBox({
    width: "23%",
    items: [
        new Text({
            text: "NEW"
        }).addStyleClass("kpiCardTitle"),
        oNew
    ]
}).addStyleClass("kpiCard kpiNewCard"),


//1st page kpi colour
    new VBox({
    width: "23%",
    items: [
        new Text({
            text: "REVIEWED"
        }).addStyleClass("kpiCardTitle"),
        oReviewed
    ]
}).addStyleClass("kpiCard kpiReviewedCard"),
]
}).addStyleClass("kpiCardsRow");


                oHeader.insertContent(oKpiRow, 0);


                console.log(
                    "KPI CARDS INSERTED SUCCESSFULLY"
                );


                // 6. GET ODATA MODEL
                var oModel = oView.getModel();


                console.log(
                    "OData Model:",
                    oModel
                );
// 7. FUNCTION TO UPDATE KPI VALUES
                function updateKpis(aFilters, sStatus) {


                    console.log(
                        "========= REFRESHING KPI DATA ========="
                    );


                    console.log(
                        "KPI Filters:",
                        aFilters
                    );


                    var mReadOptions = {


success: function (oData) {


    console.log(
        "========= KPI BACKEND DATA ========="
    );


    var aResults = oData.results;


    
    if (sStatus) {
        
        aResults = aResults.filter(function (oRecord) {
            
            return oRecord.status === sStatus;
            
        });
        
    }
    
    console.log("Records After Status Filter:", aResults.length);


    // TOTAL MATCHES
    var iTotal = aResults.length;


// Overall total is captured when no filter is applied
if (!aFilters || aFilters.length === 0) {
    iOverallTotal = iTotal;
}


oMatchCountText.setText(
    iTotal + " of " + iOverallTotal + " matches"
);


                            // NEW
                            var iNew = aResults.filter(function (oRecord) {
                                return oRecord.status === "New";
                            }).length;


                            // REVIEWED
                            var iReviewed = aResults.filter(function (oRecord) {
                                return oRecord.status === "Reviewed";
                            }).length;


                            // UPDATE KPI CARDS
                            oTotalMatches.setNumber(
                                String(iTotal)
                            );


                            oNew.setNumber(
                                String(iNew)
                            );


                            oReviewed.setNumber(
                                String(iReviewed)
                            );


                            // CONSOLE OUTPUT
                            console.log(
                                "Total Matches:",
                                iTotal
                            );


                            console.log(
                                "New:",
                                iNew
                            );


                            console.log(
                                "Reviewed:",
                                iReviewed
                            );


                          console.log(
    "======================================"
);


if (aResults && aResults.length > 0) {


    console.log(
        Object.keys(aResults[0])
    );


   console.log(
    "FieldB:",
    aResults[0].FieldB
);


    console.log(
        "Status:",
        aResults[0].status
    );


} else {


    console.log(
        "No records returned after Status filter"
    );


}
                        },


                        error: function (oError) {


                            console.error(
                                "========== BACKEND READ ERROR =========="
                            );


                            console.error(oError);


                            console.error(
                                "========================================="
                            );


                        }


                    };


                    // APPLY FILTERS ONLY WHEN THEY EXIST
                    if (aFilters && aFilters.length > 0) {


                        mReadOptions.filters = aFilters;


                        console.log(
                            "Applying filters to KPI OData request."
                        );


                    } else {


                        console.log(
                            "No filters selected. Reading all records."
                        );


                    }


// READ ODATA
oModel.read(
    "/ZC_QTO_SO_QT",
    mReadOptions
);
                }


                // GET SMART TABLE
var oSmartTable = sap.ui.getCore().byId(
    "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ListReport.view.ListReport::ZC_QTO_SO_QT--listReport"
);

//change#2
// Store filters currently applied by Fiori Elements
var aCurrentFilters = [];


if (oSmartTable) {

    //change#2
   oSmartTable.attachBeforeRebindTable(function (oEvent) {

    var mBindingParams =
        oEvent.getParameter("bindingParams");

    aCurrentFilters = mBindingParams.filters || [];

    console.log(
        "Injected Filters:",
        mBindingParams.filters
    );

        // Status chip refresh
        var oInnerTable = oSmartTable.getTable();


        if (oInnerTable) {


            oInnerTable.attachUpdateFinished(
    function () {

            applyStatusColors();

    }
);
        }
    });
}


setTimeout(function () {


    var oTableDom = document.querySelector(
        ".sapMListTbl"
    );


    if (oTableDom) {


        oObserver.observe(
            oTableDom,
            {
                childList: true,
                subtree: true
            }
        );


        applyStatusColors();
    }


}, 2000);


/* ADD HERE START */


// Status chip colors
function applyStatusColors() {


    document.querySelectorAll(
        'td[data-sap-ui-column*="status"] .sapMText'
    ).forEach(function (oStatus) {


        var sText = oStatus.textContent.trim();


oStatus.classList.remove(
    "statusNew",
    "statusReviewed",
    "statusRejected"
);

if (sText === "New") {
    oStatus.classList.add("statusNew");
} else if (sText === "Reviewed") {
    oStatus.classList.add("statusReviewed");
} else if (sText === "Rejected") {
    oStatus.classList.add("statusRejected");
}


    });
}


// Reapply status colors when table rerenders
var oObserver = new MutationObserver(function () {


    applyStatusColors();


});



                // 9. LISTEN FOR GO BUTTON (FIXED: Triggers confidence before KPI refresh)
                oSmartFilterBar.attachSearch(function () {
                    console.log("======== GO BUTTON CLICKED ========");

                    //change#2
                   var aFilters = aCurrentFilters || [];
                    var oFilterData = oSmartFilterBar.getFilterData();
                    var sStatus = oFilterData.status || "";

                    console.log("FE Status:", sStatus);

                    triggerConfidenceProcess(function () {
                        updateKpis(aFilters, sStatus);
                    });
                });


                // Initial confidence refresh
                triggerConfidenceProcess(function () {
                    var oGoButton = sap.ui.getCore().byId(
                        "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ListReport.view.ListReport::ZC_QTO_SO_QT--listReportFilter-btnGo"
                    );

                    if (oGoButton) {
                        oGoButton.firePress();
                    }
                });


            }, 1000);
        },

        // Leaving the app: restore the normal size for the rest of the Launchpad
        onExit: function () {
            if (this._oRefreshInterval) {
                clearInterval(this._oRefreshInterval);
                this._oRefreshInterval = null;
            }
            document.documentElement.classList.remove("orderLinkScale");
        }
    };
});