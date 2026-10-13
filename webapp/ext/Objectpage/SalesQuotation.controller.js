sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "com/bmi/orderquotematch/project1/model/formatter",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/FlexItemData",
    "sap/m/OverflowToolbarLayoutData",
    "sap/ui/core/BusyIndicator"
], function (
    JSONModel,
    formatter,
    Filter,
    FilterOperator,
    Fragment,
    MessageBox,
    MessageToast,
    FlexItemData,
    OverflowToolbarLayoutData,
    BusyIndicator
) {
    "use strict";


    return {


        formatter: formatter,


        /* ========================================================= */
        /* INIT                                                      */
        /* ========================================================= */
        onInit: function () {
            var oView = this.getView();

            var that = this;


            console.log("SalesQuotation Controller Loaded");


            oView.attachModelContextChange(function () {
                this._refreshMatchModel();
            }.bind(this));


            this._onDocClick = function (oEvent) {
                if (
                    oEvent.target &&
                    oEvent.target.innerText === "Return to List"
                ) {
                    sessionStorage.setItem(
                        "RefreshAfterAction",
                        "X"
                    );

                    setTimeout(function () {
                        that._navigateToList();
                    }, 1200);
                }
            };
            document.addEventListener("click", this._onDocClick);


            this._rejectTriggered = false;
            this._linkTriggered = false;


            var oModel = this.getOwnerComponent().getModel();


           if (oModel) {
                oModel.attachRequestCompleted(function (oEvent) {
                    console.log("REQUEST COMPLETED");

                    if (!oEvent.getParameter("success")) {
                        return;
                    }

                    if (that._rejectTriggered) {
                        that._rejectTriggered = false;

                        sessionStorage.setItem(
                            "RefreshAfterAction",
                            "X"
                        );

                        setTimeout(function () {
                            that._navigateToList();
                        }, 2000);

                        return;
                    }
                });

                oModel.attachRequestFailed(function () {
                    console.log("REQUEST FAILED");
                    BusyIndicator.hide();
                });
            }


            this._onBrowserBack = function () {
                console.log("POPSTATE FIRED");
                that._executeReturnToList();
            };


            if (this._backHandlerAttached) {
                return;
            }


            this._backHandlerAttached = true;

            this._onResizePin = function () {
                that._pinHeaderActions(true);
            };
            window.addEventListener("resize", this._onResizePin);


            setTimeout(function () {
                var fnHideVaActions = function () {
                    var iHidden = 0;

                    sap.ui.core.Element.registry.forEach(function (oControl) {
                        var sId = oControl && oControl.getId();

                        if (sId &&
                            (sId.indexOf("::VA03") !== -1 || sId.indexOf("::VA23") !== -1) &&
                            oControl.isA("sap.m.Button")) {
                            oControl.setVisible(false);
                            iHidden++;
                        }
                    });

                    return iHidden > 0;
                };


                var iHideAttempts = 0;
                var oHideInterval = setInterval(function () {
                    iHideAttempts++;

                    if (fnHideVaActions() || iHideAttempts >= 30) {
                        clearInterval(oHideInterval);
                    }
                }, 300);


                var fnFindAndAttachLinkDocs = function () {
                    var oLinkDocs = null;

                    sap.ui.core.Element.registry.forEach(function (oControl) {
                        if (oLinkDocs || !oControl) {
                            return;
                        }

                        var sId = oControl.getId();

                        if (sId && sId.indexOf("::Linkdocs") !== -1) {
                            oLinkDocs = oControl;
                        }
                    });

                    if (!oLinkDocs) {
                        return false;
                    }

                    that._pinHeaderActions(true);

                    if (oLinkDocs.setIcon) {
                        oLinkDocs.setIcon("sap-icon://chain-link");
                    }

                    if (oLinkDocs.rerender) {
                        oLinkDocs.rerender();
                    }

                    if (oLinkDocs.data("linkDocsHandlerAttached")) {
                        return true;
                    }

                    if (oLinkDocs.attachPress) {
                        if (oLinkDocs.mEventRegistry && oLinkDocs.mEventRegistry.press) {
                            window._originalLinkDocsPress = oLinkDocs.mEventRegistry.press.slice();
                            oLinkDocs.mEventRegistry.press = [];
                        }

                        oLinkDocs.attachPress(function () {
                            that._linkTriggered = true;
                            that.onLinkDocsPress();
                        });
                    } else {
                        return false;
                    }

                    oLinkDocs.data("linkDocsHandlerAttached", true);
                    return true;
                };


                var iAttempts = 0;
                var oLinkDocsInterval = setInterval(function () {
                    iAttempts++;

                    if (fnFindAndAttachLinkDocs()) {
                        clearInterval(oLinkDocsInterval);
                    }

                    if (iAttempts >= 30) {
                        clearInterval(oLinkDocsInterval);
                        console.error("Link Docs action could not be found after 30 attempts.");
                    }
                }, 300);


                var iPinTicks = 0;
                var oPinInterval = setInterval(function () {
                    iPinTicks++;
                    that._pinHeaderActions(iPinTicks === 2 || iPinTicks % 5 === 0);

                    if (iPinTicks >= 40) {
                        clearInterval(oPinInterval);
                    }
                }, 500);

                var oReject = sap.ui.getCore().byId(
                    "com.bmi.orderquotematch.project1::sap.suite.ui.generic.template.ObjectPage.view.Details::ZC_QTO_SO_QT--action::cds_zsd_qto_so_qt.cds_zsd_qto_so_qt_Entities::Reject_link"
                );

                if (oReject) {
                    oReject.setIcon("sap-icon://sys-cancel");
                    oReject.rerender();

                    oReject.attachPress(function () {
                        that._rejectTriggered = true;
                    });
                }

            }, 200);
        },


        _pinHeaderActions: function (bForceReset) {
            var that = this;
            var aToolbars = [];

            sap.ui.core.Element.registry.forEach(function (oCtl) {
                if (oCtl && oCtl.isA && oCtl.isA("sap.m.OverflowToolbar") &&
                    oCtl.getContent().some(function (oItem) {
                        var sId = oItem.getId();
                        return sId.indexOf("::Linkdocs") !== -1 ||
                               sId.indexOf("::Reject_link") !== -1;
                    })) {
                    aToolbars.push(oCtl);
                }
            });

            aToolbars.forEach(function (oToolbar) {
                var bChanged = that._applyPins(oToolbar);

                if (!oToolbar.data("headerPinDelegate")) {
                    oToolbar.data("headerPinDelegate", true);
                    oToolbar.addEventDelegate({
                        onBeforeRendering: function () {
                            that._applyPins(oToolbar);
                        }
                    });
                    console.log("Header actions pinned on:", oToolbar.getId());
                    bChanged = true;
                }

                if ((bChanged || bForceReset) && oToolbar._resetAndInvalidateToolbar) {
                    oToolbar._resetAndInvalidateToolbar();
                }
            });
        },


        _applyPins: function (oToolbar) {
            var bChanged = false;

            oToolbar.getContent().forEach(function (oItem) {
                var sId = oItem.getId();

                if (sId.indexOf("::Linkdocs") === -1 &&
                    sId.indexOf("::Reject_link") === -1 &&
                    sId.indexOf("::Return_to_list") === -1) {
                    return;
                }

                if (oItem.getText && oItem.getText() && !oItem.getTooltip()) {
                    oItem.setTooltip(oItem.getText());
                }

                var oLayout = oItem.getLayoutData();

                if (oLayout && oLayout.isA("sap.m.OverflowToolbarLayoutData")) {
                    if (oLayout.getPriority() !== "NeverOverflow") {
                        oLayout.setPriority("NeverOverflow");
                        bChanged = true;
                    }

                    if (oLayout.getMoveToOverflow && oLayout.getMoveToOverflow()) {
                        oLayout.setMoveToOverflow(false);
                        bChanged = true;
                    }

                    if (oLayout.getStayInOverflow && oLayout.getStayInOverflow()) {
                        oLayout.setStayInOverflow(false);
                        bChanged = true;
                    }
                } else {
                    oItem.setLayoutData(new OverflowToolbarLayoutData({
                        priority: "NeverOverflow"
                    }));
                    bChanged = true;
                }
            });

            return bChanged;
        },


        _openVA03: function () {
            var oContext = this.getView().getBindingContext();

            if (!oContext) {
                console.error("VA03: Binding context not available.");
                return;
            }

            var oData = oContext.getObject();
            var oS4 = this._getS4Config();

            if (!oData.salesDoc) {
                console.error("VA03: salesDoc is empty.");
                return;
            }

            var sUrl = oS4.host +
                "/sap/bc/ui2/flp?sap-client=" + oS4.client +
                "&sap-language=" + oS4.language +
                "#SalesOrder-display?SalesOrder=" + encodeURIComponent(oData.salesDoc);

            window.open(sUrl, "_blank");
        },


        _openVA43: function () {
            var oContext = this.getView().getBindingContext();

            if (!oContext) {
                console.error("VA43: Binding context not available.");
                return;
            }

            var oData = oContext.getObject();
            var oS4 = this._getS4Config();

            if (!oData.qt_salesDoc) {
                console.error("VA43: qt_salesDoc is empty.");
                return;
            }

            var sUrl = oS4.host +
                "/sap/bc/ui2/flp?sap-client=" + oS4.client +
                "&sap-language=" + oS4.language +
                "#SalesQuotation-display?SalesQuotation=" + encodeURIComponent(oData.qt_salesDoc);

            window.open(sUrl, "_blank");
        },


        onSalesOrderLinkPress: function () {
            this._openVA03();
        },


        onQuotationLinkPress: function () {
            this._openVA43();
        },


        _refreshMatchModel: function () {
            var oContext = this.getView().getBindingContext();

            if (!oContext) {
                return;
            }

            var oData = oContext.getObject();

            if (!oData || (!oData.salesDoc && !oData.qt_salesDoc)) {
                return;
            }

            this._processData(oData);
        },


        _processData: function (oData) {
            var oView = this.getView();

            var oMatchModel = new JSONModel({
                soldToState: formatter.getMatchState(
                    oData.customerIdName,
                    oData.qt_CustomerIdName
                ),
                shipToState: formatter.getMatchState(
                    oData.so_shipToIdName,
                    oData.qt_shipToIdName
                ),
                paymentTermState: formatter.getMatchState(
                    oData.so_paymentTermDescp,
                    oData.qt_paymentTermDescp
                ),
                incoTermState: formatter.getMatchState(
                    oData.so_incoTermDescp,
                    oData.qt_incoTermDescp
                ),
                salesResponsibleState: formatter.getMatchState(
                    oData.so_salesResponsibleIdName,
                    oData.qt_salesResponsibleIdName
                ),
                currencyState: formatter.getMatchState(
                    oData.so_currency,
                    oData.qt_currency
                ),
                totalValueState: formatter.getMatchState(
                    oData.so_total_value,
                    oData.qt_total_value,
                    true
                ),
                valueWithoutTaxState: formatter.getMatchState(
                    oData.so_netValue,
                    oData.qt_netValue,
                    true
                ),
                taxValueState: formatter.getMatchState(
                    oData.so_tax_value,
                    oData.qt_tax_value,
                    true
                )
            });

            if (!oView.getModel("match")) {
                oView.setModel(oMatchModel, "match");
            } else {
                oView.getModel("match").setData(oMatchModel.getData());
            }
        },


        onLinkDocsPress: function () {
            this._openConfirmLinkDialog([
                "paymentTerms",
                "pricingPartner",
                "salesResponsible",
                "objectPartner",
                "refCustomer"
            ]);
        },


        _ensureDialogStyles: function () {
            var oOld = document.getElementById("clDialogStyles");

            if (oOld && oOld.parentNode) {
                oOld.parentNode.removeChild(oOld);
            }

            var sCss = [
                ".linkDocsSelectionDialog .sapMDialogScrollCont{background:#fff;}",
                ".confirmLinkContent{padding:4px 18px 16px 18px !important;}",
                ".confirmSectionTitle,.confirmSectionTitle .sapMTitle{text-transform:uppercase !important;font-weight:700 !important;font-size:0.8125rem !important;letter-spacing:0.6px;color:#1d5fd1 !important;}",
                ".confirmSectionTitle{padding-bottom:6px;margin-bottom:4px !important;border-bottom:2px solid #1d5fd1;}",
                ".clSelectAllRow{width:100%;margin-bottom:4px;padding:2px 4px;}",
                ".clRow{width:100% !important;box-sizing:border-box;min-height:52px;padding:6px 4px;border-bottom:1px solid #eeeeee;}",
                ".clFieldLabel{font-weight:700 !important;color:#334155 !important;}",
                ".clOldValue{color:#d92d20 !important;text-decoration:line-through !important;}",
                ".clNewValue{color:#166534 !important;font-weight:700 !important;}",
                ".clValueNeutral{color:#5b6b82 !important;font-weight:600 !important;}",
                ".clArrow{color:#7c9bc4 !important;margin:0 12px !important;}",
                ".clTag{margin-left:14px !important;}",
                ".clCheckBox{margin-left:16px !important;}",
                ".clLineNo{color:#7890ad !important;font-weight:600 !important;}",
                ".clLineMaterial{color:#536b8c !important;font-weight:600 !important;}",
                ".clLineField{font-weight:700 !important;color:#1f2937 !important;}",
                ".clSummaryBox{background:#f5f8fd;border:1px solid #d6e4ff;border-radius:8px;padding:10px 16px;margin-top:12px;width:100%;box-sizing:border-box;}",
                ".clSummaryTitle{font-weight:700 !important;color:#1f2937 !important;margin-bottom:4px;}",
                ".clSummaryLine{color:#334155 !important;}",
                ".clSummaryTotal{font-weight:700 !important;color:#1d5fd1 !important;}",
                ".clMatchCard{width:100%;box-sizing:border-box;margin:8px 0 4px 0;padding:14px 18px;background:#eef8ef;border:1px solid #cfe8d2;border-left:4px solid #2e7d32;border-radius:8px;}",
                ".clMatchIcon{flex:none;display:inline-flex !important;align-items:center;justify-content:center;width:2.25rem !important;height:2.25rem !important;margin-right:14px;border-radius:50%;background:#2e7d32;color:#ffffff !important;font-size:1.125rem !important;}",
                ".clMatchTitle{display:block;font-weight:700 !important;font-size:0.9375rem !important;color:#166534 !important;}",
                ".clMatchSub{display:block;font-size:0.8125rem !important;color:#4b5563 !important;margin-top:2px;}",
                ".clLineRow .clLineNo,.clLineRow .clLineMaterial,.clLineRow .clLineField,.clLineRow .clOldValue,.clLineRow .clNewValue,.clLineRow .clValueNeutral{white-space:nowrap !important;word-break:normal !important;overflow-wrap:normal !important;}",
                ".clLineRow .clArrow{margin:0 8px !important;}",
                ".clLineRow .clTag{margin-left:12px !important;white-space:nowrap !important;}"
            ].join("\n");

            var oStyle = document.createElement("style");
            oStyle.id = "clDialogStyles";
            oStyle.appendChild(document.createTextNode(sCss));
            document.head.appendChild(oStyle);
        },


        _openConfirmLinkDialog: function (aSelectedFields) {
            var that = this;

            this._ensureDialogStyles();

            if (this._oConfirmLinkDialog) {
                this._oConfirmLinkDialog.destroy();
                this._oConfirmLinkDialog = null;
            }

            this._mLinkDocCheckboxes = {};
            this._aLineRows = [];
            this._iHeaderRows = 0;
            this._iLineRows = 0;
            this._iLineChanged = 0;
            this._bLinesLoading = true;

            Fragment.load({
                id: this.getView().getId(),
                name: "com.bmi.orderquotematch.project1.ext.Objectpage.ConfirmLinkDialog",
                controller: this
            }).then(function (oDialog) {
                that._oConfirmLinkDialog = oDialog;
                that.getView().addDependent(oDialog);

                that._fillConfirmHeaderFields(oDialog, aSelectedFields);
                that._refreshSelectAllRow();

                that._toggleSection("lineItemsTitle", "lineItemsContainer", false);
                that._updateSelectionState();

                oDialog.open();

                that._readLineItems().then(function (aItems) {
                    if (that._oConfirmLinkDialog !== oDialog) {
                        return;
                    }

                    that._fillConfirmLineItems(aItems);
                    that._bLinesLoading = false;
                    that._updateNoChangesText();
                    that._updateSelectionState();
                });
            });
        },


        _byFragId: function (sId) {
            return sap.ui.core.Fragment.byId(this.getView().getId(), sId);
        },


        _createArrow: function () {
            var oArrow = new sap.ui.core.Icon({ src: "sap-icon://arrow-right" });
            oArrow.addStyleClass("clArrow");
            return oArrow;
        },


        _createFieldCheckBox: function (fnRegister) {
            var oCheckBox = new sap.m.CheckBox({
                selected: true,
                select: this._onFieldCheckBoxSelect.bind(this)
            });

            oCheckBox.addStyleClass("clCheckBox");
            fnRegister(oCheckBox);
            return oCheckBox;
        },


        _createLockedCheckBox: function () {
            var oCheckBox = new sap.m.CheckBox({
                selected: true,
                enabled: false
            });

            oCheckBox.addStyleClass("clCheckBox clCheckBoxLocked");
            return oCheckBox;
        },


        _pick: function (oObj, aKeys) {
            if (!oObj) {
                return undefined;
            }

            var mLower = {};

            Object.keys(oObj).forEach(function (sKey) {
                mLower[sKey.toLowerCase()] = sKey;
            });

            for (var i = 0; i < aKeys.length; i++) {
                var sReal = mLower[String(aKeys[i]).toLowerCase()];

                if (sReal === undefined) {
                    continue;
                }

                var vValue = oObj[sReal];

                if (vValue !== undefined && vValue !== null && String(vValue).trim() !== "") {
                    return vValue;
                }
            }

            return undefined;
        },


        _fillConfirmHeaderFields: function (oDialog, aSelectedFields) {
            var oContext = this.getView().getBindingContext();

            if (!oContext) {
                return;
            }

            var oData = oContext.getObject();
            var oContainer = this._byFragId("headerFieldsContainer");

            if (!oContainer) {
                return;
            }

            oContainer.removeAllItems();

            var that = this;

            var oFields = {
                paymentTerms: {
                    label: "Payment Terms",
                    tooltip: "Sales Order Payment Terms \u2192 Quotation Payment Terms",
                    oldValue: that._pick(oData, ["so_paymentTerm"]),
                    newValue: that._pick(oData, ["qt_paymentTerm"])
                },
                pricingPartner: {
                    label: "Pricing Partner (YP)",
                    tooltip: "Pricing Partner (YP) \u2192 Quotation Pricing Partner (YP)",
                    oldValue: that._pick(oData, ["pricingPartner"]),
                    newValue: that._pick(oData, ["qt_pricingPartner"])
                },
                salesResponsible: {
                    label: "Sales Representative (Z1)",
                    tooltip: "Order Sales Responsible \u2192 Quotation Sales Responsible",
                    oldValue: that._pick(oData, ["so_salesResponsibleIdName"]),
                    newValue: that._pick(oData, ["qt_salesResponsibleIdName"])
                },
                objectPartner: {
                    label: "Object Partner (ZO)",
                    tooltip: "Object Partner (ZO) \u2192 Quotation Object Partner (ZO)",
                    oldValue: that._pick(oData, ["objectPartner"]),
                    newValue: that._pick(oData, ["qt_objectPartner"])
                },
                refCustomer: {
                    label: "Ref Customer (ZC)",
                    tooltip: "Sales Order Ref Customer (ZC) \u2192 Quotation Ref Customer (ZC)",
                    oldValue: that._pick(oData, ["so_ref_customerIdName"]),
                    newValue: that._pick(oData, ["qt_ref_customerIdName"])
                }
            };

            var iRows = 0;

            aSelectedFields.forEach(function (sKey) {
                var oField = oFields[sKey];

                if (!oField) {
                    return;
                }

                if (!that._isDifferent(oField.oldValue, oField.newValue)) {
                    return;
                }

                iRows++;

                var oLabel = new sap.m.Text({
                    text: oField.label,
                    tooltip: oField.tooltip
                });
                oLabel.addStyleClass("clFieldLabel");

                var oLabelBox = new sap.m.HBox({
                    alignItems: "Center",
                    items: [oLabel],
                    layoutData: new FlexItemData({ baseSize: "260px", growFactor: 0, shrinkFactor: 0 })
                });
                oLabelBox.addStyleClass("clLabelBox");

                var oOldValue = new sap.m.Text({ text: that._displayValue(oField.oldValue) });
                oOldValue.addStyleClass("clOldValue");

                var oNewValue = new sap.m.Text({ text: that._displayValue(oField.newValue) });
                oNewValue.addStyleClass("clNewValue");

                var oValueBox = new sap.m.HBox({
                    alignItems: "Center",
                    items: [oOldValue, that._createArrow(), oNewValue],
                    layoutData: new FlexItemData({ growFactor: 1, shrinkFactor: 1 })
                });
                oValueBox.addStyleClass("clValueBox");

                var oCheckBox = that._createFieldCheckBox(function (oCb) {
                    that._mLinkDocCheckboxes[sKey] = oCb;
                });

                var oRow = new sap.m.HBox({
                    alignItems: "Center",
                    width: "100%",
                    items: [oLabelBox, oValueBox, oCheckBox]
                });
                oRow.addStyleClass("clRow clHeaderRow");

                oContainer.addItem(oRow);
            });

            if (iRows === 0) {
                var oMatchIcon = new sap.ui.core.Icon({ src: "sap-icon://accept" });
                oMatchIcon.addStyleClass("clMatchIcon");

                var oMatchTitle = new sap.m.Text({ text: "All header fields match" });
                oMatchTitle.addStyleClass("clMatchTitle");

                var oMatchSub = new sap.m.Text({ text: "No header changes are needed." });
                oMatchSub.addStyleClass("clMatchSub");

                var oMatchCard = new sap.m.HBox({
                    alignItems: "Center",
                    width: "100%",
                    items: [
                        oMatchIcon,
                        new sap.m.VBox({ items: [oMatchTitle, oMatchSub] })
                    ]
                });
                oMatchCard.addStyleClass("clMatchCard");

                oContainer.addItem(oMatchCard);
            }

            this._iHeaderRows = iRows;
            this._toggleSection("headerFieldsTitle", "headerFieldsContainer", true);
        },


        _readLineItems: function () {
            var oView = this.getView();
            var oContext = oView.getBindingContext();
            var oModel = oView.getModel();

            if (!oContext) {
                return Promise.resolve([]);
            }

            var oHeaderData = oContext.getObject();

            var aFallback = (oHeaderData && (oHeaderData.item || oHeaderData.material))
                ? [oHeaderData]
                : [];

            return new Promise(function (resolve) {
                oModel.read(oContext.getPath() + "/to_ZI_QTO_SO_QT_1", {
                    success: function (oResponse) {
                        var aResults = (oResponse && oResponse.results) || [];
                        resolve(aResults.length > 0 ? aResults : aFallback);
                    },
                    error: function (oError) {
                        console.error("Line items read failed", oError);
                        resolve(aFallback);
                    }
                });
            });
        },


        _fillConfirmLineItems: function (aItems) {
            var oContainer = this._byFragId("lineItemsContainer");

            if (!oContainer) {
                return;
            }

            oContainer.removeAllItems();

            var that = this;

            this._aLineRows = [];
            this._iLineChanged = 0;

            var aRows = (aItems || []).filter(function (oRow) {
                return that._pick(oRow, ["item"]) !== undefined ||
                    that._pick(oRow, ["material"]) !== undefined;
            });

            aRows.sort(function (a, b) {
                return Number(that._pick(a, ["item"])) - Number(that._pick(b, ["item"]));
            });

            aRows.forEach(function (oRow) {
                var sItem = that._pick(oRow, ["item"]);
                var sMaterial = that._pick(oRow, ["material"]);
                var vSoPrice = that._pick(oRow, ["so_unit_Price"]);
                var vQtPrice = that._pick(oRow, ["qt_unit_Price"]);

                var bDifferent = that._isDifferent(vSoPrice, vQtPrice);

                if (bDifferent) {
                    that._iLineChanged++;
                }

                that._aLineRows.push(oRow);

                var oNo = new sap.m.Text({
                    text: sItem !== undefined
                        ? "#" + (String(sItem).replace(/^0+/, "") || String(sItem))
                        : "-",
                    layoutData: new FlexItemData({ baseSize: "60px", growFactor: 0, shrinkFactor: 0 })
                });
                oNo.addStyleClass("clLineNo");

                var oMaterial = new sap.m.Text({
                    text: that._displayValue(sMaterial),
                    layoutData: new FlexItemData({ baseSize: "120px", growFactor: 0, shrinkFactor: 1 })
                });
                oMaterial.addStyleClass("clLineMaterial");

                var oField = new sap.m.Text({
                    text: "Unit Price",
                    layoutData: new FlexItemData({ baseSize: "110px", growFactor: 0, shrinkFactor: 1 })
                });
                oField.addStyleClass("clLineField");

                var oOldValue = new sap.m.Text({
                    text: that._displayValue(formatter.formatPriceCur(vSoPrice, ""))
                });
                oOldValue.addStyleClass(bDifferent ? "clOldValue" : "clValueNeutral");

                var oNewValue = new sap.m.Text({
                    text: that._displayValue(formatter.formatPriceCur(vQtPrice, ""))
                });
                oNewValue.addStyleClass(bDifferent ? "clNewValue" : "clValueNeutral");

                var oTag = new sap.m.ObjectStatus({
                    text: bDifferent ? "Updated" : "No Change",
                    state: bDifferent ? "Success" : "None",
                    inverted: true
                });
                oTag.addStyleClass("clTag");

                var oValueBox = new sap.m.HBox({
                    alignItems: "Center",
                    items: [oOldValue, that._createArrow(), oNewValue, oTag],
                    layoutData: new FlexItemData({ growFactor: 1, shrinkFactor: 0 })
                });
                oValueBox.addStyleClass("clValueBox");

                var oRowBox = new sap.m.HBox({
                    alignItems: "Center",
                    width: "100%",
                    items: [oNo, oMaterial, oField, oValueBox, that._createLockedCheckBox()]
                });
                oRowBox.addStyleClass("clRow clLineRow");

                oContainer.addItem(oRowBox);
            });

            this._iLineRows = this._aLineRows.length;
            this._toggleSection("lineItemsTitle", "lineItemsContainer", this._iLineRows > 0);
        },


        _updateNoChangesText: function () {
            var oNoChanges = this._byFragId("noChangesText");

            if (oNoChanges) {
                oNoChanges.setVisible(!this._iHeaderRows && !this._iLineRows);
            }
        },


        _getAllFieldCheckBoxes: function () {
            var mCb = this._mLinkDocCheckboxes || {};

            return Object.keys(mCb).map(function (sKey) {
                return mCb[sKey];
            });
        },


        _refreshSelectAllRow: function () {
            var oRow = this._byFragId("selectAllRow");
            var oSelectAll = this._byFragId("selectAllCheckBox");
            var aAll = this._getAllFieldCheckBoxes();

            if (oRow) {
                oRow.setVisible(aAll.length > 0);
            }

            if (oSelectAll) {
                oSelectAll.setSelected(aAll.length > 0 && aAll.every(function (oCb) {
                    return oCb.getSelected();
                }));
            }
        },


        onSelectAllChange: function (oEvent) {
            var bSelected = oEvent.getParameter("selected");

            this._getAllFieldCheckBoxes().forEach(function (oCb) {
                oCb.setSelected(bSelected);
            });

            this._updateSelectionState();
        },


        _onFieldCheckBoxSelect: function () {
            var oSelectAll = this._byFragId("selectAllCheckBox");
            var aAll = this._getAllFieldCheckBoxes();

            if (oSelectAll) {
                oSelectAll.setSelected(aAll.length > 0 && aAll.every(function (oCb) {
                    return oCb.getSelected();
                }));
            }

            this._updateSelectionState();
        },


        _getSelectedHeaderCount: function () {
            return this._getAllFieldCheckBoxes().filter(function (oCb) {
                return oCb.getSelected();
            }).length;
        },


        _updateSelectionState: function () {
            var iHeader = this._getSelectedHeaderCount();
            var iLine = this._iLineChanged || 0;
            var iTotal = iHeader + iLine;

            var bNothingToChange = !this._iHeaderRows && !iLine;

            var oButton = this._byFragId("linkDocumentsButton");
            var oSummary = this._byFragId("summaryBox");

            var oHeaderText = this._byFragId("summaryHeaderText");
            var oLineText = this._byFragId("summaryLineText");
            var oTotalText = this._byFragId("summaryTotalText");

            if (oHeaderText) {
                oHeaderText.setText("\u2022 Header Fields: " + iHeader);
            }

            if (oLineText) {
                oLineText.setText("\u2022 Line Item Fields: " + iLine);
            }

            if (oTotalText) {
                oTotalText.setText("\u2022 Total Selected: " + iTotal);
            }

            if (oSummary) {
                oSummary.setVisible(!bNothingToChange && !this._bLinesLoading);
            }

            if (!oButton) {
                return;
            }

            if (this._bLinesLoading) {
                oButton.setText("Link Documents");
                oButton.setEnabled(false);
                return;
            }

            if (bNothingToChange) {
                oButton.setText("Link Documents");
                oButton.setEnabled(true);
                return;
            }

            // oButton.setText("Link Documents (" + iTotal + ")");
            // oButton.setEnabled(iTotal > 0);

             //change#3
            oButton.setText("Link Documents (" + iTotal + ")");
            oButton.setEnabled(true);
        },


        _isEmpty: function (vValue) {
            return vValue === undefined || vValue === null || String(vValue).trim() === "";
        },


        _isDifferent: function (vOld, vNew) {
            if (this._isEmpty(vOld) && this._isEmpty(vNew)) {
                return false;
            }

            if (!this._isEmpty(vOld) && !this._isEmpty(vNew)) {
                var nOld = Number(String(vOld).replace(/,/g, ""));
                var nNew = Number(String(vNew).replace(/,/g, ""));

                if (!isNaN(nOld) && !isNaN(nNew)) {
                    return nOld !== nNew;
                }
            }

            return String(vOld).trim().toLowerCase() !== String(vNew).trim().toLowerCase();
        },


        _toggleSection: function (sTitleId, sContainerId, bVisible) {
            var oTitle = this._byFragId(sTitleId);
            var oContainer = this._byFragId(sContainerId);

            if (oTitle) {
                oTitle.setVisible(bVisible);
            }

            if (oContainer) {
                oContainer.setVisible(bVisible);
            }
        },


        _displayValue: function (vValue) {
            if (vValue === undefined || vValue === null || vValue === "") {
                return "-";
            }

            return String(vValue);
        },


        onCloseConfirmDialog: function () {
            if (this._oConfirmLinkDialog) {
                this._oConfirmLinkDialog.close();
            }
        },


        _getBackendErrorMessage: function (oError) {
            var sMessage = "";

            try {
                var oBody = JSON.parse(oError.responseText);
                var vMsg = oBody && oBody.error && oBody.error.message;

                sMessage = vMsg && (vMsg.value || (typeof vMsg === "string" ? vMsg : ""));
            } catch (e) {
                // fall through
            }

            if (!sMessage) {
                var aMessages = sap.ui.getCore()
                    .getMessageManager()
                    .getMessageModel()
                    .getData();

                if (aMessages.length > 0) {
                    sMessage = aMessages[0].message;
                }
            }

            return sMessage || "Linking the documents failed. Please try again.";
        },


        onConfirmLinkDocuments: function () {
            var that = this;
            var oModel = this.getView().getModel();
            var oContext = this.getView().getBindingContext();
            var oData = oContext.getObject();

            var mCb = this._mLinkDocCheckboxes || {};

            var fnChecked = function (sKey) {
                return mCb[sKey] ? mCb[sKey].getSelected() : false;
            };

            var bLinePrice = (this._aLineRows || []).length > 0;

            this._oConfirmLinkDialog.setBusy(true);

            oModel.callFunction("/Linkdocs", {
                method: "POST",
                urlParameters: {
                    salesDoc: oData.salesDoc,
                    qt_salesDoc: oData.qt_salesDoc,
                    item: oData.item,
                    qt_item: oData.qt_item,
                    material: oData.material,

                    payment_terms: fnChecked("paymentTerms"),
                    Pricing_partner: fnChecked("pricingPartner"),
                    Sales_representative: fnChecked("salesResponsible"),
                    Object_partner: fnChecked("objectPartner"),
                    Ref_customer: fnChecked("refCustomer"),

                    Line_material: false,
                    Line_description: false,
                    Line_quantity: false,
                    Line_unit_price: bLinePrice
                },

                success: function () {
                    console.log("LINKDOCS SUCCESS CALLBACK HIT");

                    var aMessages = sap.ui.getCore()
                        .getMessageManager()
                        .getMessageModel()
                        .getData();

                    var sMessage = aMessages.length > 0
                        ? aMessages[0].message
                        : "Documents linked successfully";

                    if (that._oConfirmLinkDialog) {
                        that._oConfirmLinkDialog.setBusy(false);
                        that._oConfirmLinkDialog.close();
                    }

                    MessageBox.information(sMessage, {
                        title: "Information",
                        actions: ["Continue"],
                        onClose: function () {
                            console.log("REFRESH FLAG SET FROM LINKDOCS");

                            sessionStorage.setItem(
                                "RefreshAfterAction",
                                "X"
                            );

                            console.log("CALLING HISTORY.BACK FROM LINKDOCS");

                            that._navigateToList();
                            // window.location.reload() removed to prevent slow app reloads
                        }
                    });
                },

                error: function (oError) {
                    console.error("ERROR", oError);

                    if (that._oConfirmLinkDialog) {
                        that._oConfirmLinkDialog.setBusy(false);
                    }

                    MessageBox.error(that._getBackendErrorMessage(oError));
                }
            });
        },


        onAfterRendering: function () {
            console.log("HIDING SPINNER");
            BusyIndicator.hide();

            this._refreshMatchModel();

            setTimeout(function () {
                var oTitleButton = document.getElementById("shellAppTitle-button");

                if (oTitleButton) {
                    oTitleButton.style.display = "none";
                }
            }, 1000);
        },


        _navigateToList: function () {
            var sIntent = (window.location.hash || "").split("&/")[0];

            console.log("Navigate to list, intent:", sIntent);

            window.history.go(-1);

            setTimeout(function () {
                var oBtn = document.querySelector('[id*="Return_to_list"]');
                var bObjectPageVisible = !!(oBtn && oBtn.offsetParent !== null);
                var bInnerHashLeft = (window.location.hash || "").indexOf("&/") !== -1;

                console.log("List check -> objectPageVisible:", bObjectPageVisible,
                    "innerHashLeft:", bInnerHashLeft);

                if ((bObjectPageVisible || bInnerHashLeft) && sIntent && sIntent !== "#") {
                    console.log("Still on object page, forcing reload at:", sIntent);
                    window.location.hash = sIntent;
                    window.location.reload();
                }
            }, 1000);
        },


        _executeReturnToList: function () {
            console.log("_executeReturnToList CALLED");

            var sId = document.querySelector('[id*="Return_to_list"]')?.id;

            if (!sId) {
                return;
            }

            var oControl = sap.ui.getCore().byId(sId);

            if (oControl && oControl.firePress) {
                oControl.firePress();
            }
        },


        _getS4Config: function () {
            var sHost = window.location.hostname;

            var sLanguage = sap.ui.getCore()
                .getConfiguration()
                .getLanguage()
                .toUpperCase();

            if (sHost.includes("applicationstudio") || sHost.includes("dev")) {
                return {
                    host: "https://go-s4-dev.sap.bmigroup.com",
                    client: "310",
                    language: sLanguage
                };
            }

            if (sHost.includes("bu4")) {
                return {
                    host: "https://go-s4-bu4.sap.bmigroup.com",
                    client: "400",
                    language: sLanguage
                };
            }

            return {
                host: "https://go-s4.sap.bmigroup.com",
                client: "400",
                language: sLanguage
            };
        },


        onEditLineMatch: function (oEvent) {
            var oRow = oEvent.getSource().getBindingContext().getObject();
            MessageToast.show("Edit line item - to be implemented");
        },


        onExit: function () {
            window.removeEventListener("popstate", this._onBrowserBack);
            window.removeEventListener("resize", this._onResizePin);
            document.removeEventListener("click", this._onDocClick);
            document.body.classList.remove("hideAppTitleArrow");
        }
    };
});